import { ItemType } from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import type { ItemRequirement } from '../inventory/PlayerInventory';

export interface CraftingRecipe {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly requiresTable: boolean;
  readonly ingredients: readonly ItemRequirement[];
  readonly output: {
    readonly item: ItemTypeValue;
    readonly count: number;
  };
}

export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  {
    id: 'oak-planks',
    label: '橡木木板 ×4',
    description: '将一块橡木原木拆成四块木板。',
    requiresTable: false,
    ingredients: [{ item: ItemType.OakLogBlock, count: 1 }],
    output: { item: ItemType.OakPlanksBlock, count: 4 },
  },
  {
    id: 'sticks',
    label: '木棍 ×4',
    description: '两块木板制作四根木棍。',
    requiresTable: false,
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 2 }],
    output: { item: ItemType.Stick, count: 4 },
  },
  {
    id: 'crafting-table',
    label: '工作台',
    description: '四块木板制作一个工作台，放置后可制作工具。',
    requiresTable: false,
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 4 }],
    output: { item: ItemType.CraftingTableBlock, count: 1 },
  },
  {
    id: 'wooden-pickaxe',
    label: '木镐',
    description: '三块木板和两根木棍。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.OakPlanksBlock, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.WoodenPickaxe, count: 1 },
  },
  {
    id: 'wooden-shovel',
    label: '木铲',
    description: '一块木板和两根木棍。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.OakPlanksBlock, count: 1 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.WoodenShovel, count: 1 },
  },
  {
    id: 'wooden-axe',
    label: '木斧',
    description: '三块木板和两根木棍。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.OakPlanksBlock, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.WoodenAxe, count: 1 },
  },
  {
    id: 'stone-pickaxe',
    label: '石镐',
    description: '三块石头和两根木棍，采石速度更快。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.StoneBlock, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.StonePickaxe, count: 1 },
  },
  {
    id: 'stone-shovel',
    label: '石铲',
    description: '一块石头和两根木棍。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.StoneBlock, count: 1 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.StoneShovel, count: 1 },
  },
  {
    id: 'stone-axe',
    label: '石斧',
    description: '三块石头和两根木棍，砍伐速度更快。',
    requiresTable: true,
    ingredients: [
      { item: ItemType.StoneBlock, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    output: { item: ItemType.StoneAxe, count: 1 },
  },
];

export function getVisibleRecipes(usingCraftingTable: boolean): readonly CraftingRecipe[] {
  return CRAFTING_RECIPES.filter(
    (recipe) => usingCraftingTable || !recipe.requiresTable,
  );
}
