import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

export const ItemType = {
  GrassBlock: 'grass-block',
  DirtBlock: 'dirt-block',
  StoneBlock: 'stone-block',
  RuneStoneBlock: 'rune-stone-block',
  OakLogBlock: 'oak-log-block',
  OakLeavesBlock: 'oak-leaves-block',
  OakPlanksBlock: 'oak-planks-block',
  CraftingTableBlock: 'crafting-table-block',
  CoalOreBlock: 'coal-ore-block',
  IronOreBlock: 'iron-ore-block',
  FurnaceBlock: 'furnace-block',
  Stick: 'stick',
  Coal: 'coal',
  RawIron: 'raw-iron',
  IronIngot: 'iron-ingot',
  WoodenShovel: 'wooden-shovel',
  WoodenPickaxe: 'wooden-pickaxe',
  WoodenAxe: 'wooden-axe',
  StoneShovel: 'stone-shovel',
  StonePickaxe: 'stone-pickaxe',
  StoneAxe: 'stone-axe',
  IronShovel: 'iron-shovel',
  IronPickaxe: 'iron-pickaxe',
  IronAxe: 'iron-axe',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];
export type ToolKind = 'shovel' | 'pickaxe' | 'axe';
export type ToolTier = 'wood' | 'stone' | 'iron';
export type ItemRgb = readonly [red: number, green: number, blue: number];

export interface ItemDefinition {
  readonly label: string;
  readonly kind: 'block' | 'tool' | 'material';
  readonly cssClass: string;
  readonly maximumStack: number;
  readonly block: BlockTypeValue | null;
  readonly maximumDurability: number | null;
  readonly toolKind: ToolKind | null;
  readonly toolTier: ToolTier | null;
  readonly color: ItemRgb;
}

function blockDefinition(
  label: string,
  cssClass: string,
  block: BlockTypeValue,
  color: ItemRgb,
): ItemDefinition {
  return {
    label,
    kind: 'block',
    cssClass,
    maximumStack: 64,
    block,
    maximumDurability: null,
    toolKind: null,
    toolTier: null,
    color,
  };
}

function materialDefinition(
  label: string,
  cssClass: string,
  color: ItemRgb,
): ItemDefinition {
  return {
    label,
    kind: 'material',
    cssClass,
    maximumStack: 64,
    block: null,
    maximumDurability: null,
    toolKind: null,
    toolTier: null,
    color,
  };
}

function toolDefinition(
  label: string,
  cssClass: string,
  toolKind: ToolKind,
  toolTier: ToolTier,
  maximumDurability: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    label,
    kind: 'tool',
    cssClass,
    maximumStack: 1,
    block: null,
    maximumDurability,
    toolKind,
    toolTier,
    color,
  };
}

const DEFINITIONS: Readonly<Record<ItemType, ItemDefinition>> = {
  [ItemType.GrassBlock]: blockDefinition('草方块', 'grass', BlockType.Grass, [0.38, 0.61, 0.24]),
  [ItemType.DirtBlock]: blockDefinition('泥土', 'dirt', BlockType.Dirt, [0.48, 0.32, 0.2]),
  [ItemType.StoneBlock]: blockDefinition('石头', 'stone', BlockType.Stone, [0.53, 0.55, 0.54]),
  [ItemType.RuneStoneBlock]: blockDefinition('符文石', 'rune', BlockType.RuneStone, [0.16, 0.43, 0.3]),
  [ItemType.OakLogBlock]: blockDefinition('橡木原木', 'oak-log', BlockType.OakLog, [0.43, 0.28, 0.13]),
  [ItemType.OakLeavesBlock]: blockDefinition('橡树树叶', 'oak-leaves', BlockType.OakLeaves, [0.23, 0.49, 0.19]),
  [ItemType.OakPlanksBlock]: blockDefinition('橡木木板', 'oak-planks', BlockType.OakPlanks, [0.67, 0.48, 0.26]),
  [ItemType.CraftingTableBlock]: blockDefinition('工作台', 'crafting-table', BlockType.CraftingTable, [0.5, 0.32, 0.16]),
  [ItemType.CoalOreBlock]: blockDefinition('煤矿石', 'coal-ore', BlockType.CoalOre, [0.25, 0.26, 0.26]),
  [ItemType.IronOreBlock]: blockDefinition('铁矿石', 'iron-ore', BlockType.IronOre, [0.58, 0.43, 0.33]),
  [ItemType.FurnaceBlock]: blockDefinition('熔炉', 'furnace', BlockType.Furnace, [0.38, 0.4, 0.39]),
  [ItemType.Stick]: materialDefinition('木棍', 'stick', [0.57, 0.39, 0.2]),
  [ItemType.Coal]: materialDefinition('煤炭', 'coal', [0.08, 0.09, 0.1]),
  [ItemType.RawIron]: materialDefinition('粗铁', 'raw-iron', [0.61, 0.42, 0.3]),
  [ItemType.IronIngot]: materialDefinition('铁锭', 'iron-ingot', [0.77, 0.79, 0.77]),
  [ItemType.WoodenShovel]: toolDefinition('木铲', 'wooden-shovel', 'shovel', 'wood', 59, [0.58, 0.4, 0.21]),
  [ItemType.WoodenPickaxe]: toolDefinition('木镐', 'wooden-pickaxe', 'pickaxe', 'wood', 59, [0.58, 0.4, 0.21]),
  [ItemType.WoodenAxe]: toolDefinition('木斧', 'wooden-axe', 'axe', 'wood', 59, [0.58, 0.4, 0.21]),
  [ItemType.StoneShovel]: toolDefinition('石铲', 'stone-shovel', 'shovel', 'stone', 131, [0.48, 0.5, 0.49]),
  [ItemType.StonePickaxe]: toolDefinition('石镐', 'stone-pickaxe', 'pickaxe', 'stone', 131, [0.48, 0.5, 0.49]),
  [ItemType.StoneAxe]: toolDefinition('石斧', 'stone-axe', 'axe', 'stone', 131, [0.48, 0.5, 0.49]),
  [ItemType.IronShovel]: toolDefinition('铁铲', 'iron-shovel', 'shovel', 'iron', 250, [0.78, 0.8, 0.79]),
  [ItemType.IronPickaxe]: toolDefinition('铁镐', 'iron-pickaxe', 'pickaxe', 'iron', 250, [0.78, 0.8, 0.79]),
  [ItemType.IronAxe]: toolDefinition('铁斧', 'iron-axe', 'axe', 'iron', 250, [0.78, 0.8, 0.79]),
};

