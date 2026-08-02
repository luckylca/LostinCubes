import { describe, expect, it } from 'vitest';
import {
  getItemDefinition,
  ItemType,
} from '../src/inventory/ItemDefinitions';
import {
  HOTBAR_SLOT_COUNT,
  PlayerInventory,
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

describe('PlayerInventory', () => {
  it('starts with blocks, tools, nine slots, and dirt selected', () => {
    const inventory = new PlayerInventory();

    expect(inventory.snapshot.slots).toHaveLength(HOTBAR_SLOT_COUNT);
    expect(inventory.selectedSlot).toBe(1);
    expect(inventory.selectedBlock).toBe(BlockType.Dirt);
    expect(inventory.snapshot.slots[4]?.item).toBe(ItemType.WoodenShovel);
    expect(inventory.snapshot.slots[5]?.item).toBe(ItemType.WoodenPickaxe);
  });

  it('cycles selection with wraparound', () => {
    const inventory = new PlayerInventory();
    inventory.selectSlot(0);
    inventory.cycleSelection(-1);

    expect(inventory.selectedSlot).toBe(HOTBAR_SLOT_COUNT - 1);
    inventory.cycleSelection(1);
    expect(inventory.selectedSlot).toBe(0);
  });

  it('consumes placed blocks and clears an empty stack', () => {
    const inventory = new PlayerInventory({
      selectedSlot: 0,
      slots: [{ item: ItemType.StoneBlock, count: 1 }],
    });

    expect(inventory.canConsumeSelectedBlock(BlockType.Stone)).toBe(true);
    expect(inventory.consumeSelectedBlock()).toBe(true);
    expect(inventory.selectedBlock).toBeNull();
    expect(inventory.snapshot.slots[0]).toEqual({
      item: null,
      count: 0,
      durability: null,
    });
  });

  it('stacks collected blocks before using empty slots', () => {
    const maximumStack = getItemDefinition(ItemType.GrassBlock).maximumStack;
    const inventory = new PlayerInventory({
      selectedSlot: 0,
      slots: [
        { item: ItemType.GrassBlock, count: maximumStack - 1 },
        { item: null, count: 0 },
      ],
    });

    expect(inventory.addBlock(BlockType.Grass, 2)).toBe(0);
    expect(inventory.snapshot.slots[0]?.count).toBe(maximumStack);
    expect(inventory.snapshot.slots[1]).toEqual({
      item: ItemType.GrassBlock,
      count: 1,
      durability: null,
    });
  });

  it('uses the correct tool multiplier and removes a broken tool', () => {
    const inventory = new PlayerInventory();
    inventory.selectSlot(4);

    expect(inventory.getMiningSpeed(BlockType.Dirt)).toBeGreaterThan(3);
    expect(inventory.getMiningSpeed(BlockType.Stone)).toBe(1);

    const durability = inventory.snapshot.slots[4]?.durability ?? 0;
    for (let index = 0; index < durability; index += 1) {
      inventory.damageSelectedTool();
    }
    expect(inventory.selectedItem).toBeNull();
  });

  it('migrates legacy block saves and injects starter tools into empty slots', () => {
    const inventory = new PlayerInventory({
      selectedSlot: 0,
      slots: [
        { block: BlockType.RuneStone, count: 999 },
        { block: 999, count: 12 },
      ],
    });

    expect(inventory.snapshot.slots[0]?.item).toBe(ItemType.RuneStoneBlock);
    expect(inventory.snapshot.slots[0]?.count).toBe(64);
    expect(inventory.snapshot.slots[1]?.item).toBeNull();
    expect(inventory.snapshot.slots.some((slot) => slot.item === ItemType.WoodenShovel)).toBe(true);
    expect(inventory.snapshot.slots.some((slot) => slot.item === ItemType.WoodenPickaxe)).toBe(true);
  });

  it('round-trips through storage by world seed', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.selectSlot(2);
    inventory.consumeSelectedBlock(4);
    savePlayerInventory('world-a', inventory, storage);

    const restored = loadPlayerInventory('world-a', storage);
    expect(restored.snapshot).toEqual(inventory.snapshot);
    expect(loadPlayerInventory('world-b', storage).selectedSlot).toBe(1);
  });
});
