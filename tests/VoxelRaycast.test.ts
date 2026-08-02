import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { raycastVoxels } from '../src/world/VoxelRaycast';

describe('raycastVoxels', () => {
  it('returns the hit block and the adjacent placement cell', () => {
    const hit = raycastVoxels(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      8,
      (worldX, worldY, worldZ) =>
        worldX === 0 && worldY === 0 && worldZ === 3
          ? BlockType.Stone
          : BlockType.Air,
    );

    expect(hit).not.toBeNull();
    expect(hit?.block).toEqual({ x: 0, y: 0, z: 3 });
    expect(hit?.adjacent).toEqual({ x: 0, y: 0, z: 2 });
    expect(hit?.normal).toEqual({ x: 0, y: 0, z: -1 });
    expect(hit?.distance).toBeCloseTo(2.5);
  });

  it('returns null when no solid voxel is inside the range', () => {
    const hit = raycastVoxels(
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 0.2, z: 0 },
      4,
      () => BlockType.Air,
    );

    expect(hit).toBeNull();
  });
});