export function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && Object.hasOwn(DEFINITIONS, value);
}

export function getItemDefinition(item: ItemType): ItemDefinition {
  return DEFINITIONS[item];
}

export function getItemLabel(item: ItemType | null): string {
  return item === null ? '空手' : getItemDefinition(item).label;
}

export function getItemColor(item: ItemType): ItemRgb {
  return getItemDefinition(item).color;
}

export function itemFromBlock(block: BlockTypeValue): ItemType | null {
  switch (block) {
    case BlockType.Grass: return ItemType.GrassBlock;
    case BlockType.Dirt: return ItemType.DirtBlock;
    case BlockType.Stone: return ItemType.StoneBlock;
    case BlockType.RuneStone: return ItemType.RuneStoneBlock;
    case BlockType.OakLog: return ItemType.OakLogBlock;
    case BlockType.OakLeaves: return ItemType.OakLeavesBlock;
    case BlockType.OakPlanks: return ItemType.OakPlanksBlock;
    case BlockType.CraftingTable: return ItemType.CraftingTableBlock;
    case BlockType.CoalOre: return ItemType.CoalOreBlock;
    case BlockType.IronOre: return ItemType.IronOreBlock;
    case BlockType.Furnace: return ItemType.FurnaceBlock;
    case BlockType.Air: return null;
  }
}

export function itemToBlock(item: ItemType | null): BlockTypeValue | null {
  return item === null ? null : getItemDefinition(item).block;
}

function efficientToolForBlock(block: BlockTypeValue): ToolKind | null {
  switch (block) {
    case BlockType.Grass:
    case BlockType.Dirt:
      return 'shovel';
    case BlockType.Stone:
    case BlockType.RuneStone:
    case BlockType.CoalOre:
    case BlockType.IronOre:
    case BlockType.Furnace:
      return 'pickaxe';
    case BlockType.OakLog:
    case BlockType.OakPlanks:
    case BlockType.CraftingTable:
      return 'axe';
    case BlockType.OakLeaves:
    case BlockType.Air:
      return null;
  }
}

export function getToolTierRank(item: ItemType | null): number {
  if (item === null) {
    return 0;
  }
  const tier = getItemDefinition(item).toolTier;
  return tier === 'iron' ? 3 : tier === 'stone' ? 2 : tier === 'wood' ? 1 : 0;
}

export function getMiningSpeedMultiplier(item: ItemType | null, block: BlockTypeValue): number {
  if (block === BlockType.OakLeaves) {
    return 2.4;
  }
  if (item === null) {
    return 1;
  }
  const definition = getItemDefinition(item);
  if (definition.kind !== 'tool' || definition.toolKind !== efficientToolForBlock(block)) {
    return 1;
  }
  return definition.toolTier === 'iron' ? 7.2 : definition.toolTier === 'stone' ? 5.2 : 3.4;
}

export function getBlockDropItem(block: BlockTypeValue, heldItem: ItemType | null): ItemType | null {
  const heldDefinition = heldItem === null ? null : getItemDefinition(heldItem);
  const usingPickaxe = heldDefinition?.kind === 'tool' && heldDefinition.toolKind === 'pickaxe';
  if (block === BlockType.CoalOre) {
    return usingPickaxe && getToolTierRank(heldItem) >= 1 ? ItemType.Coal : null;
  }
  if (block === BlockType.IronOre) {
    return usingPickaxe && getToolTierRank(heldItem) >= 2 ? ItemType.RawIron : null;
  }
  return itemFromBlock(block);
}

export function isToolItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'tool';
}
