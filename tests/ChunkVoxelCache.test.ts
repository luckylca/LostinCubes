import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { ChunkVoxelCache } from '../src/world/ChunkVoxelCache';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../src/world/VoxelChunk';
import { LIGHT_PROPAGATION_RADIUS } from '../src/world/VoxelLightEngine';

describe('ChunkVoxelCache', () => {
  it('samples every bounded build voxel exactly once and reuses it', () => {
    const calls = new Map<string, number>();
    const source = (worldX: number, worldY: number, worldZ: number) => {
      const key = `${String(worldX)},${String(worldY)},${String(worldZ)}`;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return worldY === 0 ? BlockType.Stone : BlockType.Air;
    };
    const cache = new ChunkVoxelCache(2, -1, source);
    const buildWidth = CHUNK_SIZE + LIGHT_PROPAGATION_RADIUS * 2;
    const expectedCells = buildWidth * buildWidth * CHUNK_HEIGHT;

    expect(cache.cachedCellCount).toBe(expectedCells);
    expect(calls.size).toBe(expectedCells);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);

    for (let index = 0; index < 100; index += 1) {
      expect(cache.sample(2 * CHUNK_SIZE, 0, -CHUNK_SIZE)).toBe(
        BlockType.Stone,
      );
      expect(cache.sample(2 * CHUNK_SIZE, 1, -CHUNK_SIZE)).toBe(
        BlockType.Air,
      );
    }
    expect(calls.size).toBe(expectedCells);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
  });

  it('falls back to the source only outside the cached horizontal margin', () => {
    let calls = 0;
    const cache = new ChunkVoxelCache(0, 0, () => {
      calls += 1;
      return BlockType.Dirt;
    });
    const initialCalls = calls;

    expect(cache.sample(-LIGHT_PROPAGATION_RADIUS, 0, 0)).toBe(BlockType.Dirt);
    expect(calls).toBe(initialCalls);
    expect(
      cache.sample(-LIGHT_PROPAGATION_RADIUS - 1, 0, 0),
    ).toBe(BlockType.Dirt);
    expect(calls).toBe(initialCalls + 1);
    expect(cache.sample(0, -1, 0)).toBe(BlockType.Air);
    expect(cache.sample(0, CHUNK_HEIGHT, 0)).toBe(BlockType.Air);
    expect(calls).toBe(initialCalls + 1);
  });
});
