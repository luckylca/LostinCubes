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
  Stick: 'stick',
  WoodenShovel: 'wooden-shovel',
  WoodenPickaxe: 'wooden-pickaxe',
  WoodenAxe: 'wooden-axe',
  StoneShovel: 'stone-shovel',
  StonePickaxe: 'stone-pickaxe',
  StoneAxe: 'stone-axe',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];
export type ToolKind = 'shovel' | 'pickaxe' | 'axe';
export type ToolTier = 'wood' | 'stone';

export interface ItemDefinition {
  readonly label: string;
  readonly kind: 'block' | 'tool' | 'material';
  readonly cssClass: string;
  readonly maximumStack: number;
  readonly block: BlockTypeValue | null;
  readonly maximumDurability: number | null;
  readonly toolKind: ToolKind | null;
  readonly toolTier: ToolTier | null;
}

function blockDefinition(
  label: string,
  cssClass: string,
  block: BlockTypeValue,
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
  };
}

function toolDefinition(
  label: string,
  cssClass: string,
  toolKind: ToolKind,
  toolTier: ToolTier,
  maximumDurability: number,
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
  };
}

const DEFINITIONS: Readonly<Record<ItemType, ItemDefinition>> = {
  [ItemType.GrassBlock]: blockDefinition('草方块', 'grass', BlockType.Grass),
  [ItemType.DirtBlock]: blockDefinition('泥土', 'dirt', BlockType.Dirt),
  [ItemType.StoneBlock]: blockDefinition('石头', 'stone', BlockType.Stone),
  [ItemType.RuneStoneBlock]: blockDefinition(
    '符文石',
    'rune',
    BlockType.RuneStone,
  ),
  [ItemType.OakLogBlock]: blockDefinition(
    '橡木原木',
    'oak-log',
    BlockType.OakLog,
  ),
  [ItemType.OakLeavesBlock]: blockDefinition(
    '橡树树叶',
    'oak-leaves',
    BlockType.OakLeaves,
  ),
  [ItemType.OakPlanksBlock]: blockDefinition(
    '橡木木板',
    'oak-planks',
    BlockType.OakPlanks,
  ),
  [ItemType.CraftingTableBlock]: blockDefinition(
    '工作台',
    'crafting-table',
    BlockType.CraftingTable,
  ),
  [ItemType.Stick]: {
    label: '木棍',
    kind: 'material',
    cssClass: 'stick',
    maximumStack: 64,
    block: null,
    maximumDurability: null,
    toolKind: null,
    toolTier: null,
  },
  [ItemType.WoodenShovel]: toolDefinition(
    '木铲',
    'wooden-shovel',
    'shovel',
    'wood',
    59,
  ),
  [ItemType.WoodenPickaxe]: toolDefinition(
    '木镐',
    'wooden-pickaxe',
    'pickaxe',
    'wood',
    59,
  ),
  [ItemType.WoodenAxe]: toolDefinition(
    '木斧',
    'wooden-axe',
    'axe',
    'wood',
    59,
  ),
  [ItemType.StoneShovel]: toolDefinition(
    '石铲',
    'stone-shovel',
    'shovel',
    'stone',
    131,
  ),
  [ItemType.StonePickaxe]: toolDefinition(
    '石镐',
    'stone-pickaxe',
    'pickaxe',
    'stone',
    131,
  ),
  [ItemType.StoneAxe]: toolDefinition(
    '石斧',
    'stone-axe',
    'axe',
    'stone',
    131,
  ),
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

export function itemFromBlock(block: BlockTypeValue): ItemType | null {
  switch (block) {
    case BlockType.Grass:
      return ItemType.GrassBlock;
    case BlockType.Dirt:
      return ItemType.DirtBlock;
    case BlockType.Stone:
      return ItemType.StoneBlock;
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
    case BlockType.Air:
      return null;
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

export function getMiningSpeedMultiplier(
  item: ItemType | null,
  block: BlockTypeValue,
): number {
  if (block === BlockType.OakLeaves) {
    return 2.4;
  }
  if (item === null) {
    return 1;
  }
  const definition = getItemDefinition(item);
  if (
    definition.kind !== 'tool' ||
    definition.toolKind !== efficientToolForBlock(block)
  ) {
    return 1;
  }
  return definition.toolTier === 'stone' ? 5.2 : 3.4;
}

export function isToolItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'tool';
}
