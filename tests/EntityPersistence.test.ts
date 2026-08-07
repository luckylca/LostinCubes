import { describe, expect, it } from 'vitest';
import {
  loadEntitySnapshots,
  saveEntitySnapshots,
} from '../src/entities/EntityPersistence';
import type { EntitySnapshot } from '../src/entities/EntityRegistry';

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  public get length(): number {
    return this.#values.size;
  }

  public clear(): void {
    this.#values.clear();
  }

  public getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.#values.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

function cow(id: string, x: number): EntitySnapshot {
  return {
    id,
    kind: 'cow',
    position: { x, y: 4, z: 2 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 10,
    maximumHealth: 10,
    collisionRadius: 0.5,
    persistent: true,
    ageSeconds: 3,
    ownerId: null,
    state: { variant: 'brown' },
  };
}

describe('entity persistence', () => {
  it('keeps persistent entities isolated by world id', () => {
    const storage = new MemoryStorage();
    saveEntitySnapshots('world-a', [cow('cow-a', 1)], storage);
    saveEntitySnapshots('world-b', [cow('cow-b', 9)], storage);

    expect(loadEntitySnapshots('world-a', storage).map((entity) => entity.id)).toEqual([
      'cow-a',
    ]);
    expect(loadEntitySnapshots('world-b', storage).map((entity) => entity.id)).toEqual([
      'cow-b',
    ]);
  });

  it('does not persist transient projectiles', () => {
    const storage = new MemoryStorage();
    const arrow: EntitySnapshot = {
      id: 'arrow-1',
      kind: 'arrow',
      position: { x: 0, y: 4, z: 0 },
      velocity: { x: 2, y: 0, z: 0 },
      health: 1,
      maximumHealth: 1,
      collisionRadius: 0.16,
      persistent: false,
      ageSeconds: 0.5,
      ownerId: 'player',
      state: { damage: 6 },
    };

    saveEntitySnapshots('world-a', [arrow], storage);
    expect(loadEntitySnapshots('world-a', storage)).toEqual([]);
  });
});
