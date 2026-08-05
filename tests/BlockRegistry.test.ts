import { describe, expect, it } from 'vitest';
import {
  getBlockDefinition,
  isFullCubeBlock,
  isSolidBlock,
  isTargetableBlock,
  shouldMergeBlockFaces,
} from '../src/world/BlockRegistry';
import { BlockType } from '../src/world/BlockType';

describe('BlockRegistry', () => {
  it('keeps stable old block ids and appends new classic blocks', () => {
    expect(BlockType.Furnace).toBe(11);
    expect(BlockType.Cobblestone).toBe(12);
    expect(BlockType.Torch).toBe(13);
  });

  it('defines torches as targetable non-solid light sources', () => {
    const torch = getBlockDefinition(BlockType.Torch);
    expect(isSolidBlock(BlockType.Torch)).toBe(false);
    expect(isTargetableBlock(BlockType.Torch)).toBe(true);
    expect(isFullCubeBlock(BlockType.Torch)).toBe(false);
    expect(torch.renderShape).toBe('cross');
    expect(torch.lightOpacity).toBe(0);
    expect(torch.luminance).toBe(14);
  });

  it('keeps leaves individually meshed while allowing partial skylight', () => {
    const leaves = getBlockDefinition(BlockType.OakLeaves);
    expect(shouldMergeBlockFaces(BlockType.OakLeaves)).toBe(false);
    expect(leaves.lightOpacity).toBe(1);
  });

  it('defines classic harvest requirements and rune emission', () => {
    expect(getBlockDefinition(BlockType.Stone).minimumToolTierRank).toBe(1);
    expect(getBlockDefinition(BlockType.IronOre).minimumToolTierRank).toBe(2);
    expect(getBlockDefinition(BlockType.RuneStone).luminance).toBe(10);
  });
});
