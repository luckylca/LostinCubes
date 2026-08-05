import {
  getBlockDefinition,
  type BlockToolKind,
} from '../world/BlockRegistry';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

export const ItemType = {
  GrassBlock: 'grass-block',
  DirtBlock: 'dirt-block',
  StoneBlock: 'stone-block',
  CobblestoneBlock: 'cobblestone-block',
  RuneStoneBlock: 'rune-stone-block',
  OakLogBlock: 'oak-log-block',
  OakLeavesBlock: 'oak-leaves-block',
  OakPlanksBlock: 'oak-planks-block',
  CraftingTableBlock: 'crafting-table-block',
  CoalOreBlock: 'coal-ore-block',
  IronOreBlock: 'iron-ore-block',
  FurnaceBlock: 'furnace-block',
  TorchBlock: 'torch-block',
  Stick: 'stick',
  Coal: 'coal',
  RawIron: 'raw-iron',
  IronIngot: 'iron-ingot',
  Apple: 'apple',
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
export type ToolKind = BlockToolKind;
export type ToolTier = 'wood' | 'stone' | 'iron';
export type ItemRgb = readonly [red: number, green: number, blue: number];

export interface ItemDefinition {
  readonly label: string;
  readonly kind: 'block' | 'tool' | 'material' | 'food';
  readonly cssClass: string;
  readonly maximumStack: number;
  readonly block: BlockTypeValue | null;
  readonly maximumDurability: number | null;
  readonly toolKind: ToolKind | null;
  readonly toolTier: ToolTier | null;
  readonly miningMultiplier: number;
  readonly meleeDamage: number;
  readonly healing: number;
  readonly fuelSeconds: number;
  readonly color: ItemRgb;
}

function blockDefinition(
  label: string,
  cssClass: string,
  block: BlockTypeValue,
  color: ItemRgb,
  fuelSeconds = 0,
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
    miningMultiplier: 1,
    meleeDamage: 2,
    healing: 0,
    fuelSeconds,
    color,
  };
}

function materialDefinition(
  label: string,
  cssClass: string,
  color: ItemRgb,
  fuelSeconds = 0,
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
    miningMultiplier: 1,
    meleeDamage: 2,
    healing: 0,
    fuelSeconds,
    color,
  };
}

function foodDefinition(
  label: string,
  cssClass: string,
  healing: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    label,
    kind: 'food',
    cssClass,
    maximumStack: 16,
    block: null,
    maximumDurability: null,
    toolKind: null,
    toolTier: null,
    miningMultiplier: 1,
    meleeDamage: 2,
    healing,
    fuelSeconds: 0,
    color,
  };
}

function toolDefinition(
  label: string,
  cssClass: string,
  toolKind: ToolKind,
  toolTier: ToolTier,
  maximumDurability: number,
  miningMultiplier: number,
  meleeDamage: number,
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
    miningMultiplier,
    meleeDamage,
    healing: 0,
    fuelSeconds: 0,
    color,
  };
}

const DEFINITIONS: Readonly<Record<ItemType, ItemDefinition>> = {
  [ItemType.GrassBlock]: blockDefinition('草方块', 'grass', BlockType.Grass, [0.38, 0.61, 0.24]),
  [ItemType.DirtBlock]: blockDefinition('泥土', 'dirt', BlockType.Dirt, [0.48, 0.32, 0.2]),
  [ItemType.StoneBlock]: blockDefinition('石头', 'stone', BlockType.Stone, [0.53, 0.55, 0.54]),
  [ItemType.CobblestoneBlock]: blockDefinition('圆石', 'cobblestone', BlockType.Cobblestone, [0.45, 0.47, 0.46]),
  [ItemType.RuneStoneBlock]: blockDefinition('符文石', 'rune', BlockType.RuneStone, [0.16, 0.43, 0.3]),
  [ItemType.OakLogBlock]: blockDefinition('橡木原木', 'oak-log', BlockType.OakLog, [0.43, 0.28, 0.13], 1.5),
  [ItemType.OakLeavesBlock]: blockDefinition('橡树树叶', 'oak-leaves', BlockType.OakLeaves, [0.23, 0.49, 0.19]),
  [ItemType.OakPlanksBlock]: blockDefinition('橡木木板', 'oak-planks', BlockType.OakPlanks, [0.67, 0.48, 0.26], 1.5),
  [ItemType.CraftingTableBlock]: blockDefinition('工作台', 'crafting-table', BlockType.CraftingTable, [0.5, 0.32, 0.16], 1.5),
  [ItemType.CoalOreBlock]: blockDefinition('煤矿石', 'coal-ore', BlockType.CoalOre, [0.25, 0.26, 0.26]),
  [ItemType.IronOreBlock]: blockDefinition('铁矿石', 'iron-ore', BlockType.IronOre, [0.58, 0.43, 0.33]),
  [ItemType.FurnaceBlock]: blockDefinition('熔炉', 'furnace', BlockType.Furnace, [0.38, 0.4, 0.39]),
  [ItemType.TorchBlock]: blockDefinition('火把', 'torch', BlockType.Torch, [0.93, 0.66, 0.23]),
  [ItemType.Stick]: materialDefinition('木棍', 'stick', [0.57, 0.39, 0.2], 0.5),
  [ItemType.Coal]: materialDefinition('煤炭', 'coal', [0.08, 0.09, 0.1], 12),
  [ItemType.RawIron]: materialDefinition('粗铁', 'raw-iron', [0.61, 0.42, 0.3]),
  [ItemType.IronIngot]: materialDefinition('铁锭', 'iron-ingot', [0.77, 0.79, 0.77]),
  [ItemType.Apple]: foodDefinition('苹果', 'apple', 4, [0.72, 0.08, 0.07]),
  [ItemType.WoodenShovel]: toolDefinition('木铲', 'wooden-shovel', 'shovel', 'wood', 59, 3.4, 3, [0.58, 0.4, 0.21]),
  [ItemType.WoodenPickaxe]: toolDefinition('木镐', 'wooden-pickaxe', 'pickaxe', 'wood', 59, 3.4, 4, [0.58, 0.4, 0.21]),
  [ItemType.WoodenAxe]: toolDefinition('木斧', 'wooden-axe', 'axe', 'wood', 59, 3.4, 5, [0.58, 0.4, 0.21]),
  [ItemType.StoneShovel]: toolDefinition('石铲', 'stone-shovel', 'shovel', 'stone', 131, 5.2, 4, [0.48, 0.5, 0.49]),
  [ItemType.StonePickaxe]: toolDefinition('石镐', 'stone-pickaxe', 'pickaxe', 'stone', 131, 5.2, 5, [0.48, 0.5, 0.49]),
  [ItemType.StoneAxe]: toolDefinition('石斧', 'stone-axe', 'axe', 'stone', 131, 5.2, 7, [0.48, 0.5, 0.49]),
  [ItemType.IronShovel]: toolDefinition('铁铲', 'iron-shovel', 'shovel', 'iron', 250, 7.2, 5, [0.78, 0.8, 0.79]),
  [ItemType.IronPickaxe]: toolDefinition('铁镐', 'iron-pickaxe', 'pickaxe', 'iron', 250, 7.2, 6, [0.78, 0.8, 0.79]),
  [ItemType.IronAxe]: toolDefinition('铁斧', 'iron-axe', 'axe', 'iron', 250, 7.2, 9, [0.78, 0.8, 0.79]),
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

export function getFoodHealing(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).healing;
}

