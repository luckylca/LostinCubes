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
  CHUNK_HEIGHT,
  CHUNK_SECTION_COUNT,
  CHUNK_SECTION_HEIGHT,
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
  worldToLocalCoordinate,
  worldYToSectionIndex,
} from './VoxelChunk';
import { VoxelMaterialLibrary } from './VoxelMaterialLibrary';
import type { VoxelWorldData } from './VoxelWorldData';

interface RenderedSection {
  readonly mesh: Mesh;
  readonly quadCount: number;
  readonly sourceFaceCount: number;
}

interface RenderedChunk {
  readonly sections: ReadonlyMap<number, RenderedSection>;
  readonly revision: number;
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
  readonly sectionIndices: readonly number[];
}

export interface VoxelWorldStats {
  readonly loadedChunks: number;
  readonly desiredChunks: number;
  readonly pendingChunks: number;
  readonly criticalPendingChunks: number;
  readonly nearFieldReady: boolean;
  readonly cachedChunks: number;
  readonly cancelledBuilds: number;
  readonly visibleQuads: number;
  readonly sourceFaces: number;
  readonly centerChunkX: number;
  readonly centerChunkZ: number;
  readonly averageBuildMilliseconds: number;
}

const MAXIMUM_URGENT_MESH_UPLOADS_PER_FRAME = 2;
const MAXIMUM_BACKGROUND_MESH_UPLOADS_PER_FRAME = 1;
const RECENT_CHUNK_CACHE_LIMIT = 36;
const BLOCK_EDIT_PRIORITY = -10_000;
const CRITICAL_CHUNK_PRIORITY = -100_000;
const BACKGROUND_RELIGHT_PRIORITY = 10_000;
const FORWARD_PREFETCH_MINIMUM_TRAVEL = 0.012;
const EDIT_RELIGHT_DEBOUNCE_MILLISECONDS = 220;
const BUSY_RELIGHT_RETRY_MILLISECONDS = 120;
const NEAR_FIELD_RADIUS = 1;

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

/** Sections whose geometry can change when a voxel at worldY changes. */
export function getBlockEditSectionIndices(worldY: number): readonly number[] {
  if (!Number.isInteger(worldY) || worldY < 0 || worldY >= CHUNK_HEIGHT) {
    return [];
  }
  const sectionIndex = worldYToSectionIndex(worldY);
  const localSectionY = worldY % CHUNK_SECTION_HEIGHT;
  const sections = [sectionIndex];
  if (localSectionY === 0 && sectionIndex > 0) sections.push(sectionIndex - 1);
  if (
    localSectionY === CHUNK_SECTION_HEIGHT - 1 &&
    sectionIndex < CHUNK_SECTION_COUNT - 1
  ) {
    sections.push(sectionIndex + 1);
  }
  return sections.sort((a, b) => a - b);
}

