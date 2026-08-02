import { describe, expect, it } from 'vitest';
import {
  getItemDefinition,
  ItemType,
} from '../src/inventory/ItemDefinitions';
import {
  HOTBAR_START_INDEX,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  PlayerInventory,
  STORAGE_SLOT_COUNT,
} from '../src/inventory/PlayerInventory';
import {
  loadPlayerInventory,
  savePlayerInventory,
} from '../src/inventory/InventoryPersistence';
import { BlockType } from '../src/world/BlockType';

class MemoryStorage {
  readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function emptySlots(): Array<{
  item: null;
  count: number;
  durability: null;
}> {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({
    item: null,
    count: 0,
    durability: null,
  }));
}

describe('PlayerInventory', () => {
  it('starts with empty 27-slot storage and a nine-slot hotbar', () => {
    const inventory = new PlayerInventory();

    expect(inventory.snapshot.slots).toHaveLength(INVENTORY_SLOT_COUNT);
    expect(STORAGE_SLOT_COUNT).toBe(27);
    expect(HOTBAR_SLOT_COUNT).toBe(9);
    expect(inventory.selectedSlot).toBe(0);
    expect(inventory.selectedItem).toBeNull();
    expect(inventory.snapshot.slots.every((slot) => slot.item === null)).toBe(
      true,
    );
  });

  it('migrates legacy nine-slot saves into the new hotbar', () => {
    const inventory = new PlayerInventory({
      selectedSlot: 1,
      slots: [
        { block: BlockType.RuneStone, count: 999 },
        { item: ItemType.WoodenPickaxe, count: 1, durability: 12 },
        { block: 999, count: 12 },
      ],
    });

    expect(inventory.selectedSlot).toBe(1);
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX]?.item).toBe(
      ItemType.RuneStoneBlock,
    );
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX]?.count).toBe(64);
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX + 1]).toEqual({
      item: ItemType.WoodenPickaxe,
      count: 1,
      durability: 12,
    });
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX + 2]?.item).toBeNull();
    expect(inventory.snapshot.slots[0]?.item).toBeNull();
  });

  it('stacks pickups in the hotbar before using storage', () => {
    const maximumStack = getItemDefinition(ItemType.OakLogBlock).maximumStack;
    const slots = emptySlots();
    slots[HOTBAR_START_INDEX] = {
      item: null,
      count: 0,
      durability: null,
    };
    const inventory = new PlayerInventory({ selectedSlot: 0, slots });

    expect(inventory.addItem(ItemType.OakLogBlock, maximumStack + 2)).toBe(0);
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX]).toEqual({
      item: ItemType.OakLogBlock,
      count: maximumStack,
      durability: null,
    });
    expect(inventory.snapshot.slots[HOTBAR_START_INDEX + 1]).toEqual({
      item: ItemType.OakLogBlock,
      count: 2,
      durability: null,
    });
    expect(inventory.snapshot.slots[0]?.item).toBeNull();
  });

  it('consumes recipe ingredients across multiple stacks atomically', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakPlanksBlock, 2);
    inventory.addItem(ItemType.Stick, 3);

    expect(
      inventory.consumeItems([
        { item: ItemType.OakPlanksBlock, count: 1 },
        { item: ItemType.Stick, count: 2 },
      ]),
    ).toBe(true);
    expect(inventory.countItem(ItemType.OakPlanksBlock)).toBe(1);
    expect(inventory.countItem(ItemType.Stick)).toBe(1);

    const before = inventory.snapshot;
    expect(
      inventory.consumeItems([{ item: ItemType.StoneBlock, count: 1 }]),
    ).toBe(false);
    expect(inventory.snapshot).toEqual(before);
  });

  it('supports whole-stack, half-stack, single-item, and swap interactions', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakPlanksBlock, 7);
    const sourceIndex = HOTBAR_START_INDEX;

    let cursor = inventory.interactSlot(sourceIndex, null, true);
    expect(cursor).toEqual({
      item: ItemType.OakPlanksBlock,
      count: 4,
      durability: null,
    });
    expect(inventory.snapshot.slots[sourceIndex]?.count).toBe(3);

    cursor = inventory.interactSlot(0, cursor, true);
    expect(inventory.snapshot.slots[0]?.count).toBe(1);
    expect(cursor?.count).toBe(3);

    cursor = inventory.interactSlot(0, cursor, false);
    expect(inventory.snapshot.slots[0]?.count).toBe(4);
    expect(cursor).toBeNull();

    inventory.addItem(ItemType.StonePickaxe, 1);
    const toolIndex = HOTBAR_START_INDEX + 1;
    cursor = inventory.interactSlot(toolIndex, null, false);
    cursor = inventory.interactSlot(0, cursor, false);
    expect(inventory.snapshot.slots[0]?.item).toBe(ItemType.StonePickaxe);
    expect(cursor?.item).toBe(ItemType.OakPlanksBlock);
  });

  it('uses tier-specific tool speed and removes a broken tool', () => {
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.StoneAxe, 1);
    inventory.selectSlot(0);

    expect(inventory.getMiningSpeed(BlockType.OakLog)).toBeGreaterThan(5);
    expect(inventory.getMiningSpeed(BlockType.Stone)).toBe(1);

    const durability =
      inventory.snapshot.slots[HOTBAR_START_INDEX]?.durability ?? 0;
    for (let index = 0; index < durability; index += 1) {
      inventory.damageSelectedTool();
    }
    expect(inventory.selectedItem).toBeNull();
  });

  it('consumes selected blocks from the actual hotbar index', () => {
    const inventory = new PlayerInventory();
    inventory.addBlock(BlockType.OakPlanks, 1);
    inventory.selectSlot(0);

    expect(inventory.canConsumeSelectedBlock(BlockType.OakPlanks)).toBe(true);
    expect(inventory.consumeSelectedBlock()).toBe(true);
    expect(inventory.selectedBlock).toBeNull();
  });

  it('round-trips through storage by world seed', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.OakLogBlock, 5);
    inventory.addItem(ItemType.WoodenAxe, 1);
    inventory.selectSlot(1);
    savePlayerInventory('world-a', inventory, storage);

    const restored = loadPlayerInventory('world-a', storage);
    expect(restored.snapshot).toEqual(inventory.snapshot);
    expect(loadPlayerInventory('world-b', storage).snapshot.slots).toHaveLength(
      INVENTORY_SLOT_COUNT,
    );
  });
});
