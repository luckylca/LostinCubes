import { describe, expect, it } from 'vitest';
import { CraftingGrid, findCraftingMatch } from '../src/crafting/CraftingGrid';
import {
  CRAFTING_RECIPES,
  getVisibleRecipes,
} from '../src/crafting/CraftingRecipes';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { PlayerInventory } from '../src/inventory/PlayerInventory';
import type { InventorySlotSnapshot } from '../src/inventory/PlayerInventory';

const EMPTY: InventorySlotSnapshot = {
  item: null,
  count: 0,
  durability: null,
};

function stack(item: (typeof ItemType)[keyof typeof ItemType], count = 1): InventorySlotSnapshot {
  return { item, count, durability: null };
}

function recipe(id: string) {
  const found = CRAFTING_RECIPES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Missing recipe ${id}`);
  return found;
}

describe('CraftingGrid', () => {
  it('matches a shaped recipe at any valid grid offset', () => {
    const slots = [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      stack(ItemType.Coal),
      EMPTY,
      EMPTY,
      stack(ItemType.Stick),
    ];
    const match = findCraftingMatch(3, slots, [recipe('torches')]);
    expect(match?.recipe.id).toBe('torches');
    expect(match?.consumedSlots).toEqual([5, 8]);
  });

  it('matches the mirrored classic axe shape', () => {
    const slots = [
      EMPTY,
      stack(ItemType.IronIngot),
      stack(ItemType.IronIngot),
      EMPTY,
      stack(ItemType.Stick),
      stack(ItemType.IronIngot),
      EMPTY,
      stack(ItemType.Stick),
      EMPTY,
    ];
    expect(
      findCraftingMatch(3, slots, [recipe('iron-axe')])?.recipe.id,
    ).toBe('iron-axe');
  });

  it('fills every available recipe layer instead of only one craft', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakPlanksBlock, 8);
    const grid = new CraftingGrid(2);
    const table = recipe('crafting-table');

    expect(grid.fillFromRecipe(table, inventory)).toBe(true);
    expect(inventory.countItem(ItemType.OakPlanksBlock)).toBe(0);
    expect(grid.snapshot).toEqual([
      stack(ItemType.OakPlanksBlock, 2),
      stack(ItemType.OakPlanksBlock, 2),
      stack(ItemType.OakPlanksBlock, 2),
      stack(ItemType.OakPlanksBlock, 2),
    ]);

    const first = grid.takeOutput(null, getVisibleRecipes('inventory'));
    expect(first.crafted).toBe(true);
    expect(first.crafts).toBe(1);
    expect(first.cursor).toEqual({
      item: ItemType.CraftingTableBlock,
      count: 1,
      durability: null,
    });
    expect(grid.isEmpty).toBe(false);

    const second = grid.takeOutput(first.cursor, getVisibleRecipes('inventory'));
    expect(second.crafts).toBe(1);
    expect(second.cursor).toEqual({
      item: ItemType.CraftingTableBlock,
      count: 2,
      durability: null,
    });
    expect(grid.isEmpty).toBe(true);
  });

  it('crafts ten logs into forty planks in one maximum-output action', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakLogBlock, 10);
    const grid = new CraftingGrid(2);

    expect(grid.fillFromRecipe(recipe('oak-planks'), inventory)).toBe(true);
    expect(grid.snapshot[0]).toEqual(stack(ItemType.OakLogBlock, 10));

    const result = grid.takeOutput(
      null,
      getVisibleRecipes('inventory'),
      Number.POSITIVE_INFINITY,
    );
    expect(result.crafts).toBe(10);
    expect(result.cursor).toEqual({
      item: ItemType.OakPlanksBlock,
      count: 40,
      durability: null,
    });
    expect(grid.isEmpty).toBe(true);
  });

  it('stops maximum crafting at the output stack limit', () => {
    const grid = new CraftingGrid(2);
    let cursor: InventorySlotSnapshot | null = stack(ItemType.OakLogBlock, 20);
    cursor = grid.interactSlot(0, cursor, false);
    expect(cursor).toBeNull();

    const result = grid.takeOutput(
      stack(ItemType.OakPlanksBlock, 60),
      getVisibleRecipes('inventory'),
      Number.POSITIVE_INFINITY,
    );
    expect(result.crafts).toBe(1);
    expect(result.cursor).toEqual(stack(ItemType.OakPlanksBlock, 64));
    expect(grid.snapshot[0]).toEqual(stack(ItemType.OakLogBlock, 19));
  });

  it('returns remaining grid stacks without losing items', () => {
    const inventory = new PlayerInventory();
    const grid = new CraftingGrid(2);
    let cursor: InventorySlotSnapshot | null = stack(ItemType.Coal, 3);
    cursor = grid.interactSlot(0, cursor, false);
    expect(cursor).toBeNull();
    expect(grid.returnAll(inventory)).toBe(true);
    expect(inventory.countItem(ItemType.Coal)).toBe(3);
    expect(grid.isEmpty).toBe(true);
  });
});