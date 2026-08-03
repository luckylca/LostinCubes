import { ItemType } from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import type { ItemRequirement } from '../inventory/PlayerInventory';

export type CraftingStation = 'inventory' | 'crafting-table' | 'furnace';

export interface CraftingRecipe {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly station: CraftingStation;
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
    station: 'inventory',
    ingredients: [{ item: ItemType.OakLogBlock, count: 1 }],
    output: { item: ItemType.OakPlanksBlock, count: 4 },
  },
  {
    id: 'sticks',
    label: '木棍 ×4',
    description: '两块木板制作四根木棍。',
    station: 'inventory',
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 2 }],
    output: { item: ItemType.Stick, count: 4 },
  },
  {
    id: 'crafting-table',
    label: '工作台',
    description: '四块木板制作一个工作台。',
    station: 'inventory',
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 4 }],
    output: { item: ItemType.CraftingTableBlock, count: 1 },
  },
  {
    id: 'furnace',
    label: '熔炉',
    description: '八块石头围成熔炉，用煤炭冶炼铁矿。',
    station: 'crafting-table',
    ingredients: [{ item: ItemType.StoneBlock, count: 8 }],
    output: { item: ItemType.FurnaceBlock, count: 1 },
  },
  ...(['pickaxe', 'shovel', 'axe'] as const).flatMap((kind) => {
    const label = kind === 'pickaxe' ? '镐' : kind === 'shovel' ? '铲' : '斧';
    const materialCount = kind === 'shovel' ? 1 : 3;
    const woodenItem = kind === 'pickaxe' ? ItemType.WoodenPickaxe : kind === 'shovel' ? ItemType.WoodenShovel : ItemType.WoodenAxe;
    const stoneItem = kind === 'pickaxe' ? ItemType.StonePickaxe : kind === 'shovel' ? ItemType.StoneShovel : ItemType.StoneAxe;
    const ironItem = kind === 'pickaxe' ? ItemType.IronPickaxe : kind === 'shovel' ? ItemType.IronShovel : ItemType.IronAxe;
    return [
      {
        id: `wooden-${kind}`,
        label: `木${label}`,
        description: `${String(materialCount)} 块木板和两根木棍。`,
        station: 'crafting-table' as const,
        ingredients: [
          { item: ItemType.OakPlanksBlock, count: materialCount },
          { item: ItemType.Stick, count: 2 },
        ],
        output: { item: woodenItem, count: 1 },
      },
      {
        id: `stone-${kind}`,
        label: `石${label}`,
        description: `${String(materialCount)} 块石头和两根木棍。`,
        station: 'crafting-table' as const,
        ingredients: [
          { item: ItemType.StoneBlock, count: materialCount },
          { item: ItemType.Stick, count: 2 },
        ],
        output: { item: stoneItem, count: 1 },
      },
      {
        id: `iron-${kind}`,
        label: `铁${label}`,
        description: `${String(materialCount)} 块铁锭和两根木棍，拥有最高采集速度。`,
        station: 'crafting-table' as const,
        ingredients: [
          { item: ItemType.IronIngot, count: materialCount },
          { item: ItemType.Stick, count: 2 },
        ],
        output: { item: ironItem, count: 1 },
      },
    ];
  }),
  {
    id: 'smelt-iron',
    label: '冶炼铁锭',
    description: '一块粗铁与一块煤炭冶炼为一块铁锭。',
    station: 'furnace',
    ingredients: [
      { item: ItemType.RawIron, count: 1 },
      { item: ItemType.Coal, count: 1 },
    ],
    output: { item: ItemType.IronIngot, count: 1 },
  },
];

export function getVisibleRecipes(station: CraftingStation): readonly CraftingRecipe[] {
  return CRAFTING_RECIPES.filter((recipe) => {
    if (station === 'inventory') return recipe.station === 'inventory';
    if (station === 'crafting-table') {
      return recipe.station === 'inventory' || recipe.station === 'crafting-table';
    }
    return recipe.station === 'furnace';
  });
}
