import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { VoxelWorldData } from '../src/world/VoxelWorldData';

describe('VoxelWorldData', () => {
  it('stores only differences from deterministic terrain', () => {
    const world = new VoxelWorldData('sparse-edit-test');

    expect(world.modificationCount).toBe(0);
    expect(world.setBlock(0, 31, 0, BlockType.Stone)).toBe(true);
    expect(world.sampleBlock(0, 31, 0)).toBe(BlockType.Stone);
    expect(world.modificationCount).toBe(1);

    expect(world.setBlock(0, 31, 0, BlockType.Air)).toBe(true);
    expect(world.sampleBlock(0, 31, 0)).toBe(BlockType.Air);
    expect(world.modificationCount).toBe(0);
  });

  it('updates standing height after removing the surface block', () => {
    const world = new VoxelWorldData('height-edit-test');
    const surfaceY = world.generator.sampleSurfaceHeight(0, 0);
    const initialStandingY = world.sampleStandingY(0, 0);

    world.setBlock(0, surfaceY, 0, BlockType.Air);

    expect(world.sampleStandingY(0, 0)).toBeCloseTo(initialStandingY - 1);
  });

  it('includes neighboring chunk edits in worker build snapshots', () => {
    const world = new VoxelWorldData('neighbor-edit-test');
    world.setBlock(16, 31, 0, BlockType.Stone);

    expect(world.getBuildModifications(0, 0)).toContainEqual([
      16,
      31,
      0,
      BlockType.Stone,
    ]);
  });
});
