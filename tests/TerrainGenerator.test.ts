import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { TerrainGenerator, hashWorldSeed } from '../src/world/TerrainGenerator';
import { CHUNK_SIZE } from '../src/world/VoxelChunk';

describe('TerrainGenerator', () => {
  it('produces identical chunks for the same world seed', () => {
    const first = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);
    const second = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);

    expect(first.copyBlocks()).toEqual(second.copyBlocks());
  });

  it('changes generated terrain when the world seed changes', () => {
    const first = new TerrainGenerator('fragment-seed-a').generateChunk(0, 0);
    const second = new TerrainGenerator('fragment-seed-b').generateChunk(0, 0);

    expect(first.copyBlocks()).not.toEqual(second.copyBlocks());
    expect(hashWorldSeed('fragment-seed-a')).not.toBe(
      hashWorldSeed('fragment-seed-b'),
    );
  });

  it('creates one grass surface block for every horizontal column', () => {
    const chunk = new TerrainGenerator('surface-test').generateChunk(1, -3);

    expect(chunk.countBlocks(BlockType.Grass)).toBe(CHUNK_SIZE * CHUNK_SIZE);
    expect(chunk.countBlocks(BlockType.Stone)).toBeGreaterThan(0);
    expect(chunk.countBlocks(BlockType.Dirt)).toBeGreaterThan(0);
  });
});