export function getFuelSeconds(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).fuelSeconds;
}

export function isFoodItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'food';
}

export function itemFromBlock(block: BlockTypeValue): ItemType | null {
  switch (block) {
    case BlockType.Grass: return ItemType.GrassBlock;
    case BlockType.Dirt: return ItemType.DirtBlock;
    case BlockType.Stone: return ItemType.StoneBlock;
    case BlockType.Cobblestone: return ItemType.CobblestoneBlock;
    case BlockType.RuneStone: return ItemType.RuneStoneBlock;
    case BlockType.OakLog: return ItemType.OakLogBlock;
    case BlockType.OakLeaves: return ItemType.OakLeavesBlock;
    case BlockType.OakPlanks: return ItemType.OakPlanksBlock;
    case BlockType.CraftingTable: return ItemType.CraftingTableBlock;
    case BlockType.CoalOre: return ItemType.CoalOreBlock;
    case BlockType.IronOre: return ItemType.IronOreBlock;
    case BlockType.Furnace: return ItemType.FurnaceBlock;
    case BlockType.Torch: return ItemType.TorchBlock;
    case BlockType.Air:
    default:
      return null;
  }
}

export function itemToBlock(item: ItemType | null): BlockTypeValue | null {
  return item === null ? null : getItemDefinition(item).block;
}

export function getToolTierRank(item: ItemType | null): number {
  if (item === null) return 0;
  const tier = getItemDefinition(item).toolTier;
  return tier === 'iron' ? 3 : tier === 'stone' ? 2 : tier === 'wood' ? 1 : 0;
}

export function getMiningSpeedMultiplier(
  item: ItemType | null,
  block: BlockTypeValue,
): number {
  const blockDefinition = getBlockDefinition(block);
  if (block === BlockType.OakLeaves || block === BlockType.Torch) {
    return block === BlockType.Torch ? 20 : 2.4;
  }
  if (item === null) return 1;
  const definition = getItemDefinition(item);
  if (
    definition.kind !== 'tool' ||
    definition.toolKind !== blockDefinition.preferredTool
  ) {
    return 1;
  }
  return definition.miningMultiplier;
}

export function getMeleeDamage(item: ItemType | null): number {
  return item === null ? 2 : getItemDefinition(item).meleeDamage;
}

function canHarvestBlock(
  block: BlockTypeValue,
  heldItem: ItemType | null,
): boolean {
  const definition = getBlockDefinition(block);
  if (definition.minimumToolTierRank <= 0) return true;
  if (heldItem === null) return false;
  const held = getItemDefinition(heldItem);
  return (
    held.kind === 'tool' &&
    held.toolKind === definition.preferredTool &&
    getToolTierRank(heldItem) >= definition.minimumToolTierRank
  );
}

export function getBlockDropItem(
  block: BlockTypeValue,
  heldItem: ItemType | null,
): ItemType | null {
  if (!canHarvestBlock(block, heldItem)) return null;
  if (block === BlockType.Stone) return ItemType.CobblestoneBlock;
  if (block === BlockType.CoalOre) return ItemType.Coal;
  if (block === BlockType.IronOre) return ItemType.RawIron;
  return itemFromBlock(block);
}

export function isToolItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'tool';
}
