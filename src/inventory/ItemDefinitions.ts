import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

export const ItemType = {
  GrassBlock: 'grass-block',
  DirtBlock: 'dirt-block',
  StoneBlock: 'stone-block',
  RuneStoneBlock: 'rune-stone-block',
  WoodenShovel: 'wooden-shovel',
  WoodenPickaxe: 'wooden-pickaxe',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export interface ItemDefinition {
  readonly label: string;
  readonly kind: 'block' | 'tool';
  readonly cssClass: string;
  readonly maximumStack: number;
  readonly block: BlockTypeValue | null;
  readonly maximumDurability: number | null;
}

const DEFINITIONS: Readonly<Record<ItemType, ItemDefinition>> = {
  [ItemType.GrassBlock]: {
    label: '草方块',
    kind: 'block',
    cssClass: 'grass',
    maximumStack: 64,
    block: BlockType.Grass,
    maximumDurability: null,
  },
  [ItemType.DirtBlock]: {
    label: '泥土',
    kind: 'block',
    cssClass: 'dirt',
    maximumStack: 64,
    block: BlockType.Dirt,
    maximumDurability: null,
  },
  [ItemType.StoneBlock]: {
    label: '石头',
    kind: 'block',
    cssClass: 'stone',
    maximumStack: 64,
    block: BlockType.Stone,
    maximumDurability: null,
  },
  [ItemType.RuneStoneBlock]: {
    label: '符文石',
    kind: 'block',
    cssClass: 'rune',
    maximumStack: 64,
    block: BlockType.RuneStone,
    maximumDurability: null,
  },
  [ItemType.WoodenShovel]: {
    label: '木铲',
    kind: 'tool',
    cssClass: 'wooden-shovel',
    maximumStack: 1,
    block: null,
    maximumDurability: 48,
  },
  [ItemType.WoodenPickaxe]: {
    label: '木镐',
    kind: 'tool',
    cssClass: 'wooden-pickaxe',
    maximumStack: 1,
    block: null,
    maximumDurability: 64,
  },
};

export function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && value in DEFINITIONS;
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
    case BlockType.Air:
      return null;
  }
}

export function itemToBlock(item: ItemType | null): BlockTypeValue | null {
  return item === null ? null : getItemDefinition(item).block;
}

export function getMiningSpeedMultiplier(
  item: ItemType | null,
  block: BlockTypeValue,
): number {
  if (item === ItemType.WoodenShovel) {
    return block === BlockType.Grass || block === BlockType.Dirt ? 3.4 : 1;
  }
  if (item === ItemType.WoodenPickaxe) {
    return block === BlockType.Stone || block === BlockType.RuneStone ? 3 : 1;
  }
  return 1;
}

export function isToolItem(item: ItemType | null): boolean {
  return item !== null && getItemDefinition(item).kind === 'tool';
}
