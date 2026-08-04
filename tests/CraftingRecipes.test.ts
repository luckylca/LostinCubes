import { describe, expect, it } from 'vitest';
import {
  CRAFTING_RECIPES,
  getVisibleRecipes,
} from '../src/crafting/CraftingRecipes';
import { ItemType } from '../src/inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../src/inventory/ItemDefinitions';
import { PlayerInventory } from '../src/inventory/PlayerInventory';

function requireRecipe(id: string) {
  const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === id);
  expect(recipe).toBeDefined();
  if (recipe === undefined) throw new Error(`Missing recipe: ${id}`);
  return recipe;
}

describe('crafting recipes', () => {
  it('separates personal and workbench recipes from timed furnace state', () => {
    expect(getVisibleRecipes('inventory').map((recipe) => recipe.id)).toEqual([
      'oak-planks',
      'sticks',
      'crafting-table',
    ]);
    expect(
      getVisibleRecipes('crafting-table').some(
        (recipe) => recipe.id === 'furnace',
      ),
    ).toBe(true);
    expect(
      getVisibleRecipes('crafting-table').some(
        (recipe) => recipe.id === 'iron-pickaxe',
      ),
    ).toBe(true);
    expect(getVisibleRecipes('furnace')).toEqual([]);
    expect(CRAFTING_RECIPES.some((recipe) => recipe.id === 'smelt-iron')).toBe(
      false,
    );
  });

  it('uses Minecraft-style 2x2 workbench and 3x3 furnace shapes', () => {
    const table = requireRecipe('crafting-table');
    expect(table.gridSize).toBe(2);
    expect(table.pattern).toEqual([
      [ItemType.OakPlanksBlock, ItemType.OakPlanksBlock],
      [ItemType.OakPlanksBlock, ItemType.OakPlanksBlock],
    ]);

    const furnace = requireRecipe('furnace');
    expect(furnace.gridSize).toBe(3);
    expect(furnace.pattern).toEqual([
      [ItemType.StoneBlock, ItemType.StoneBlock, ItemType.StoneBlock],
      [ItemType.StoneBlock, null, ItemType.StoneBlock],
      [ItemType.StoneBlock, ItemType.StoneBlock, ItemType.StoneBlock],
    ]);
  });

  it('uses classic shaped patterns for pickaxes, shovels, and axes', () => {
    expect(requireRecipe('wooden-pickaxe').pattern).toEqual([
      [ItemType.OakPlanksBlock, ItemType.OakPlanksBlock, ItemType.OakPlanksBlock],
      [null, ItemType.Stick, null],
      [null, ItemType.Stick, null],
    ]);
    expect(requireRecipe('stone-shovel').pattern).toEqual([
      [null, ItemType.StoneBlock, null],
      [null, ItemType.Stick, null],
      [null, ItemType.Stick, null],
    ]);
    expect(requireRecipe('iron-axe').pattern).toEqual([
      [ItemType.IronIngot, ItemType.IronIngot, null],
      [ItemType.IronIngot, ItemType.Stick, null],
      [null, ItemType.Stick, null],
    ]);
  });

  it('supports the log to stone-tool progression with inventory consumption', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakLogBlock, 3);
    inventory.addItem(ItemType.StoneBlock, 3);
    const planks = requireRecipe('oak-planks');
    const sticks = requireRecipe('sticks');
    const stonePickaxe = requireRecipe('stone-pickaxe');

    expect(inventory.consumeItems(planks.ingredients)).toBe(true);
    inventory.addItem(planks.output.item, planks.output.count);
    expect(inventory.consumeItems(sticks.ingredients)).toBe(true);
    inventory.addItem(sticks.output.item, sticks.output.count);
    expect(inventory.consumeItems(stonePickaxe.ingredients)).toBe(true);
    inventory.addItem(stonePickaxe.output.item, stonePickaxe.output.count);
    expect(inventory.countItem(ItemType.StonePickaxe)).toBe(1);
    expect(inventory.countItem(ItemType.Stick)).toBe(2);
    expect(inventory.countItem(ItemType.StoneBlock)).toBe(0);
  });

  it('keeps all tool recipes at the workbench', () => {
    const toolOutputs = new Set<ItemTypeValue>([
      ItemType.WoodenPickaxe,
      ItemType.WoodenShovel,
      ItemType.WoodenAxe,
      ItemType.StonePickaxe,
      ItemType.StoneShovel,
      ItemType.StoneAxe,
      ItemType.IronPickaxe,
      ItemType.IronShovel,
      ItemType.IronAxe,
    ]);
    for (const recipe of CRAFTING_RECIPES) {
      if (toolOutputs.has(recipe.output.item)) {
        expect(recipe.station).toBe('crafting-table');
        expect(recipe.gridSize).toBe(3);
      }
    }
  });
});
