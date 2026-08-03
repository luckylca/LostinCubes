import { describe, expect, it } from 'vitest';
import {
  getBlockDropItem,
  getItemDefinition,
  getMiningSpeedMultiplier,
  getToolTierRank,
  ItemType,
} from '../src/inventory/ItemDefinitions';
import { BlockType } from '../src/world/BlockType';

describe('survival mining progression', () => {
  it('requires a pickaxe for coal and a stone-tier pickaxe for raw iron', () => {
    expect(getBlockDropItem(BlockType.CoalOre, null)).toBeNull();
    expect(getBlockDropItem(BlockType.CoalOre, ItemType.WoodenAxe)).toBeNull();
    expect(getBlockDropItem(BlockType.CoalOre, ItemType.WoodenPickaxe)).toBe(ItemType.Coal);
    expect(getBlockDropItem(BlockType.IronOre, ItemType.WoodenPickaxe)).toBeNull();
    expect(getBlockDropItem(BlockType.IronOre, ItemType.StonePickaxe)).toBe(ItemType.RawIron);
    expect(getBlockDropItem(BlockType.IronOre, ItemType.IronPickaxe)).toBe(ItemType.RawIron);
  });

  it('orders wood, stone, and iron mining speed and durability', () => {
    const woodSpeed = getMiningSpeedMultiplier(ItemType.WoodenPickaxe, BlockType.Stone);
    const stoneSpeed = getMiningSpeedMultiplier(ItemType.StonePickaxe, BlockType.Stone);
    const ironSpeed = getMiningSpeedMultiplier(ItemType.IronPickaxe, BlockType.Stone);
    expect(woodSpeed).toBeLessThan(stoneSpeed);
    expect(stoneSpeed).toBeLessThan(ironSpeed);
    expect(getToolTierRank(ItemType.WoodenPickaxe)).toBe(1);
    expect(getToolTierRank(ItemType.StonePickaxe)).toBe(2);
    expect(getToolTierRank(ItemType.IronPickaxe)).toBe(3);
    expect(getItemDefinition(ItemType.WoodenPickaxe).maximumDurability).toBe(59);
    expect(getItemDefinition(ItemType.StonePickaxe).maximumDurability).toBe(131);
    expect(getItemDefinition(ItemType.IronPickaxe).maximumDurability).toBe(250);
  });

  it('does not let a higher-tier tool replace the correct tool family', () => {
    expect(getMiningSpeedMultiplier(ItemType.IronAxe, BlockType.IronOre)).toBe(1);
    expect(getMiningSpeedMultiplier(ItemType.IronShovel, BlockType.OakLog)).toBe(1);
    expect(getMiningSpeedMultiplier(ItemType.IronPickaxe, BlockType.OakLog)).toBe(1);
    expect(getMiningSpeedMultiplier(ItemType.IronAxe, BlockType.OakLog)).toBeGreaterThan(1);
  });
});
