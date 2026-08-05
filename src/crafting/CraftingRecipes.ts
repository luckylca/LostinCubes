import { ItemType } from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import type { ItemRequirement } from '../inventory/PlayerInventory';

export type CraftingStation = 'inventory' | 'crafting-table' | 'furnace';
export type CraftingPatternCell = ItemTypeValue | null;

export interface CraftingRecipe {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly station: Exclude<CraftingStation, 'furnace'>;
  readonly gridSize: 2 | 3;
  readonly pattern: readonly (readonly CraftingPatternCell[])[];
  readonly ingredients: readonly ItemRequirement[];
  readonly allowMirror?: boolean;
  readonly output: {
    readonly item: ItemTypeValue;
    readonly count: number;
  };
}

const EMPTY = null;

const personalRecipes: readonly CraftingRecipe[] = [
  {
    id: 'oak-planks',
    label: '橡木木板 ×4',
    description: '把一块原木放进任意一个随身合成格。',
    station: 'inventory',
    gridSize: 2,
    pattern: [[ItemType.OakLogBlock, EMPTY], [EMPTY, EMPTY]],
    ingredients: [{ item: ItemType.OakLogBlock, count: 1 }],
    output: { item: ItemType.OakPlanksBlock, count: 4 },
  },
  {
    id: 'sticks',
    label: '木棍 ×4',
    description: '两块木板上下排列。',
    station: 'inventory',
    gridSize: 2,
    pattern: [[ItemType.OakPlanksBlock, EMPTY], [ItemType.OakPlanksBlock, EMPTY]],
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 2 }],
    output: { item: ItemType.Stick, count: 4 },
  },
  {
    id: 'crafting-table',
    label: '工作台',
    description: '四块木板填满随身 2×2 合成区。',
    station: 'inventory',
    gridSize: 2,
    pattern: [
      [ItemType.OakPlanksBlock, ItemType.OakPlanksBlock],
      [ItemType.OakPlanksBlock, ItemType.OakPlanksBlock],
    ],
    ingredients: [{ item: ItemType.OakPlanksBlock, count: 4 }],
    output: { item: ItemType.CraftingTableBlock, count: 1 },
  },
  {
    id: 'torches',
    label: '火把 ×4',
    description: '煤炭放在木棍上方。火把会发出 14 级方块光。',
    station: 'inventory',
    gridSize: 2,
    pattern: [[ItemType.Coal, EMPTY], [ItemType.Stick, EMPTY]],
    ingredients: [
      { item: ItemType.Coal, count: 1 },
      { item: ItemType.Stick, count: 1 },
    ],
    output: { item: ItemType.TorchBlock, count: 4 },
  },
];

const furnaceRecipe: CraftingRecipe = {
  id: 'furnace',
  label: '熔炉',
  description: '在工作台 3×3 中用八块圆石围一圈，中间留空。',
  station: 'crafting-table',
  gridSize: 3,
  pattern: [
    [ItemType.CobblestoneBlock, ItemType.CobblestoneBlock, ItemType.CobblestoneBlock],
    [ItemType.CobblestoneBlock, EMPTY, ItemType.CobblestoneBlock],
    [ItemType.CobblestoneBlock, ItemType.CobblestoneBlock, ItemType.CobblestoneBlock],
  ],
  ingredients: [{ item: ItemType.CobblestoneBlock, count: 8 }],
  output: { item: ItemType.FurnaceBlock, count: 1 },
};

function toolPattern(
  kind: 'pickaxe' | 'shovel' | 'axe',
  material: ItemTypeValue,
): readonly (readonly CraftingPatternCell[])[] {
  if (kind === 'pickaxe') {
    return [
      [material, material, material],
      [EMPTY, ItemType.Stick, EMPTY],
      [EMPTY, ItemType.Stick, EMPTY],
    ];
  }
  if (kind === 'shovel') {
    return [
      [EMPTY, material, EMPTY],
      [EMPTY, ItemType.Stick, EMPTY],
      [EMPTY, ItemType.Stick, EMPTY],
    ];
  }
  return [
    [material, material, EMPTY],
    [material, ItemType.Stick, EMPTY],
    [EMPTY, ItemType.Stick, EMPTY],
  ];
}

const toolRecipes = (['pickaxe', 'shovel', 'axe'] as const).flatMap(
  (kind): readonly CraftingRecipe[] => {
    const label = kind === 'pickaxe' ? '镐' : kind === 'shovel' ? '铲' : '斧';
    const materialCount = kind === 'shovel' ? 1 : 3;
    const tiers = [
      {
        id: 'wooden',
        label: '木',
        material: ItemType.OakPlanksBlock,
        output:
          kind === 'pickaxe'
            ? ItemType.WoodenPickaxe
            : kind === 'shovel'
              ? ItemType.WoodenShovel
              : ItemType.WoodenAxe,
      },
      {
        id: 'stone',
        label: '石',
        material: ItemType.CobblestoneBlock,
        output:
          kind === 'pickaxe'
            ? ItemType.StonePickaxe
            : kind === 'shovel'
              ? ItemType.StoneShovel
              : ItemType.StoneAxe,
      },
      {
        id: 'iron',
        label: '铁',
        material: ItemType.IronIngot,
        output:
          kind === 'pickaxe'
            ? ItemType.IronPickaxe
            : kind === 'shovel'
              ? ItemType.IronShovel
              : ItemType.IronAxe,
      },
    ] as const;

    return tiers.map((tier) => ({
      id: `${tier.id}-${kind}`,
      label: `${tier.label}${label}`,
      description: `${String(materialCount)} 个${tier.label === '木' ? '木板' : tier.label === '石' ? '圆石' : '铁锭'}和两根木棍，按经典工具形状摆放。`,
      station: 'crafting-table',
      gridSize: 3,
      pattern: toolPattern(kind, tier.material),
      ingredients: [
        { item: tier.material, count: materialCount },
        { item: ItemType.Stick, count: 2 },
      ],
      allowMirror: kind === 'axe',
      output: { item: tier.output, count: 1 },
    }));
  },
);

export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  ...personalRecipes,
  furnaceRecipe,
  ...toolRecipes,
];

export function getVisibleRecipes(
  station: CraftingStation,
): readonly CraftingRecipe[] {
  return CRAFTING_RECIPES.filter((recipe) => {
    if (station === 'inventory') return recipe.station === 'inventory';
    if (station === 'crafting-table') return true;
    return false;
  });
}
