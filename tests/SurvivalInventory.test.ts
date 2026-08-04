import { describe, expect, it } from 'vitest';
import { ItemType } from '../src/inventory/ItemDefinitions';
import {
  HOTBAR_START_INDEX,
  PlayerInventory,
} from '../src/inventory/PlayerInventory';

describe('survival inventory operations', () => {
  it('consumes only the selected food stack', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.Coal, 3);
    inventory.addItem(ItemType.Apple, 2);
    inventory.selectSlot(1);

    expect(inventory.selectedItem).toBe(ItemType.Apple);
    expect(inventory.consumeSelectedItem(ItemType.Apple, 1)).toBe(true);
    expect(inventory.countItem(ItemType.Apple)).toBe(1);
    expect(inventory.countItem(ItemType.Coal)).toBe(3);
    expect(inventory.consumeSelectedItem(ItemType.Coal, 1)).toBe(false);
  });

  it('drains the full inventory and restores damaged tools without repair', () => {
    const inventory = new PlayerInventory();
    expect(
      inventory.addStack({
        item: ItemType.IronAxe,
        count: 1,
        durability: 73,
      }),
    ).toBeNull();
    inventory.addItem(ItemType.Apple, 4);
    inventory.addItem(ItemType.StoneBlock, 9);

    const drained = inventory.drainAllItems();
    expect(drained).toContainEqual({
      item: ItemType.IronAxe,
      count: 1,
      durability: 73,
    });
    expect(drained).toContainEqual({
      item: ItemType.Apple,
      count: 4,
      durability: null,
    });
    expect(inventory.snapshot.slots.every((slot) => slot.item === null)).toBe(
      true,
    );

    const restored = new PlayerInventory();
    for (const stack of drained) {
      expect(restored.addStack(stack)).toBeNull();
    }
    expect(restored.snapshot.slots[HOTBAR_START_INDEX]).toEqual({
      item: ItemType.IronAxe,
      count: 1,
      durability: 73,
    });
    expect(restored.countItem(ItemType.Apple)).toBe(4);
    expect(restored.countItem(ItemType.StoneBlock)).toBe(9);
  });
});
