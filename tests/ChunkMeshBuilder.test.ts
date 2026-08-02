import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { buildChunkMeshData } from '../src/world/ChunkMeshBuilder';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  VoxelChunk,
} from '../src/world/VoxelChunk';

function createChunkSampler(chunk: VoxelChunk) {
  return (worldX: number, worldY: number, worldZ: number) => {
    const localX = worldX - chunk.chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunk.chunkZ * CHUNK_SIZE;
    if (
      localX < 0 ||
      localX >= CHUNK_SIZE ||
      localZ < 0 ||
      localZ >= CHUNK_SIZE ||
      worldY < 0 ||
      worldY >= CHUNK_HEIGHT
    ) {
      return BlockType.Air;
    }
    return chunk.getBlock(localX, worldY, localZ);
  };
}

function readVector(values: readonly number[], index: number): readonly [number, number, number] {
  const offset = index * 3;
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  if (x === undefined || y === undefined || z === undefined) {
    throw new RangeError('Vector index is outside the mesh data.');
  }
  return [x, y, z];
}

describe('buildChunkMeshData', () => {
  it('emits six faces for one isolated block', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(2, 3, 4, BlockType.Stone);

    const mesh = buildChunkMeshData(chunk, createChunkSampler(chunk));

    expect(mesh.faceCount).toBe(6);
    expect(mesh.positions).toHaveLength(6 * 4 * 3);
    expect(mesh.indices).toHaveLength(6 * 6);
    expect(mesh.colors).toHaveLength(6 * 4 * 4);
  });

  it('uses clockwise front-face winding for Babylon left-handed scenes', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(2, 3, 4, BlockType.Stone);

    const mesh = buildChunkMeshData(chunk, createChunkSampler(chunk));

    for (let faceIndex = 0; faceIndex < mesh.faceCount; faceIndex += 1) {
      const indexOffset = faceIndex * 6;
      const firstIndex = mesh.indices[indexOffset];
      const secondIndex = mesh.indices[indexOffset + 1];
      const thirdIndex = mesh.indices[indexOffset + 2];
      if (
        firstIndex === undefined ||
        secondIndex === undefined ||
        thirdIndex === undefined
      ) {
        throw new RangeError('Triangle indices are incomplete.');
      }

      const first = readVector(mesh.positions, firstIndex);
      const second = readVector(mesh.positions, secondIndex);
      const third = readVector(mesh.positions, thirdIndex);
      const normal = readVector(mesh.normals, firstIndex);

      const edgeAX = second[0] - first[0];
      const edgeAY = second[1] - first[1];
      const edgeAZ = second[2] - first[2];
      const edgeBX = third[0] - first[0];
      const edgeBY = third[1] - first[1];
      const edgeBZ = third[2] - first[2];
      const crossX = edgeAY * edgeBZ - edgeAZ * edgeBY;
      const crossY = edgeAZ * edgeBX - edgeAX * edgeBZ;
      const crossZ = edgeAX * edgeBY - edgeAY * edgeBX;
      const windingDotNormal =
        crossX * normal[0] + crossY * normal[1] + crossZ * normal[2];

      expect(windingDotNormal).toBeLessThan(0);
    }
  });

  it('removes the shared internal face between adjacent blocks', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(2, 3, 4, BlockType.Stone);
    chunk.setBlock(3, 3, 4, BlockType.Dirt);

    const mesh = buildChunkMeshData(chunk, createChunkSampler(chunk));

    expect(mesh.faceCount).toBe(10);
  });

  it('culls a face against a solid block in the neighboring chunk', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(CHUNK_SIZE - 1, 3, 4, BlockType.Stone);
    const localSampler = createChunkSampler(chunk);

    const mesh = buildChunkMeshData(chunk, (worldX, worldY, worldZ) => {
      if (worldX === CHUNK_SIZE && worldY === 3 && worldZ === 4) {
        return BlockType.Stone;
      }
      return localSampler(worldX, worldY, worldZ);
    });

    expect(mesh.faceCount).toBe(5);
  });
});