export function getNearFieldChunkKeys(
  centerChunkX: number,
  centerChunkZ: number,
): readonly string[] {
  const keys: string[] = [];
  for (
    let offsetZ = -NEAR_FIELD_RADIUS;
    offsetZ <= NEAR_FIELD_RADIUS;
    offsetZ += 1
  ) {
    for (
      let offsetX = -NEAR_FIELD_RADIUS;
      offsetX <= NEAR_FIELD_RADIUS;
      offsetX += 1
    ) {
      keys.push(createChunkKey(centerChunkX + offsetX, centerChunkZ + offsetZ));
    }
  }
  return keys;
}

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
  readonly #criticalKeys = new Set<string>();
  readonly #urgentKeys = new Set<string>();
  readonly #revisions = new Map<string, number>();
  readonly #pendingRevisions = new Map<string, number>();
  readonly #completed: CompletedChunk[] = [];
  readonly #afterUpdate = new Map<string, (() => void)[]>();
  readonly #deferredRelightKeys = new Set<string>();
  readonly #editDirtySections = new Map<string, Set<number>>();
  #relightTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (!Number.isInteger(renderRadius) || renderRadius < NEAR_FIELD_RADIUS) {
      throw new RangeError(
        `renderRadius must be an integer >= ${String(NEAR_FIELD_RADIUS)}.`,
      );
    }

    this.#scene = scene;
    this.#world = world;
    this.#renderRadius = renderRadius;
    this.#materials = new VoxelMaterialLibrary(scene);
    registerFurnaceLightRuntime(world, this);
  }

  public async initialize(playerX: number, playerZ: number): Promise<void> {
    await this.prepareNearField(playerX, playerZ);
  }

  /**
   * Re-centers streaming and resolves only after the destination 3×3 safety
   * window has completed worker generation and GPU upload. Death/teleport flows
   * can keep a loading overlay visible while awaiting this instead of moving the
   * player first and stalling on an unloaded destination.
   */
  public async prepareNearField(playerX: number, playerZ: number): Promise<void> {
    if (this.#disposed) return;
    const centerChunkX = worldToChunkCoordinate(Math.floor(playerX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(playerZ));
    this.#centerChunkX = centerChunkX;
    this.#centerChunkZ = centerChunkZ;
    this.#lastPlayerX = playerX;
    this.#lastPlayerZ = playerZ;
    this.#travelX = 0;
    this.#travelZ = 0;
    this.#updateDesiredKeys(centerChunkX, centerChunkZ);
    this.#cancelUndesiredWork();
    this.#unloadDistantChunks();

    const initialTargets = [...this.#criticalKeys]
      .map((key) => {
        if (this.#chunks.has(key) || this.#restoreRecentChunk(key)) return null;
        const [chunkX, chunkZ] = this.#parseChunkKey(key);
        this.#workers.cancel(key);
        this.#pendingRevisions.delete(key);
        return {
          key,
          chunkX,
          chunkZ,
          distance:
            Math.abs(chunkX - centerChunkX) + Math.abs(chunkZ - centerChunkZ),
          revision: this.#getRevision(key),
        };
      })
      .filter((target): target is NonNullable<typeof target> => target !== null)
      .sort((left, right) => left.distance - right.distance);

    const responses = await Promise.all(
      initialTargets.map((target) =>
        this.#buildChunk(
          target.chunkX,
          target.chunkZ,
          target.key,
          CRITICAL_CHUNK_PRIORITY + target.distance,
        ),
      ),
    );
    if (this.#disposed) return;
    for (let index = 0; index < initialTargets.length; index += 1) {
      const target = initialTargets[index];
      if (target !== undefined) {
        this.#applyChunk(target.key, target.revision, responses[index]);
      }
    }
    this.#scheduleMissingChunks();
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

  public ensureNearFieldReady(worldX: number, worldZ: number): boolean {
    if (this.#disposed) return false;
    const centerChunkX = worldToChunkCoordinate(Math.floor(worldX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(worldZ));
    let ready = true;

    for (const key of getNearFieldChunkKeys(centerChunkX, centerChunkZ)) {
      this.#desiredKeys.add(key);
      if (this.#chunks.has(key) || this.#restoreRecentChunk(key)) {
        this.#urgentKeys.delete(key);
        continue;
      }
      ready = false;
      if (this.#urgentKeys.has(key)) continue;

      this.#urgentKeys.add(key);
      const [chunkX, chunkZ] = this.#parseChunkKey(key);
      const revision = this.#getRevision(key);
      if (this.#pendingRevisions.get(key) === revision) {
        this.#workers.cancel(key);
        this.#pendingRevisions.delete(key);
      }
      const distance =
        Math.abs(chunkX - centerChunkX) + Math.abs(chunkZ - centerChunkZ);
      this.#scheduleChunk(
        chunkX,
        chunkZ,
        CRITICAL_CHUNK_PRIORITY + distance,
      );
    }
    return ready;
  }

  public invalidateBlock(worldX: number, worldY: number, worldZ: number): void {
    if (!Number.isInteger(worldY)) {
      throw new RangeError('worldY must be an integer.');
    }
    const centerChunkX = worldToChunkCoordinate(worldX);
    const centerChunkZ = worldToChunkCoordinate(worldZ);
    const sectionIndices = getBlockEditSectionIndices(worldY);
    const targets = getBlockEditGeometryChunks(worldX, worldZ)
      .filter(([chunkX, chunkZ]) =>
        this.#desiredKeys.has(createChunkKey(chunkX, chunkZ)),
      )
      .map(([chunkX, chunkZ]) =>
        this.#prepareEditChunk(chunkX, chunkZ, sectionIndices),
      );

    if (targets.length === 0 || sectionIndices.length === 0) {
      this.#queueLightingNeighborhood(centerChunkX, centerChunkZ, true);
      return;
    }

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

        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          const response = responses[index];
          if (target !== undefined && response !== undefined) {
            this.#applyChunk(target.key, target.revision, response);
            this.#editDirtySections.delete(target.key);
          }
        }

        this.#queueLightingNeighborhood(centerChunkX, centerChunkZ, true);
      })
      .catch((error: unknown) => {
        if (error instanceof ChunkBuildCancelledError || this.#disposed) return;
        console.error('Failed to build immediate voxel edit geometry.', error);
        this.#queueLightingNeighborhood(centerChunkX, centerChunkZ, true);
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
    if (this.#relightTimer !== null) {
      clearTimeout(this.#relightTimer);
      this.#relightTimer = null;
    }
    this.#deferredRelightKeys.clear();
    this.#editDirtySections.clear();
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
      for (const section of chunk.sections.values()) {
        visibleQuads += section.quadCount;
        sourceFaces += section.sourceFaceCount;
      }
      totalBuildMilliseconds += chunk.buildMilliseconds;
    }

    return {
      loadedChunks: this.#chunks.size,
      desiredChunks: this.#desiredKeys.size,
      pendingChunks:
        this.#workers.queuedCount +
        this.#editWorkers.queuedCount +
        this.#completed.length,
      criticalPendingChunks: this.#urgentKeys.size,
      nearFieldReady:
        this.#criticalKeys.size > 0 &&
        [...this.#criticalKeys].every((key) => this.#chunks.has(key)),
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
    if (this.#relightTimer !== null) {
      clearTimeout(this.#relightTimer);
      this.#relightTimer = null;
    }
    this.#deferredRelightKeys.clear();
    unregisterFurnaceLightRuntime(this);
    this.#workers.dispose();
    this.#editWorkers.dispose();
    for (const chunk of this.#chunks.values()) this.#disposeChunkMeshes(chunk);
    this.#chunks.clear();
    this.#disposeRecentChunks();
    this.#desiredKeys.clear();
    this.#criticalKeys.clear();
    this.#urgentKeys.clear();
    this.#pendingRevisions.clear();
    this.#editDirtySections.clear();
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

  #queueLightingNeighborhood(
    centerChunkX: number,
    centerChunkZ: number,
    includeCenter: boolean,
  ): void {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!includeCenter && offsetX === 0 && offsetZ === 0) continue;
        this.#deferredRelightKeys.add(
          createChunkKey(centerChunkX + offsetX, centerChunkZ + offsetZ),
        );
      }
    }
    this.#scheduleRelightFlush(EDIT_RELIGHT_DEBOUNCE_MILLISECONDS);
  }

  #scheduleRelightFlush(delayMilliseconds: number): void {
    if (this.#relightTimer !== null) clearTimeout(this.#relightTimer);
    this.#relightTimer = setTimeout(() => {
      this.#relightTimer = null;
      this.#flushDeferredRelighting();
    }, delayMilliseconds);
  }

  #flushDeferredRelighting(): void {
    if (this.#disposed || this.#deferredRelightKeys.size === 0) return;
    if (this.#urgentKeys.size > 0 || this.#editWorkers.queuedCount > 0) {
      this.#scheduleRelightFlush(BUSY_RELIGHT_RETRY_MILLISECONDS);
      return;
    }

    const keys = [...this.#deferredRelightKeys];
    this.#deferredRelightKeys.clear();
    for (const key of keys) {
      const [chunkX, chunkZ] = this.#parseChunkKey(key);
      const distancePriority = Math.max(this.#getPriority(chunkX, chunkZ), 0);
      this.#invalidateChunk(
        chunkX,
        chunkZ,
        BACKGROUND_RELIGHT_PRIORITY + distancePriority,
      );
    }
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
    this.#criticalKeys.clear();
    for (const key of getNearFieldChunkKeys(centerChunkX, centerChunkZ)) {
      this.#criticalKeys.add(key);
    }

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
    for (const key of [...this.#urgentKeys]) {
      if (!this.#desiredKeys.has(key)) this.#urgentKeys.delete(key);
    }
    for (const key of [...this.#editDirtySections.keys()]) {
      if (!this.#desiredKeys.has(key)) this.#editDirtySections.delete(key);
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
      this.#setChunkEnabled(chunk, false);
      this.#chunks.delete(key);
      this.#afterUpdate.delete(key);
      this.#cacheRecentChunk(key, chunk);
    }
  }

  #cacheRecentChunk(key: string, chunk: RenderedChunk): void {
    const previous = this.#recentChunks.get(key);
    if (previous !== undefined) this.#disposeChunkMeshes(previous);
    this.#recentChunks.delete(key);
    this.#recentChunks.set(key, chunk);

    while (this.#recentChunks.size > RECENT_CHUNK_CACHE_LIMIT) {
      const oldestKey = this.#recentChunks.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.#recentChunks.get(oldestKey);
      this.#recentChunks.delete(oldestKey);
      if (oldest !== undefined) this.#disposeChunkMeshes(oldest);
    }
  }

  #restoreRecentChunk(key: string): boolean {
    const cached = this.#recentChunks.get(key);
    if (cached === undefined) return false;
    this.#recentChunks.delete(key);
    if (cached.revision !== this.#getRevision(key)) {
      this.#disposeChunkMeshes(cached);
      return false;
    }
    this.#setChunkEnabled(cached, true);
    this.#chunks.set(key, cached);
    this.#urgentKeys.delete(key);
    return true;
  }

  #disposeRecentChunks(): void {
    for (const chunk of this.#recentChunks.values()) this.#disposeChunkMeshes(chunk);
    this.#recentChunks.clear();
  }

  #scheduleMissingChunks(): void {
    const coordinates: (readonly [number, number, number])[] = [];
    for (const key of this.#desiredKeys) {
      if (this.#chunks.has(key) || this.#restoreRecentChunk(key)) continue;
      const [chunkX, chunkZ] = this.#parseChunkKey(key);
      const priority = this.#criticalKeys.has(key)
        ? CRITICAL_CHUNK_PRIORITY +
          Math.abs(chunkX - (this.#centerChunkX ?? chunkX)) +
          Math.abs(chunkZ - (this.#centerChunkZ ?? chunkZ))
        : this.#getPriority(chunkX, chunkZ);
      coordinates.push([chunkX, chunkZ, priority]);
    }
    coordinates.sort((left, right) => left[2] - right[2]);

    for (const [chunkX, chunkZ, priority] of coordinates) {
      this.#scheduleChunk(chunkX, chunkZ, priority);
    }
  }

  #prepareEditChunk(
    chunkX: number,
    chunkZ: number,
    sectionIndices: readonly number[],
  ): EditChunkTarget {
    const key = createChunkKey(chunkX, chunkZ);
    this.#discardRecentChunk(key);
    this.#workers.cancel(key);
    this.#editWorkers.cancel(key);
    this.#pendingRevisions.delete(key);
    const dirty = this.#editDirtySections.get(key) ?? new Set<number>();
    for (const sectionIndex of sectionIndices) dirty.add(sectionIndex);
    this.#editDirtySections.set(key, dirty);
    const revision = this.#getRevision(key) + 1;
    this.#revisions.set(key, revision);
    return {
      chunkX,
      chunkZ,
      key,
      revision,
      sectionIndices: [...dirty].sort((a, b) => a - b),
    };
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
        sectionIndices: target.sectionIndices,
      },
      {
        jobKey: target.key,
        priority: BLOCK_EDIT_PRIORITY,
        replacement: 'latest',
      },
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
    this.#editDirtySections.delete(key);
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
    this.#disposeChunkMeshes(recent);
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
    const hasUrgentCompletion = this.#completed.some((item) =>
      this.#urgentKeys.has(item.key),
    );
    const uploadBudget = hasUrgentCompletion
      ? MAXIMUM_URGENT_MESH_UPLOADS_PER_FRAME
      : MAXIMUM_BACKGROUND_MESH_UPLOADS_PER_FRAME;
    let applied = 0;

    while (applied < uploadBudget && this.#completed.length > 0) {
      let index = this.#completed.findIndex((item) =>
        this.#urgentKeys.has(item.key),
      );
      if (index < 0) {
        index = this.#completed.findIndex((item) =>
          this.#criticalKeys.has(item.key) && !this.#chunks.has(item.key),
        );
      }
      if (index < 0) index = 0;
      const [completed] = this.#completed.splice(index, 1);
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

    this.#discardRecentChunk(key);
    const previous = this.#chunks.get(key);
    const sections = new Map(previous?.sections ?? []);

    for (const payload of response.sections) {
      const previousSection = sections.get(payload.sectionIndex);
      const mesh =
        previousSection?.mesh ??
        new Mesh(
          `voxel-chunk-${key}-section-${String(payload.sectionIndex)}`,
          this.#scene,
        );
      if (previousSection === undefined) {
        mesh.position.set(
          response.chunkX * CHUNK_SIZE,
          0,
          response.chunkZ * CHUNK_SIZE,
        );
        mesh.useVertexColors = true;
        mesh.isPickable = true;
        mesh.metadata = {
          cameraBlocker: true,
          chunkKey: key,
          sectionIndex: payload.sectionIndex,
        };
      } else {
        mesh.unfreezeNormals();
      }

      const vertexData = new VertexData();
      vertexData.positions = payload.meshData.positions;
      vertexData.normals = payload.meshData.normals;
      vertexData.indices = payload.meshData.indices;
      vertexData.colors = payload.meshData.colors;
      vertexData.uvs = payload.meshData.uvs;
      vertexData.applyToMesh(mesh, true);
      this.#materials.applyToMesh(
        mesh,
        payload.meshData.materialRanges,
        payload.meshData.positions.length / 3,
      );
      mesh.freezeWorldMatrix();
      mesh.freezeNormals();
      sections.set(payload.sectionIndex, {
        mesh,
        quadCount: payload.meshData.quadCount,
        sourceFaceCount: payload.meshData.sourceFaceCount,
      });
    }

    this.#chunks.set(key, {
      sections,
      revision,
      buildMilliseconds: response.buildMilliseconds,
    });
    this.#urgentKeys.delete(key);

    const callbacks = this.#afterUpdate.get(key);
    if (callbacks !== undefined) {
      this.#afterUpdate.delete(key);
      for (const callback of callbacks) callback();
    }
  }

  #setChunkEnabled(chunk: RenderedChunk, enabled: boolean): void {
    for (const section of chunk.sections.values()) section.mesh.setEnabled(enabled);
  }

  #disposeChunkMeshes(chunk: RenderedChunk): void {
    for (const section of chunk.sections.values()) section.mesh.dispose(false, false);
  }

  #getPriority(chunkX: number, chunkZ: number): number {
    const centerX = this.#centerChunkX ?? chunkX;
    const centerZ = this.#centerChunkZ ?? chunkZ;
    const key = createChunkKey(chunkX, chunkZ);
    const deltaX = chunkX - centerX;
    const deltaZ = chunkZ - centerZ;
    const manhattan = Math.abs(deltaX) + Math.abs(deltaZ);
    if (this.#criticalKeys.has(key) && !this.#chunks.has(key)) {
      return CRITICAL_CHUNK_PRIORITY + manhattan;
    }
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
