import {
  Color3,
  Mesh,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { buildChunkMeshData } from './ChunkMeshBuilder';
import type { TerrainGenerator } from './TerrainGenerator';
import {
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
} from './VoxelChunk';

interface RenderedChunk {
  readonly mesh: Mesh;
  readonly faceCount: number;
}

export interface VoxelWorldStats {
  readonly loadedChunks: number;
  readonly visibleFaces: number;
  readonly centerChunkX: number;
  readonly centerChunkZ: number;
}

export class VoxelWorldRenderer {
  readonly #scene: Scene;
  readonly #generator: TerrainGenerator;
  readonly #renderRadius: number;
  readonly #material: StandardMaterial;
  readonly #chunks = new Map<string, RenderedChunk>();
  #centerChunkX: number | null = null;
  #centerChunkZ: number | null = null;

  public constructor(
    scene: Scene,
    generator: TerrainGenerator,
    renderRadius = 1,
  ) {
    if (!Number.isInteger(renderRadius) || renderRadius < 0) {
      throw new RangeError('renderRadius must be a non-negative integer.');
    }

    this.#scene = scene;
    this.#generator = generator;
    this.#renderRadius = renderRadius;
    this.#material = new StandardMaterial('voxel-world-material', scene);
    this.#material.diffuseColor = Color3.White();
    this.#material.specularColor = Color3.Black();
    this.#material.emissiveColor = new Color3(0.025, 0.035, 0.03);
    this.#material.backFaceCulling = true;
  }

  public update(playerX: number, playerZ: number): VoxelWorldStats {
    const centerChunkX = worldToChunkCoordinate(Math.floor(playerX));
    const centerChunkZ = worldToChunkCoordinate(Math.floor(playerZ));

    if (
      centerChunkX !== this.#centerChunkX ||
      centerChunkZ !== this.#centerChunkZ
    ) {
      this.#centerChunkX = centerChunkX;
      this.#centerChunkZ = centerChunkZ;
      this.#synchronizeChunks(centerChunkX, centerChunkZ);
    }

    return this.getStats();
  }

  public getStats(): VoxelWorldStats {
    let visibleFaces = 0;
    for (const chunk of this.#chunks.values()) {
      visibleFaces += chunk.faceCount;
    }

    return {
      loadedChunks: this.#chunks.size,
      visibleFaces,
      centerChunkX: this.#centerChunkX ?? 0,
      centerChunkZ: this.#centerChunkZ ?? 0,
    };
  }

  public dispose(): void {
    for (const chunk of this.#chunks.values()) {
      chunk.mesh.dispose(false, false);
    }
    this.#chunks.clear();
    this.#material.dispose();
  }

  #synchronizeChunks(centerChunkX: number, centerChunkZ: number): void {
    const desiredKeys = new Set<string>();
    const coordinates: Array<readonly [number, number]> = [];

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
        const key = createChunkKey(chunkX, chunkZ);
        desiredKeys.add(key);
        coordinates.push([chunkX, chunkZ]);
      }
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
        this.#chunks.set(key, this.#createChunk(chunkX, chunkZ));
      }
    }

    for (const [key, chunk] of this.#chunks) {
      if (!desiredKeys.has(key)) {
        chunk.mesh.dispose(false, false);
        this.#chunks.delete(key);
      }
    }
  }

  #createChunk(chunkX: number, chunkZ: number): RenderedChunk {
    const chunk = this.#generator.generateChunk(chunkX, chunkZ);
    const meshData = buildChunkMeshData(
      chunk,
      (worldX, worldY, worldZ) =>
        this.#generator.sampleBlock(worldX, worldY, worldZ),
    );

    const mesh = new Mesh(`voxel-chunk-${chunk.key}`, this.#scene);
    mesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    mesh.material = this.#material;
    mesh.useVertexColors = true;
    mesh.isPickable = true;
    mesh.metadata = { cameraBlocker: true, chunkKey: chunk.key };

    const vertexData = new VertexData();
    vertexData.positions = meshData.positions;
    vertexData.normals = meshData.normals;
    vertexData.indices = meshData.indices;
    vertexData.colors = meshData.colors;
    vertexData.applyToMesh(mesh, false);
    mesh.freezeWorldMatrix();

    return { mesh, faceCount: meshData.faceCount };
  }
}
