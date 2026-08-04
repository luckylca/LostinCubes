import { describe, expect, it } from 'vitest';
import {
  loadSurvivalSnapshot,
  saveSurvivalSnapshot,
} from '../src/game/session/SurvivalPersistence';

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

describe('survival persistence', () => {
  it('round-trips health, day time, and death count by world seed', () => {
    const storage = new MemoryStorage();
    saveSurvivalSnapshot(
      'world-a',
      { version: 1, health: 13, dayTime: 0.82, deathCount: 4 },
      storage,
    );
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toEqual({
      version: 1,
      health: 13,
      dayTime: 0.82,
      deathCount: 4,
    });
    expect(loadSurvivalSnapshot('world-b', storage, 20)).toBeNull();
  });

  it('clamps valid numeric values and rejects malformed records', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'lost-in-cubes:survival:world-a',
      JSON.stringify({ health: 999, dayTime: -0.25, deathCount: -4 }),
    );
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toEqual({
      version: 1,
      health: 20,
      dayTime: 0.75,
      deathCount: 0,
    });

    storage.setItem(
      'lost-in-cubes:survival:world-a',
      JSON.stringify({ health: 'bad', dayTime: 0.5, deathCount: 0 }),
    );
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('lost-in-cubes:survival:world-a', '{broken');
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toBeNull();
  });
});
