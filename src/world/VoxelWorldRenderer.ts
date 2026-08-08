import { Mesh, VertexData } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { ChunkBuildSuccess } from './ChunkBuildProtocol';
import {
  ChunkBuildCancelledError,
  ChunkWorkerPool,
} from './ChunkWorkerPool';
import {
  registerFurnaceLightRuntime,
  unregisterFurnaceLightRuntime,
} from './FurnaceLightRuntime';
import {
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
  worldToLocalCoordinate,
} from './VoxelChunk';
import { VoxelMaterialLibrary } from './VoxelMaterialLibrary';
import type { VoxelWorldData } from './VoxelWorldData';

interface RenderedChunk {
  readonly mesh: Mesh;
  readonly revision: number;
  readonly quadCount: number;
  readonly sourceFaceCount: number;
  readonly buildMilliseconds: number;
}

interface CompletedChunk {
  readonly key: string;
  readonly revision: number;
  readonly response: ChunkBuildSuccess;
}

interface EditChunkTarget {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly key: string;
  readonly revision: number;
}

export interface VoxelWorldStats {
  readonly loadedChunks: number;
  readonly desiredChunks: number;
  readonly pendingChunks: number;
  readonly cachedChunks: number;
  readonly cancelledBuilds: number;
  readonly visibleQuads: number;
  readonly sourceFaces: number;
  readonly centerChunkX: number;
  readonly centerChunkZ: number;
  readonly averageBuildMilliseconds: number;
}

const MAXIMUM_MESH_UPLOADS_PER_FRAME = 2;
const RECENT_CHUNK_CACHE_LIMIT = 24;
const BLOCK_EDIT_PRIORITY = -10_000;
const FORWARD_PREFETCH_MINIMUM_TRAVEL = 0.012;

/**
 * Returns only chunks whose geometry can change when one voxel changes. A
 * voxel can expose faces in its own chunk plus a cardinal neighbor when it is
 * exactly on an X/Z chunk boundary. Diagonal chunks never share a block face.
 */
export function getBlockEditGeometryChunks(
  worldX: number,
  worldZ: number,
): readonly (readonly [chunkX: number, chunkZ: number])[] {
  const chunkX = worldToChunkCoordinate(worldX);
  const chunkZ = worldToChunkCoordinate(worldZ);
  const localX = worldToLocalCoordinate(worldX);
  const localZ = worldToLocalCoordinate(worldZ);
  const chunks: [number, number][] = [[chunkX, chunkZ]];

  if (localX === 0) chunks.push([chunkX - 1, chunkZ]);
  else if (localX === CHUNK_SIZE - 1) chunks.push([chunkX + 1, chunkZ]);

  if (localZ === 0) chunks.push([chunkX, chunkZ - 1]);
  else if (localZ === CHUNK_SIZE - 1) chunks.push([chunkX, chunkZ + 1]);

  return chunks;
}

