import { describe, expect, it } from 'vitest';
import {
  FURNACE_BURN_SECONDS_PER_COAL,
  FURNACE_SMELT_SECONDS,
  FurnaceManager,
} from '../src/crafting/FurnaceManager';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { PlayerInventory } from '../src/inventory/PlayerInventory';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  public get length(): number {
    return this.values.size;
  }

  public clear(): void {
    this.values.clear();
  }

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const POSITION = { x: 4, y: 8, z: -3 } as const;

function advance(manager: FurnaceManager, seconds: number): void {
  const steps = Math.ceil(seconds / 0.25);
  for (let index = 0; index < steps; index += 1) {
    manager.update(Math.min(0.25, seconds - index * 0.25));
  }
}

describe('FurnaceManager', () => {
  it('consumes one coal over twelve seconds and smelts three iron ingots', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.RawIron, 3);
    inventory.addItem(ItemType.Coal, 1);
    const manager = new FurnaceManager('world-a', storage);

    expect(manager.insertInput(POSITION, inventory, 64)).toBe(3);
    expect(manager.insertFuel(POSITION, inventory, 64)).toBe(1);
    advance(manager, FURNACE_SMELT_SECONDS);
    expect(manager.getState(POSITION).outputCount).toBe(1);
    expect(manager.getState(POSITION).burnSecondsRemaining).toBeCloseTo(8, 6);

    advance(manager, FURNACE_BURN_SECONDS_PER_COAL - FURNACE_SMELT_SECONDS);
    const completed = manager.getState(POSITION);
    expect(completed.inputCount).toBe(0);
    expect(completed.outputCount).toBe(3);
    expect(completed.fuelCount).toBe(0);
    expect(completed.burnSecondsRemaining).toBeCloseTo(0, 6);

    expect(manager.takeOutput(POSITION, inventory)).toBe(3);
    expect(inventory.countItem(ItemType.IronIngot)).toBe(3);
  });

  it('persists partial progress and resumes at the same coordinate', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.RawIron, 2);
    inventory.addItem(ItemType.Coal, 1);
    const first = new FurnaceManager('world-a', storage);
    first.insertInput(POSITION, inventory, 2);
    first.insertFuel(POSITION, inventory, 1);
    advance(first, 1.5);
    first.save();

    const restored = new FurnaceManager('world-a', storage);
    expect(restored.getState(POSITION).inputCount).toBe(2);
    expect(restored.getState(POSITION).smeltProgressSeconds).toBeCloseTo(1.5, 6);
    expect(restored.getState(POSITION).burnSecondsRemaining).toBeCloseTo(10.5, 6);
    advance(restored, 2.5);
    expect(restored.getState(POSITION).outputCount).toBe(1);
  });

  it('returns all internal stacks when a furnace block is broken', () => {
    const storage = new MemoryStorage();
    const inventory = new PlayerInventory();
    inventory.addItem(ItemType.RawIron, 4);
    inventory.addItem(ItemType.Coal, 2);
    const manager = new FurnaceManager('world-a', storage);
    manager.insertInput(POSITION, inventory, 4);
    manager.insertFuel(POSITION, inventory, 2);
    advance(manager, FURNACE_SMELT_SECONDS);

    expect(manager.drain(POSITION)).toEqual([
      { item: ItemType.RawIron, count: 3, durability: null },
      { item: ItemType.Coal, count: 1, durability: null },
      { item: ItemType.IronIngot, count: 1, durability: null },
    ]);
    expect(manager.furnaceCount).toBe(0);
  });
});
