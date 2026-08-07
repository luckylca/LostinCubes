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
  SandBlock: 'sand-block',
  GravelBlock: 'gravel-block',
  ClayBlock: 'clay-block',
  SnowBlock: 'snow-block',
  LadderBlock: 'ladder-block',
  OakSaplingBlock: 'oak-sapling-block',
  TallGrassBlock: 'tall-grass-block',
  DandelionBlock: 'dandelion-block',
  Stick: 'stick',
  Coal: 'coal',
  RawIron: 'raw-iron',
  IronIngot: 'iron-ingot',
  Apple: 'apple',
  String: 'string',
  Bone: 'bone',
  Gunpowder: 'gunpowder',
  Feather: 'feather',
  Leather: 'leather',
  Wool: 'wool',
  RawPorkchop: 'raw-porkchop',
  RawBeef: 'raw-beef',
  Bow: 'bow',
  Arrow: 'arrow',
  Tnt: 'tnt',
  IronHelmet: 'iron-helmet',
  IronChestplate: 'iron-chestplate',
  IronLeggings: 'iron-leggings',
  IronBoots: 'iron-boots',
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
export type RandomSource = () => number;

export interface ItemDefinition {
  readonly label: string;
  readonly kind: 'block' | 'tool' | 'material' | 'food' | 'weapon' | 'armor';
  readonly cssClass: string;
  readonly maximumStack: number;
  readonly block: BlockTypeValue | null;
  readonly maximumDurability: number | null;
  readonly toolKind: ToolKind | null;
  readonly toolTier: ToolTier | null;
  readonly miningMultiplier: number;
  readonly meleeDamage: number;
  readonly rangedDamage: number;
  readonly healing: number;
  readonly hungerRestore: number;
  readonly armorPoints: number;
  readonly fuelSeconds: number;
  readonly color: ItemRgb;
}

const LEAF_SAPLING_DROP_CHANCE = 0.05;

function baseDefinition(
  label: string,
  kind: ItemDefinition['kind'],
  cssClass: string,
  maximumStack: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    label,
    kind,
    cssClass,
    maximumStack,
    block: null,
    maximumDurability: null,
    toolKind: null,
    toolTier: null,
    miningMultiplier: 1,
    meleeDamage: 2,
    rangedDamage: 0,
    healing: 0,
    hungerRestore: 0,
    armorPoints: 0,
    fuelSeconds: 0,
    color,
  };
}

function blockDefinition(
  label: string,
  cssClass: string,
  block: BlockTypeValue,
  color: ItemRgb,
  fuelSeconds = 0,
): ItemDefinition {
  return {
    ...baseDefinition(label, 'block', cssClass, 64, color),
    block,
    fuelSeconds,
  };
}

function materialDefinition(
  label: string,
  cssClass: string,
  color: ItemRgb,
  fuelSeconds = 0,
): ItemDefinition {
  return {
    ...baseDefinition(label, 'material', cssClass, 64, color),
    fuelSeconds,
  };
}

function foodDefinition(
  label: string,
  cssClass: string,
  healing: number,
  hungerRestore: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    ...baseDefinition(label, 'food', cssClass, 16, color),
    healing,
    hungerRestore,
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
    ...baseDefinition(label, 'tool', cssClass, 1, color),
    maximumDurability,
    toolKind,
    toolTier,
    miningMultiplier,
    meleeDamage,
  };
}

function weaponDefinition(
  label: string,
  cssClass: string,
  maximumDurability: number,
  rangedDamage: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    ...baseDefinition(label, 'weapon', cssClass, 1, color),
    maximumDurability,
    rangedDamage,
  };
}

