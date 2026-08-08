import { describe, expect, it } from 'vitest';
import {
  canReplaceBlockForPlacement,
  getFluidReplacementAfterBreak,
} from '../src/world/FluidRules';
import { BlockType } from '../src/world/BlockType';
import type { BlockType as BlockTypeValue } from '../src/world/BlockType';

function createSampler(
  entries: Readonly<Record<string, BlockTypeValue>>,
): (worldX: number, worldY: number, worldZ: number) => BlockTypeValue {
  return (worldX, worldY, worldZ) =>
    entries[`${String(worldX)},${String(worldY)},${String(worldZ)}`] ??
    BlockType.Air;
}

describe('fluid interaction rules', () => {
  it('allows placed blocks to replace water and other replaceable blocks', () => {
    expect(canReplaceBlockForPlacement(BlockType.Water)).toBe(true);
    expect(canReplaceBlockForPlacement(BlockType.TallGrass)).toBe(true);
    expect(canReplaceBlockForPlacement(BlockType.Stone)).toBe(false);
  });

  it('lets fluid above fall immediately into a freshly opened voxel', () => {
    const sample = createSampler({
      '0,2,0': BlockType.Water,
      '1,1,0': BlockType.Lava,
    });

    expect(getFluidReplacementAfterBreak(sample, 0, 1, 0)).toBe(
      BlockType.Water,
    );
  });

  it('leaves horizontal shoreline refill to scheduled flow simulation', () => {
    const sample = createSampler({
      '1,1,0': BlockType.Water,
    });

    expect(getFluidReplacementAfterBreak(sample, 0, 1, 0)).toBe(
      BlockType.Air,
    );
  });
});
