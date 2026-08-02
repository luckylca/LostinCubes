import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import {
  getBlockFaceColor,
  getBlockItemColor,
} from '../src/world/BlockVisuals';

describe('block visual palette', () => {
  it('gives grass distinct top, side, and bottom faces', () => {
    const top = getBlockFaceColor(BlockType.Grass, 1, true, 0, 0, 0);
    const side = getBlockFaceColor(BlockType.Grass, 0, true, 0, 0, 0);
    const bottom = getBlockFaceColor(BlockType.Grass, 1, false, 0, 0, 0);

    expect(top[1]).toBeGreaterThan(top[0]);
    expect(top).not.toEqual(side);
    expect(side).not.toEqual(bottom);
    expect(bottom[0]).toBeGreaterThan(bottom[1]);
  });

  it('distinguishes log rings, bark, leaves, planks, and crafting tables', () => {
    const logTop = getBlockFaceColor(BlockType.OakLog, 1, true, 5, 7, 9);
    const logSide = getBlockFaceColor(BlockType.OakLog, 0, true, 5, 7, 9);
    const leaves = getBlockItemColor(BlockType.OakLeaves);
    const planks = getBlockItemColor(BlockType.OakPlanks);
    const table = getBlockItemColor(BlockType.CraftingTable);

    expect(logTop).not.toEqual(logSide);
    expect(logTop[0]).toBeGreaterThan(logSide[0]);
    expect(leaves[1]).toBeGreaterThan(leaves[0]);
    expect(planks).not.toEqual(table);
  });

  it('keeps coordinate variation deterministic and bounded', () => {
    const first = getBlockFaceColor(BlockType.Stone, 2, true, 3, 4, 5);
    const repeated = getBlockFaceColor(BlockType.Stone, 2, true, 3, 4, 5);
    const neighbor = getBlockFaceColor(BlockType.Stone, 2, true, 4, 4, 5);

    expect(repeated).toEqual(first);
    expect(neighbor).not.toEqual(first);
    for (const channel of [...first, ...neighbor]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