function armorDefinition(
  label: string,
  cssClass: string,
  armorPoints: number,
  color: ItemRgb,
): ItemDefinition {
  return {
    ...baseDefinition(label, 'armor', cssClass, 1, color),
    armorPoints,
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
  [ItemType.SandBlock]: blockDefinition('沙子', 'sand', BlockType.Sand, [0.82, 0.76, 0.51]),
  [ItemType.GravelBlock]: blockDefinition('沙砾', 'gravel', BlockType.Gravel, [0.48, 0.46, 0.45]),
  [ItemType.ClayBlock]: blockDefinition('黏土块', 'clay', BlockType.Clay, [0.58, 0.64, 0.67]),
  [ItemType.SnowBlock]: blockDefinition('雪块', 'snow', BlockType.Snow, [0.92, 0.96, 0.98]),
  [ItemType.LadderBlock]: blockDefinition('梯子', 'ladder', BlockType.Ladder, [0.58, 0.39, 0.18], 1.5),
  [ItemType.OakSaplingBlock]: blockDefinition('橡树树苗', 'oak-sapling', BlockType.OakSapling, [0.25, 0.55, 0.18]),
  [ItemType.TallGrassBlock]: blockDefinition('高草', 'tall-grass', BlockType.TallGrass, [0.27, 0.57, 0.2]),
  [ItemType.DandelionBlock]: blockDefinition('蒲公英', 'dandelion', BlockType.Dandelion, [0.84, 0.7, 0.15]),
  [ItemType.Stick]: materialDefinition('木棍', 'stick', [0.57, 0.39, 0.2], 0.5),
  [ItemType.Coal]: materialDefinition('煤炭', 'coal', [0.08, 0.09, 0.1], 12),
  [ItemType.RawIron]: materialDefinition('粗铁', 'raw-iron', [0.61, 0.42, 0.3]),
  [ItemType.IronIngot]: materialDefinition('铁锭', 'iron-ingot', [0.77, 0.79, 0.77]),
  [ItemType.Apple]: foodDefinition('苹果', 'apple', 2, 4, [0.72, 0.08, 0.07]),
  [ItemType.String]: materialDefinition('线', 'string', [0.82, 0.82, 0.78]),
  [ItemType.Bone]: materialDefinition('骨头', 'bone', [0.86, 0.84, 0.73]),
  [ItemType.Gunpowder]: materialDefinition('火药', 'gunpowder', [0.28, 0.3, 0.29]),
  [ItemType.Feather]: materialDefinition('羽毛', 'feather', [0.94, 0.94, 0.9]),
  [ItemType.Leather]: materialDefinition('皮革', 'leather', [0.48, 0.26, 0.12]),
  [ItemType.Wool]: materialDefinition('羊毛', 'wool', [0.9, 0.9, 0.86]),
  [ItemType.RawPorkchop]: foodDefinition('生猪排', 'raw-porkchop', 0, 3, [0.72, 0.35, 0.37]),
  [ItemType.RawBeef]: foodDefinition('生牛肉', 'raw-beef', 0, 3, [0.56, 0.18, 0.16]),
  [ItemType.Bow]: weaponDefinition('弓', 'bow', 384, 6, [0.47, 0.3, 0.16]),
  [ItemType.Arrow]: materialDefinition('箭', 'arrow', [0.72, 0.72, 0.68]),
  [ItemType.Tnt]: materialDefinition('TNT', 'tnt', [0.75, 0.12, 0.09]),
  [ItemType.IronHelmet]: armorDefinition('铁头盔', 'iron-helmet', 2, [0.76, 0.78, 0.78]),
  [ItemType.IronChestplate]: armorDefinition('铁胸甲', 'iron-chestplate', 6, [0.76, 0.78, 0.78]),
  [ItemType.IronLeggings]: armorDefinition('铁护腿', 'iron-leggings', 5, [0.76, 0.78, 0.78]),
  [ItemType.IronBoots]: armorDefinition('铁靴子', 'iron-boots', 2, [0.76, 0.78, 0.78]),
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

export function getFoodHunger(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).hungerRestore;
}

export function getArmorPoints(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).armorPoints;
}

export function getRangedDamage(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).rangedDamage;
}

export function getFuelSeconds(item: ItemType | null): number {
  return item === null ? 0 : getItemDefinition(item).fuelSeconds;
}

export function isFoodItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'food';
}

export function isArmorItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'armor';
}

export function isBowItem(item: ItemType | null): boolean {
  return item === ItemType.Bow;
}

export function isArrowItem(item: ItemType | null): boolean {
  return item === ItemType.Arrow;
}

export function isTntItem(item: ItemType | null): boolean {
  return item === ItemType.Tnt;
}

export function itemFromBlock(block: BlockTypeValue): ItemType | null {
  switch (block) {
    case BlockType.Grass:
      return ItemType.GrassBlock;
    case BlockType.Dirt:
      return ItemType.DirtBlock;
    case BlockType.Stone:
      return ItemType.StoneBlock;
    case BlockType.Cobblestone:
      return ItemType.CobblestoneBlock;
    case BlockType.RuneStone:
      return ItemType.RuneStoneBlock;
    case BlockType.OakLog:
      return ItemType.OakLogBlock;
    case BlockType.OakLeaves:
      return ItemType.OakLeavesBlock;
    case BlockType.OakPlanks:
      return ItemType.OakPlanksBlock;
    case BlockType.CraftingTable:
      return ItemType.CraftingTableBlock;
    case BlockType.CoalOre:
      return ItemType.CoalOreBlock;
    case BlockType.IronOre:
      return ItemType.IronOreBlock;
    case BlockType.Furnace:
      return ItemType.FurnaceBlock;
    case BlockType.Torch:
      return ItemType.TorchBlock;
    case BlockType.Sand:
      return ItemType.SandBlock;
    case BlockType.Gravel:
      return ItemType.GravelBlock;
    case BlockType.Clay:
      return ItemType.ClayBlock;
    case BlockType.Snow:
      return ItemType.SnowBlock;
    case BlockType.Ladder:
      return ItemType.LadderBlock;
    case BlockType.OakSapling:
      return ItemType.OakSaplingBlock;
    case BlockType.TallGrass:
      return ItemType.TallGrassBlock;
    case BlockType.Dandelion:
      return ItemType.DandelionBlock;
    case BlockType.Air:
    case BlockType.Water:
    case BlockType.Lava:
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
  if (blockDefinition.renderShape === 'cross' || block === BlockType.OakLeaves) {
    return block === BlockType.OakLeaves ? 2.4 : 20;
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
  random: RandomSource = Math.random,
): ItemType | null {
  if (!canHarvestBlock(block, heldItem)) return null;
  if (block === BlockType.Stone) return ItemType.CobblestoneBlock;
  if (block === BlockType.CoalOre) return ItemType.Coal;
  if (block === BlockType.IronOre) return ItemType.RawIron;
  if (block === BlockType.OakLeaves) {
    return random() < LEAF_SAPLING_DROP_CHANCE ? ItemType.OakSaplingBlock : null;
  }
  if (block === BlockType.TallGrass) return null;
  return itemFromBlock(block);
}

export function isToolItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'tool';
}
