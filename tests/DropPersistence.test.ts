import { describe, expect, it } from 'vitest';
import { ItemType } from '../src/inventory/ItemDefinitions';
import {
  loadDroppedItems,
  saveDroppedItems,
} from '../src/world/DropPersistence';
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

describe('ground drop persistence', () => {
  it('round-trips block, material, and damaged tool drops by world seed', () => {
    const storage = new MemoryStorage();
    const snapshots = [
      {
        item: ItemType.OakLogBlock,
        count: 5,
        durability: null,
        x: 3.25,
        y: 7.14,
        z: -2.5,
        grounded: true,
      },
      {
        item: ItemType.RawIron,
        count: 2,
        durability: null,
        x: -4,
        y: 5,
        z: 9,
        grounded: false,
      },
      {
        item: ItemType.IronPickaxe,
        count: 1,
        durability: 91,
        x: 2,
        y: 4,
        z: 7,
        grounded: true,
      },
    ] as const;
    saveDroppedItems('world-a', snapshots, storage);
    expect(loadDroppedItems('world-a', storage)).toEqual(snapshots);
    expect(loadDroppedItems('world-b', storage)).toEqual([]);
  });

  it('migrates legacy drops and filters malformed snapshots', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'lost-in-cubes:drops:world-a',
      JSON.stringify([
        {
          block: BlockType.OakPlanks,
          count: 999,
          x: 1,
          y: 2,
          z: 3,
          grounded: true,
        },
        {
          item: ItemType.Coal,
          count: 3,
          x: 4,
          y: 5,
          z: 6,
          grounded: false,
        },
        {
          item: ItemType.StoneAxe,
          count: 1,
          x: 7,
          y: 8,
          z: 9,
          grounded: false,
        },
        { item: 'bad', count: 2, x: 1, y: 2, z: 3 },
        { block: 999, count: 2, x: 1, y: 2, z: 3 },
        { item: ItemType.DirtBlock, count: -1, x: 1, y: 2, z: 3 },
      ]),
    );
    expect(loadDroppedItems('world-a', storage)).toEqual([
      {
        item: ItemType.OakPlanksBlock,
        count: 64,
        durability: null,
        x: 1,
        y: 2,
        z: 3,
        grounded: true,
      },
      {
        item: ItemType.Coal,
        count: 3,
        durability: null,
        x: 4,
        y: 5,
        z: 6,
        grounded: false,
      },
      {
        item: ItemType.StoneAxe,
        count: 1,
        durability: 131,
        x: 7,
        y: 8,
        z: 9,
        grounded: false,
      },
    ]);
  });

  it('clamps invalid durability and falls back for corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'lost-in-cubes:drops:world-a',
      JSON.stringify([
        {
          item: ItemType.WoodenPickaxe,
          count: 1,
          durability: 999,
          x: 1,
          y: 2,
          z: 3,
        },
      ]),
    );
    expect(loadDroppedItems('world-a', storage)[0]?.durability).toBe(59);
    storage.setItem('lost-in-cubes:drops:world-a', '{broken');
    expect(loadDroppedItems('world-a', storage)).toEqual([]);
  });
});
