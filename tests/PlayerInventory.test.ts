import { describe, expect, it } from 'vitest';
import {
  HOTBAR_SLOT_COUNT,
  MAX_BLOCK_STACK,
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
  it('starts with a nine-slot development hotbar and dirt selected', () => {
    const inventory = new PlayerInventory();

    expect(inventory.snapshot.slots).toHaveLength(HOTBAR_SLOT_COUNT);
    expect(inventory.selectedSlot).toBe(1);
    expect(inventory.selectedBlock).toBe(BlockType.Dirt);
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
      slots: [{ block: BlockType.Stone, count: 1 }],
    });

    expect(inventory.canConsumeSelected(BlockType.Stone)).toBe(true);
    expect(inventory.consumeSelected()).toBe(true);
    expect(inventory.selectedBlock).toBeNull();
    expect(inventory.snapshot.slots[0]?.count).toBe(0);
  });

  it('stacks collected blocks before using empty slots', () => {
    const inventory = new PlayerInventory({
      selectedSlot: 0,
      slots: [
        { block: BlockType.Grass, count: MAX_BLOCK_STACK - 1 },
        { block: null, count: 0 },
      ],
    });

    expect(inventory.add(BlockType.Grass, 2)).toBe(0);
    expect(inventory.snapshot.slots[0]?.count).toBe(MAX_BLOCK_STACK);
    expect(inventory.snapshot.slots[1]).toEqual({
      block: BlockType.Grass,
      count: 1,
    });
  });

  it('validates persisted inventory data and restores safe values', () => {
    const inventory = new PlayerInventory({
      selectedSlot: 200,
      slots: [
        { block: BlockType.RuneStone, count: 999 },
        { block: 999, count: 12 },
      ],
    });

    expect(inventory.selectedSlot).toBe(HOTBAR_SLOT_COUNT - 1);
    expect(inventory.snapshot.slots[0]?.count).toBe(MAX_BLOCK_STACK);
    expect(inventory.snapshot.slots[1]).toEqual({ block: null, count: 0 });
  });

  it('round-trips through storage by world seed', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.selectSlot(2);
    inventory.consumeSelected(4);
    savePlayerInventory('world-a', inventory, storage);

    const restored = loadPlayerInventory('world-a', storage);
    expect(restored.snapshot).toEqual(inventory.snapshot);
    expect(loadPlayerInventory('world-b', storage).selectedSlot).toBe(1);
  });
});
