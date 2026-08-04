import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import {
  getBlockFaceColor,
  getBlockItemColor,
} from '../src/world/BlockVisuals';
import {
  BLOCK_TEXTURE_SIZE,
  BlockTexture,
  getBlockFaceTexture,
  getBlockTexturePixels,
} from '../src/world/BlockTextureLibrary';

describe('block visual palette', () => {
  it('uses separate grass top, side, and bottom textures', () => {
    expect(getBlockFaceTexture(BlockType.Grass, 1, true)).toBe(
      BlockTexture.GrassTop,
    );
    expect(getBlockFaceTexture(BlockType.Grass, 0, true)).toBe(
      BlockTexture.GrassSide,
    );
    expect(getBlockFaceTexture(BlockType.Grass, 1, false)).toBe(
      BlockTexture.Dirt,
    );
  });

  it('distinguishes log rings, bark, leaves, planks, and workbench faces', () => {
    expect(getBlockFaceTexture(BlockType.OakLog, 1, true)).toBe(
      BlockTexture.OakLogTop,
    );
    expect(getBlockFaceTexture(BlockType.OakLog, 0, true)).toBe(
      BlockTexture.OakLogSide,
    );
    expect(getBlockFaceTexture(BlockType.CraftingTable, 1, true)).toBe(
      BlockTexture.CraftingTableTop,
    );
    expect(getBlockFaceTexture(BlockType.CraftingTable, 2, true)).toBe(
      BlockTexture.CraftingTableFront,
    );
    const leaves = getBlockItemColor(BlockType.OakLeaves);
    const planks = getBlockItemColor(BlockType.OakPlanks);
    const table = getBlockItemColor(BlockType.CraftingTable);
    expect(leaves[1]).toBeGreaterThan(leaves[0]);
    expect(planks).not.toEqual(table);
  });

  it('generates complete nearest-neighbor texture data with leaf cutouts', () => {
    const stone = getBlockTexturePixels(BlockTexture.Stone);
    const leaves = getBlockTexturePixels(BlockTexture.OakLeaves);
    expect(stone.pixels).toHaveLength(BLOCK_TEXTURE_SIZE * BLOCK_TEXTURE_SIZE * 4);
    expect(stone.hasAlpha).toBe(false);
    expect(leaves.hasAlpha).toBe(true);
    const alphaValues = Array.from(
      { length: BLOCK_TEXTURE_SIZE * BLOCK_TEXTURE_SIZE },
      (_, index) => leaves.pixels[index * 4 + 3] ?? 255,
    );
    expect(alphaValues.some((alpha) => alpha === 0)).toBe(true);
    expect(alphaValues.some((alpha) => alpha === 255)).toBe(true);
  });

  it('keeps directional tint deterministic and bounded', () => {
    const top = getBlockFaceColor(BlockType.Stone, 1, true, 3, 4, 5);
    const side = getBlockFaceColor(BlockType.Stone, 2, true, 3, 4, 5);
    const repeated = getBlockFaceColor(BlockType.Stone, 2, true, 3, 4, 5);
    const neighbor = getBlockFaceColor(BlockType.Stone, 2, true, 4, 4, 5);

    expect(top[0]).toBeGreaterThan(side[0]);
    expect(repeated).toEqual(side);
    expect(neighbor).not.toEqual(side);
    for (const channel of [...top, ...side, ...neighbor]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
