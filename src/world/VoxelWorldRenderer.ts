import {
  Color3,
  Mesh,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { ChunkBuildSuccess } from './ChunkBuildProtocol';
import { ChunkWorkerPool } from './ChunkWorkerPool';
import {
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
  worldToLocalCoordinate,
} from './VoxelChunk';
import type { VoxelWorldData } from './VoxelWorldData';

interface RenderedChunk {
  readonly mesh: Mesh;
  readonly quadCount: number;
  readonly sourceFaceCount: number;
  readonly buildMilliseconds: number;
}

interface CompletedChunk {
  readonly key: string;
  readonly revision: number;
  readonly response: ChunkBuildSuccess;
}

export interface VoxelWorldStats {
  readonly loadedChunks: number;
  readonly desiredChunks: number;
  readonly pendingChunks: number;
  readonly visibleQuads: number;
  readonly sourceFaces: number;
  readonly centerChunkX: number;
  readonly centerChunkZ: number;
  readonly averageBuildMilliseconds: number;
}

const MAXIMUM_MESH_UPLOADS_PER_FRAME = 2;

/**
 * Streams a bounded chunk window. Generation and greedy meshing happen in a
 * worker pool; the main thread only uploads a small number of completed meshes
 * per frame to avoid visible frame-time spikes.
 */
export class VoxelWorldRenderer {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #renderRadius: number;
  readonly #material: StandardMaterial;
  readonly #workers = new ChunkWorkerPool();
  readonly #chunks = new Map<string, RenderedChunk>();
  readonly #desiredKeys = new Set<string>();
  readonly #revisions = new Map<string, number>();
  readonly #pendingRevisions = new Map<string, number>();
  readonly #completed: CompletedChunk[] = [];
  #centerChunkX: number | null = null;
  #centerChunkZ: number | null = null;
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
    this.#material = new StandardMaterial('voxel-world-material', scene);
    this.#material.diffuseColor = Color3.White();
    this.#material.specularColor = Color3.Black();
    this.#material.emissiveColor = new Color3(0.025, 0.035, 0.03);
    this.#material.backFaceCulling = true;
    this.#material.freeze();
  }

  public async initialize(playerX: number, playerZ: number): Promise<void> {
    const centerChunkX = worldToChunkCoordinate(Math.floor(playerX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(playerZ));
    this.#centerChunkX = centerChunkX;
    this.#centerChunkZ = centerChunkZ;
    this.#updateDesiredKeys(centerChunkX, centerChunkZ);

    const centerKey = createChunkKey(centerChunkX, centerChunkZ);
    const revision = this.#getRevision(centerKey);
    const response = await this.#buildChunk(centerChunkX, centerChunkZ);
    if (!this.#disposed) {
      this.#applyChunk(centerKey, revision, response);
      this.#scheduleMissingChunks(centerChunkX, centerChunkZ);
    }
  }

  public update(playerX: number, playerZ: number): VoxelWorldStats {
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
      this.#unloadDistantChunks();
      this.#scheduleMissingChunks(centerChunkX, centerChunkZ);
    }

    return this.getStats();
  }

  public invalidateBlock(worldX: number, worldY: number, worldZ: number): void {
    if (!Number.isInteger(worldY)) {
      throw new RangeError('worldY must be an integer.');
    }
    const chunkX = worldToChunkCoordinate(worldX);
    const chunkZ = worldToChunkCoordinate(worldZ);
    const localX = worldToLocalCoordinate(worldX);
    const localZ = worldToLocalCoordinate(worldZ);
    this.#invalidateChunk(chunkX, chunkZ);
    if (localX === 0) {
      this.#invalidateChunk(chunkX - 1, chunkZ);
    } else if (localX === CHUNK_SIZE - 1) {
      this.#invalidateChunk(chunkX + 1, chunkZ);
    }
    if (localZ === 0) {
      this.#invalidateChunk(chunkX, chunkZ - 1);
    } else if (localZ === CHUNK_SIZE - 1) {
      this.#invalidateChunk(chunkX, chunkZ + 1);
    }
  }

  public invalidateAll(): void {
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
      pendingChunks: this.#pendingRevisions.size + this.#completed.length,
      visibleQuads,
      sourceFaces,
      centerChunkX: this.#centerChunkX ?? 0,
      centerChunkZ: this.#centerChunkZ ?? 0,
      averageBuildMilliseconds:
        this.#chunks.size === 0 ? 0 : totalBuildMilliseconds / this.#chunks.size,
    };
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#workers.dispose();
    for (const chunk of this.#chunks.values()) {
      chunk.mesh.dispose(false, false);
    }
    this.#chunks.clear();
    this.#desiredKeys.clear();
    this.#pendingRevisions.clear();
    this.#completed.length = 0;
    this.#material.dispose();
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
  }

  #unloadDistantChunks(): void {
    for (const [key, chunk] of this.#chunks) {
      if (!this.#desiredKeys.has(key)) {
        chunk.mesh.dispose(false, false);
        this.#chunks.delete(key);
      }
    }
  }

  #scheduleMissingChunks(centerChunkX: number, centerChunkZ: number): void {
    const coordinates: (readonly [number, number])[] = [];
    for (const key of this.#desiredKeys) {
      const [chunkX, chunkZ] = this.#parseChunkKey(key);
      coordinates.push([chunkX, chunkZ]);
    }
    coordinates.sort((left, right) => {
      const leftDistance =
        Math.abs(left[0] - centerChunkX) + Math.abs(left[1] - centerChunkZ);
      const rightDistance =
        Math.abs(right[0] - centerChunkX) + Math.abs(right[1] - centerChunkZ);
      return leftDistance - rightDistance;
    });

    for (const [chunkX, chunkZ] of coordinates) {
      const key = createChunkKey(chunkX, chunkZ);
      if (!this.#chunks.has(key)) {
        this.#scheduleChunk(chunkX, chunkZ);
      }
    }
  }

  #invalidateChunk(chunkX: number, chunkZ: number): void {
    const key = createChunkKey(chunkX, chunkZ);
    this.#revisions.set(key, this.#getRevision(key) + 1);
    if (this.#desiredKeys.has(key)) {
      this.#scheduleChunk(chunkX, chunkZ);
    }
  }

  #scheduleChunk(chunkX: number, chunkZ: number): void {
    if (this.#disposed) {
      return;
    }
    const key = createChunkKey(chunkX, chunkZ);
    const revision = this.#getRevision(key);
    if (this.#pendingRevisions.get(key) === revision) {
      return;
    }
    this.#pendingRevisions.set(key, revision);

    void this.#buildChunk(chunkX, chunkZ)
      .then((response) => {
        if (!this.#disposed) {
          this.#completed.push({ key, revision, response });
        }
      })
      .catch((error: unknown) => {
        if (this.#pendingRevisions.get(key) === revision) {
          this.#pendingRevisions.delete(key);
        }
        console.error(`Failed to build voxel chunk ${key}.`, error);
      });
  }

  #buildChunk(chunkX: number, chunkZ: number): Promise<ChunkBuildSuccess> {
    return this.#workers.buildChunk({
      worldSeed: this.#world.worldSeed,
      chunkX,
      chunkZ,
      modifications: this.#world.getBuildModifications(chunkX, chunkZ),
    });
  }

  #applyCompletedChunks(): void {
    let applied = 0;
    while (
      applied < MAXIMUM_MESH_UPLOADS_PER_FRAME &&
      this.#completed.length > 0
    ) {
      const completed = this.#completed.shift();
      if (completed === undefined) {
        break;
      }
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
    if (this.#getRevision(key) !== revision) {
      return;
    }

    const mesh = new Mesh(`voxel-chunk-${key}`, this.#scene);
    mesh.position.set(
      response.chunkX * CHUNK_SIZE,
      0,
      response.chunkZ * CHUNK_SIZE,
    );
    mesh.material = this.#material;
    mesh.useVertexColors = true;
    mesh.isPickable = true;
    mesh.metadata = { cameraBlocker: true, chunkKey: key };

    const vertexData = new VertexData();
    vertexData.positions = response.meshData.positions;
    vertexData.normals = response.meshData.normals;
    vertexData.indices = response.meshData.indices;
    vertexData.colors = response.meshData.colors;
    vertexData.applyToMesh(mesh, false);
    mesh.freezeWorldMatrix();
    mesh.freezeNormals();

    const previous = this.#chunks.get(key);
    this.#chunks.set(key, {
      mesh,
      quadCount: response.meshData.quadCount,
      sourceFaceCount: response.meshData.sourceFaceCount,
      buildMilliseconds: response.buildMilliseconds,
    });
    previous?.mesh.dispose(false, false);
  }

  #getRevision(key: string): number {
    return this.#revisions.get(key) ?? 0;
  }

  #parseChunkKey(key: string): readonly [number, number] {
    const separator = key.indexOf(',');
    if (separator < 0) {
      throw new Error(`Invalid chunk key: ${key}`);
    }
    const chunkX = Number(key.slice(0, separator));
    const chunkZ = Number(key.slice(separator + 1));
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
      throw new Error(`Invalid chunk key: ${key}`);
    }
    return [chunkX, chunkZ];
  }
}
