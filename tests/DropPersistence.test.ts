import { describe, expect, it } from 'vitest';
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
  it('round-trips valid wood and stone drops by world seed', () => {
    const storage = new MemoryStorage();
    const snapshots = [
      {
        block: BlockType.OakLog,
        count: 5,
        x: 3.25,
        y: 7.14,
        z: -2.5,
        grounded: true,
      },
      {
        block: BlockType.Stone,
        count: 2,
        x: -4,
        y: 5,
        z: 9,
        grounded: false,
      },
    ] as const;

    saveDroppedItems('world-a', snapshots, storage);
    expect(loadDroppedItems('world-a', storage)).toEqual(snapshots);
    expect(loadDroppedItems('world-b', storage)).toEqual([]);
  });

  it('filters malformed snapshots and clamps stack sizes', () => {
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
        { block: 999, count: 2, x: 1, y: 2, z: 3 },
        { block: BlockType.Dirt, count: -1, x: 1, y: 2, z: 3 },
        { block: BlockType.Stone, count: 1, x: 'bad', y: 2, z: 3 },
      ]),
    );

    expect(loadDroppedItems('world-a', storage)).toEqual([
      {
        block: BlockType.OakPlanks,
        count: 64,
        x: 1,
        y: 2,
        z: 3,
        grounded: true,
      },
    ]);
  });

  it('falls back to an empty list for corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('lost-in-cubes:drops:world-a', '{broken');

    expect(loadDroppedItems('world-a', storage)).toEqual([]);
  });
});
