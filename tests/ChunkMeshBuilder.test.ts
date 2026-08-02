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
