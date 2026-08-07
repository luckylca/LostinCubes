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
  it('round-trips v2 player position, survival stats, and view state by world id', () => {
    const storage = new MemoryStorage();
    saveSurvivalSnapshot(
      'world-a',
      {
        version: 2,
        health: 13,
        dayTime: 0.82,
        deathCount: 4,
        position: { x: 8, y: 12, z: -3 },
        yaw: 1.2,
        pitch: -0.3,
        hunger: 15,
        armorPoints: 8,
      },
      storage,
    );
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toEqual({
      version: 2,
      health: 13,
      dayTime: 0.82,
      deathCount: 4,
      position: { x: 8, y: 12, z: -3 },
      yaw: 1.2,
      pitch: -0.3,
      hunger: 15,
      armorPoints: 8,
    });
    expect(loadSurvivalSnapshot('world-b', storage, 20)).toBeNull();
  });

  it('migrates legacy survival records with safe v2 defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'lost-in-cubes:survival:world-a',
      JSON.stringify({ health: 17, dayTime: 0.45, deathCount: 2 }),
    );

    expect(loadSurvivalSnapshot('world-a', storage, 20)).toEqual({
      version: 2,
      health: 17,
      dayTime: 0.45,
      deathCount: 2,
      position: null,
      yaw: Math.PI,
      pitch: -0.12,
      hunger: 20,
      armorPoints: 0,
    });
  });

  it('clamps valid numeric values and rejects malformed records', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'lost-in-cubes:survival:world-a',
      JSON.stringify({ health: 999, dayTime: -0.25, deathCount: -4 }),
    );
    expect(loadSurvivalSnapshot('world-a', storage, 20)).toMatchObject({
      version: 2,
      health: 20,
      dayTime: 0.75,
      deathCount: 0,
      hunger: 20,
      armorPoints: 0,
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
