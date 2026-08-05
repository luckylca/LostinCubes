import { NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { NightStalkerManager } from '../src/entities/NightStalkerManager';
import type { PlayerState } from '../src/game/session/GameSession';
import { ItemType } from '../src/inventory/ItemDefinitions';
import type { VoxelWorldData } from '../src/world/VoxelWorldData';
import { createTestPlayerState } from './TestPlayerState';

function createPlayer(
  overrides: Parameters<typeof createTestPlayerState>[0] = {},
): PlayerState {
  return createTestPlayerState({
    position: { x: 0, y: 1.4, z: 0 },
    yaw: 0,
    pitch: 0,
    cameraMode: 'first-person',
    ...overrides,
  });
}

function createFlatWorld(): VoxelWorldData {
  return {
    sampleStandingY: () => 1.4,
  } as unknown as VoxelWorldData;
}

function advance(
  manager: NightStalkerManager,
  player: PlayerState,
  seconds: number,
): void {
  const steps = Math.ceil(seconds / 0.1);
  for (let index = 0; index < steps; index += 1) {
    manager.update(player, 0.9, Math.min(0.1, seconds - index * 0.1));
  }
}

describe('NightStalkerManager', () => {
  const engines: NullEngine[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
  });

  it('despawns the pooled night enemy when daylight returns', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });
    expect(manager.spawnAt(0, 1.4, 4)).toBe(true);
    expect(manager.activeCount).toBe(1);
    manager.update(createPlayer(), 0.5, 1 / 60);
    expect(manager.activeCount).toBe(0);
    manager.dispose();
  });

  it('selects the enemy in the view ray and applies tiered axe damage', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const drops: { item: string; count: number }[] = [];
    const hits: { damage: number; killed: boolean }[] = [];
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: (item, count) => drops.push({ item, count }),
      onEnemyHit: (damage, killed) => hits.push({ damage, killed }),
    });
    const player = createPlayer();
    manager.spawnAt(0, 1.4, 2);

    expect(manager.attack(player, ItemType.IronAxe)).toEqual({
      hit: true,
      killed: false,
      damage: 9,
    });
    advance(manager, player, 0.5);
    expect(manager.attack(player, ItemType.IronAxe)).toEqual({
      hit: true,
      killed: true,
      damage: 9,
    });
    expect(manager.activeCount).toBe(0);
    expect(hits).toEqual([
      { damage: 9, killed: false },
      { damage: 9, killed: true },
    ]);
    expect(drops).toContainEqual({ item: ItemType.Coal, count: 2 });
    manager.dispose();
  });

  it('damages a nearby player only after its attack cooldown expires', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    let damage = 0;
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: (amount) => {
        damage += amount;
      },
      onDrop: () => undefined,
    });
    manager.spawnAt(0, 1.4, 1);
    const player = createPlayer();
    advance(manager, player, 0.4);
    expect(damage).toBe(0);
    advance(manager, player, 0.1);
    expect(damage).toBe(3);
    advance(manager, player, 0.3);
    expect(damage).toBe(3);
    manager.dispose();
  });
});
