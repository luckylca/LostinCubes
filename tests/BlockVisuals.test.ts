import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { getBlockFaceColor } from '../src/world/BlockVisuals';

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