/** Streams a bounded, cancellable, direction-aware chunk window. */
export class VoxelWorldRenderer {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #renderRadius: number;
  readonly #materials: VoxelMaterialLibrary;
  readonly #workers = new ChunkWorkerPool();
  readonly #editWorkers = new ChunkWorkerPool(1);
  readonly #chunks = new Map<string, RenderedChunk>();
  readonly #recentChunks = new Map<string, RenderedChunk>();
  readonly #desiredKeys = new Set<string>();
  readonly #revisions = new Map<string, number>();
  readonly #pendingRevisions = new Map<string, number>();
  readonly #completed: CompletedChunk[] = [];
  readonly #afterUpdate = new Map<string, (() => void)[]>();
  #centerChunkX: number | null = null;
  #centerChunkZ: number | null = null;
  #lastPlayerX: number | null = null;
  #lastPlayerZ: number | null = null;
  #travelX = 0;
  #travelZ = 0;
  #disposed = false;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    renderRadius = 2,
  ) {
    if (!Number.isInteger(renderRadius) || renderRadius < 0) {
      throw new RangeError('renderRadius must be a non-negative integer.');
    }

    this.#scene = scene;
    this.#world = world;
    this.#renderRadius = renderRadius;
    this.#materials = new VoxelMaterialLibrary(scene);
    registerFurnaceLightRuntime(world, this);
  }

  public async initialize(playerX: number, playerZ: number): Promise<void> {
    const centerChunkX = worldToChunkCoordinate(Math.floor(playerX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(playerZ));
    this.#centerChunkX = centerChunkX;
    this.#centerChunkZ = centerChunkZ;
    this.#lastPlayerX = playerX;
    this.#lastPlayerZ = playerZ;
    this.#updateDesiredKeys(centerChunkX, centerChunkZ);

    const centerKey = createChunkKey(centerChunkX, centerChunkZ);
    const revision = this.#getRevision(centerKey);
    const response = await this.#buildChunk(
      centerChunkX,
      centerChunkZ,
      centerKey,
      0,
    );
    if (!this.#disposed) {
      this.#applyChunk(centerKey, revision, response);
      this.#scheduleMissingChunks();
    }
  }

  public update(playerX: number, playerZ: number): VoxelWorldStats {
    this.#trackTravel(playerX, playerZ);
    this.#applyCompletedChunks();
    const centerChunkX = worldToChunkCoordinate(Math.floor(playerX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(playerZ));

    if (
      centerChunkX !== this.#centerChunkX ||
      centerChunkZ !== this.#centerChunkZ
    ) {
      this.#centerChunkX = centerChunkX;
      this.#centerChunkZ = centerChunkZ;
      this.#updateDesiredKeys(centerChunkX, centerChunkZ);
      this.#cancelUndesiredWork();
      this.#unloadDistantChunks();
      this.#scheduleMissingChunks();
    }

    return this.getStats();
  }

  public invalidateBlock(worldX: number, worldY: number, worldZ: number): void {
    if (!Number.isInteger(worldY)) {
      throw new RangeError('worldY must be an integer.');
    }
    const centerChunkX = worldToChunkCoordinate(worldX);
    const centerChunkZ = worldToChunkCoordinate(worldZ);
    const targets = getBlockEditGeometryChunks(worldX, worldZ)
      .filter(([chunkX, chunkZ]) =>
        this.#desiredKeys.has(createChunkKey(chunkX, chunkZ)),
      )
      .map(([chunkX, chunkZ]) => this.#prepareEditChunk(chunkX, chunkZ));

    if (targets.length === 0) {
      this.#invalidateLightingNeighborhood(centerChunkX, centerChunkZ, true);
      return;
    }

    // A dedicated edit worker skips the expensive full light-field rebuild.
    // Boundary-sharing chunks are built as one transaction and all meshes are
    // swapped inside the same task, before the browser can paint between them.
    // This removes both multi-second mining latency and the transient void seam
    // that occurred when one side of a chunk boundary updated first.
    void Promise.all(targets.map((target) => this.#buildEditChunk(target)))
      .then((responses) => {
        if (this.#disposed) return;
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          const response = responses[index];
          if (
            target === undefined ||
            response === undefined ||
            !this.#desiredKeys.has(target.key) ||
            this.#getRevision(target.key) !== target.revision
          ) {
            return;
          }
        }

        // Apply every geometry mesh synchronously in this continuation. The
        // browser cannot present an intermediate half-updated boundary.
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          const response = responses[index];
          if (target !== undefined && response !== undefined) {
            this.#applyChunk(target.key, target.revision, response);
          }
        }

        // Geometry is already correct and visible now. Relighting is deliberately
        // background work and can replace these temporary full-bright vertices
        // later without exposing missing faces.
        this.#invalidateLightingNeighborhood(centerChunkX, centerChunkZ, true);
      })
      .catch((error: unknown) => {
        if (error instanceof ChunkBuildCancelledError || this.#disposed) return;
        console.error('Failed to build immediate voxel edit geometry.', error);
        this.#invalidateLightingNeighborhood(centerChunkX, centerChunkZ, true);
      });
  }

  public invalidateLightEmitter(worldX: number, worldZ: number): void {
    const chunkX = worldToChunkCoordinate(worldX);
    const chunkZ = worldToChunkCoordinate(worldZ);
    this.#invalidateLightingNeighborhood(chunkX, chunkZ, true);
  }

  public afterNextBlockUpdate(
    worldX: number,
    worldZ: number,
    callback: () => void,
  ): void {
    const key = createChunkKey(
      worldToChunkCoordinate(worldX),
      worldToChunkCoordinate(worldZ),
    );
    const callbacks = this.#afterUpdate.get(key) ?? [];
    callbacks.push(callback);
    this.#afterUpdate.set(key, callbacks);
  }

  public invalidateAll(): void {
    this.#disposeRecentChunks();
    for (const key of this.#desiredKeys) {
      const coordinates = this.#parseChunkKey(key);
      this.#invalidateChunk(coordinates[0], coordinates[1]);
    }
  }

  public getStats(): VoxelWorldStats {
    let visibleQuads = 0;
    let sourceFaces = 0;
    let totalBuildMilliseconds = 0;
    for (const chunk of this.#chunks.values()) {
      visibleQuads += chunk.quadCount;
      sourceFaces += chunk.sourceFaceCount;
      totalBuildMilliseconds += chunk.buildMilliseconds;
    }

    return {
      loadedChunks: this.#chunks.size,
      desiredChunks: this.#desiredKeys.size,
      pendingChunks:
        this.#workers.queuedCount +
        this.#editWorkers.queuedCount +
        this.#completed.length,
      cachedChunks: this.#recentChunks.size,
      cancelledBuilds:
        this.#workers.cancelledCount + this.#editWorkers.cancelledCount,
      visibleQuads,
      sourceFaces,
      centerChunkX: this.#centerChunkX ?? 0,
      centerChunkZ: this.#centerChunkZ ?? 0,
      averageBuildMilliseconds:
        this.#chunks.size === 0 ? 0 : totalBuildMilliseconds / this.#chunks.size,
    };
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    unregisterFurnaceLightRuntime(this);
    this.#workers.dispose();
    this.#editWorkers.dispose();
    for (const chunk of this.#chunks.values()) {
      chunk.mesh.dispose(false, false);
    }
    this.#chunks.clear();
    this.#disposeRecentChunks();
    this.#desiredKeys.clear();
    this.#pendingRevisions.clear();
    this.#completed.length = 0;
    this.#afterUpdate.clear();
    this.#materials.dispose();
  }

  #trackTravel(playerX: number, playerZ: number): void {
    if (this.#lastPlayerX !== null && this.#lastPlayerZ !== null) {
      const deltaX = playerX - this.#lastPlayerX;
      const deltaZ = playerZ - this.#lastPlayerZ;
      this.#travelX = this.#travelX * 0.84 + deltaX * 0.16;
      this.#travelZ = this.#travelZ * 0.84 + deltaZ * 0.16;
    }
    this.#lastPlayerX = playerX;
    this.#lastPlayerZ = playerZ;
  }

  #invalidateLightingNeighborhood(
    centerChunkX: number,
    centerChunkZ: number,
    includeCenter: boolean,
  ): void {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!includeCenter && offsetX === 0 && offsetZ === 0) continue;
        this.#invalidateChunk(centerChunkX + offsetX, centerChunkZ + offsetZ);
      }
    }
  }

  #updateDesiredKeys(centerChunkX: number, centerChunkZ: number): void {
    this.#desiredKeys.clear();
    for (
      let chunkZ = centerChunkZ - this.#renderRadius;
      chunkZ <= centerChunkZ + this.#renderRadius;
      chunkZ += 1
    ) {
      for (
        let chunkX = centerChunkX - this.#renderRadius;
        chunkX <= centerChunkX + this.#renderRadius;
        chunkX += 1
      ) {
        this.#desiredKeys.add(createChunkKey(chunkX, chunkZ));
      }
    }

    // Prefetch one thin strip in the dominant travel direction instead of
    // increasing the whole render radius. That gives walking players terrain
    // ahead sooner without nearly doubling total chunk generation work.
    const travelLength = Math.hypot(this.#travelX, this.#travelZ);
    if (travelLength < FORWARD_PREFETCH_MINIMUM_TRAVEL) return;
    if (Math.abs(this.#travelX) >= Math.abs(this.#travelZ)) {
      const leadX = Math.sign(this.#travelX);
      if (leadX === 0) return;
      const chunkX = centerChunkX + leadX * (this.#renderRadius + 1);
      for (
        let chunkZ = centerChunkZ - this.#renderRadius;
        chunkZ <= centerChunkZ + this.#renderRadius;
        chunkZ += 1
      ) {
        this.#desiredKeys.add(createChunkKey(chunkX, chunkZ));
      }
      return;
    }

    const leadZ = Math.sign(this.#travelZ);
    if (leadZ === 0) return;
    const chunkZ = centerChunkZ + leadZ * (this.#renderRadius + 1);
    for (
      let chunkX = centerChunkX - this.#renderRadius;
      chunkX <= centerChunkX + this.#renderRadius;
      chunkX += 1
    ) {
      this.#desiredKeys.add(createChunkKey(chunkX, chunkZ));
    }
  }

  #cancelUndesiredWork(): void {
    this.#workers.cancelExcept(this.#desiredKeys);
    this.#editWorkers.cancelExcept(this.#desiredKeys);
    for (const key of this.#pendingRevisions.keys()) {
      if (!this.#desiredKeys.has(key)) this.#pendingRevisions.delete(key);
    }
    for (let index = this.#completed.length - 1; index >= 0; index -= 1) {
      const completed = this.#completed[index];
      if (completed !== undefined && !this.#desiredKeys.has(completed.key)) {
        this.#completed.splice(index, 1);
      }
    }
  }

  #unloadDistantChunks(): void {
    for (const [key, chunk] of this.#chunks) {
      if (this.#desiredKeys.has(key)) continue;
      chunk.mesh.setEnabled(false);
      this.#chunks.delete(key);
      this.#afterUpdate.delete(key);
      this.#cacheRecentChunk(key, chunk);
    }
  }

  #cacheRecentChunk(key: string, chunk: RenderedChunk): void {
    const previous = this.#recentChunks.get(key);
    previous?.mesh.dispose(false, false);
    this.#recentChunks.delete(key);
    this.#recentChunks.set(key, chunk);

    while (this.#recentChunks.size > RECENT_CHUNK_CACHE_LIMIT) {
      const oldestKey = this.#recentChunks.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.#recentChunks.get(oldestKey);
      this.#recentChunks.delete(oldestKey);
      oldest?.mesh.dispose(false, false);
    }
  }

  #restoreRecentChunk(key: string): boolean {
    const cached = this.#recentChunks.get(key);
    if (cached === undefined) return false;
    this.#recentChunks.delete(key);
    if (cached.revision !== this.#getRevision(key)) {
      cached.mesh.dispose(false, false);
      return false;
    }
    cached.mesh.setEnabled(true);
    this.#chunks.set(key, cached);
    return true;
  }

  #disposeRecentChunks(): void {
    for (const chunk of this.#recentChunks.values()) {
      chunk.mesh.dispose(false, false);
    }
    this.#recentChunks.clear();
  }

  #scheduleMissingChunks(): void {
    const coordinates: (readonly [number, number, number])[] = [];
    for (const key of this.#desiredKeys) {
      if (this.#chunks.has(key) || this.#restoreRecentChunk(key)) continue;
      const [chunkX, chunkZ] = this.#parseChunkKey(key);
      coordinates.push([
        chunkX,
        chunkZ,
        this.#getPriority(chunkX, chunkZ),
      ]);
    }
    coordinates.sort((left, right) => left[2] - right[2]);

    for (const [chunkX, chunkZ, priority] of coordinates) {
      this.#scheduleChunk(chunkX, chunkZ, priority);
    }
  }

  #prepareEditChunk(chunkX: number, chunkZ: number): EditChunkTarget {
    const key = createChunkKey(chunkX, chunkZ);
    this.#discardRecentChunk(key);
    this.#workers.cancel(key);
    this.#editWorkers.cancel(key);
    this.#pendingRevisions.delete(key);
    const revision = this.#getRevision(key) + 1;
    this.#revisions.set(key, revision);
    return { chunkX, chunkZ, key, revision };
  }

  #buildEditChunk(target: EditChunkTarget): Promise<ChunkBuildSuccess> {
    return this.#editWorkers.buildChunk(
      {
        worldSeed: this.#world.worldSeed,
        chunkX: target.chunkX,
        chunkZ: target.chunkZ,
        modifications: this.#world.getBuildModifications(
          target.chunkX,
          target.chunkZ,
        ),
        mode: 'geometry-only',
      },
      { jobKey: target.key, priority: BLOCK_EDIT_PRIORITY },
    );
  }

  #invalidateChunk(
    chunkX: number,
    chunkZ: number,
    priorityOverride?: number,
  ): void {
    const key = createChunkKey(chunkX, chunkZ);
    this.#discardRecentChunk(key);
    this.#workers.cancel(key);
    this.#editWorkers.cancel(key);
    this.#pendingRevisions.delete(key);
    this.#revisions.set(key, this.#getRevision(key) + 1);
    if (this.#desiredKeys.has(key)) {
      this.#scheduleChunk(
        chunkX,
        chunkZ,
        priorityOverride ?? this.#getPriority(chunkX, chunkZ),
      );
    }
  }

  #discardRecentChunk(key: string): void {
    const recent = this.#recentChunks.get(key);
    if (recent === undefined) return;
    this.#recentChunks.delete(key);
    recent.mesh.dispose(false, false);
  }

  #scheduleChunk(chunkX: number, chunkZ: number, priority: number): void {
    if (this.#disposed) return;
    const key = createChunkKey(chunkX, chunkZ);
    const revision = this.#getRevision(key);
    if (this.#pendingRevisions.get(key) === revision) return;
    this.#pendingRevisions.set(key, revision);

    void this.#buildChunk(chunkX, chunkZ, key, priority)
      .then((response) => {
        if (!this.#disposed) this.#completed.push({ key, revision, response });
      })
      .catch((error: unknown) => {
        if (this.#pendingRevisions.get(key) === revision) {
          this.#pendingRevisions.delete(key);
        }
        if (!(error instanceof ChunkBuildCancelledError)) {
          console.error(`Failed to build voxel chunk ${key}.`, error);
        }
      });
  }

  #buildChunk(
    chunkX: number,
    chunkZ: number,
    key: string,
    priority: number,
  ): Promise<ChunkBuildSuccess> {
    return this.#workers.buildChunk(
      {
        worldSeed: this.#world.worldSeed,
        chunkX,
        chunkZ,
        modifications: this.#world.getBuildModifications(chunkX, chunkZ),
        lightEmitters: this.#world.getBuildLightEmitters(chunkX, chunkZ),
        mode: 'full',
      },
      { jobKey: key, priority },
    );
  }

  #applyCompletedChunks(): void {
    let applied = 0;
    while (
      applied < MAXIMUM_MESH_UPLOADS_PER_FRAME &&
      this.#completed.length > 0
    ) {
      const completed = this.#completed.shift();
      if (completed === undefined) break;
      if (this.#pendingRevisions.get(completed.key) === completed.revision) {
        this.#pendingRevisions.delete(completed.key);
      }
      if (
        this.#desiredKeys.has(completed.key) &&
        this.#getRevision(completed.key) === completed.revision
      ) {
        this.#applyChunk(
          completed.key,
          completed.revision,
          completed.response,
        );
        applied += 1;
      }
    }
  }

  #applyChunk(
    key: string,
    revision: number,
    response: ChunkBuildSuccess,
  ): void {
    if (this.#getRevision(key) !== revision) return;

    const mesh = new Mesh(`voxel-chunk-${key}`, this.#scene);
    mesh.position.set(
      response.chunkX * CHUNK_SIZE,
      0,
      response.chunkZ * CHUNK_SIZE,
    );
    mesh.useVertexColors = true;
    mesh.isPickable = true;
    mesh.metadata = { cameraBlocker: true, chunkKey: key };

    const vertexData = new VertexData();
    vertexData.positions = response.meshData.positions;
    vertexData.normals = response.meshData.normals;
    vertexData.indices = response.meshData.indices;
    vertexData.colors = response.meshData.colors;
    vertexData.uvs = response.meshData.uvs;
    vertexData.applyToMesh(mesh, false);
    this.#materials.applyToMesh(
      mesh,
      response.meshData.materialRanges,
      response.meshData.positions.length / 3,
    );
    mesh.freezeWorldMatrix();
    mesh.freezeNormals();

    this.#discardRecentChunk(key);
    const previous = this.#chunks.get(key);
    this.#chunks.set(key, {
      mesh,
      revision,
      quadCount: response.meshData.quadCount,
      sourceFaceCount: response.meshData.sourceFaceCount,
      buildMilliseconds: response.buildMilliseconds,
    });
    previous?.mesh.dispose(false, false);

    const callbacks = this.#afterUpdate.get(key);
    if (callbacks !== undefined) {
      this.#afterUpdate.delete(key);
      for (const callback of callbacks) callback();
    }
  }

  #getPriority(chunkX: number, chunkZ: number): number {
    const centerX = this.#centerChunkX ?? chunkX;
    const centerZ = this.#centerChunkZ ?? chunkZ;
    const deltaX = chunkX - centerX;
    const deltaZ = chunkZ - centerZ;
    const manhattan = Math.abs(deltaX) + Math.abs(deltaZ);
    const travelLength = Math.hypot(this.#travelX, this.#travelZ);
    const forwardBias =
      travelLength > 0.0001
        ? (deltaX * this.#travelX + deltaZ * this.#travelZ) / travelLength
        : 0;
    return manhattan * 100 + Math.hypot(deltaX, deltaZ) - forwardBias * 18;
  }

  #getRevision(key: string): number {
    return this.#revisions.get(key) ?? 0;
  }

  #parseChunkKey(key: string): readonly [number, number] {
    const separator = key.indexOf(',');
    if (separator < 0) throw new Error(`Invalid chunk key: ${key}`);
    const chunkX = Number(key.slice(0, separator));
    const chunkZ = Number(key.slice(separator + 1));
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
      throw new Error(`Invalid chunk key: ${key}`);
    }
    return [chunkX, chunkZ];
  }
}
