import { NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import { DroppedItemManager } from '../src/world/DroppedItemManager';
import { BlockType } from '../src/world/BlockType';
import type { VoxelWorldData } from '../src/world/VoxelWorldData';

function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    position: { x, y, z },
    verticalVelocity: 0,
    horizontalSpeed: 0,
    sprinting: false,
    grounded: true,
    yaw: 0,
    pitch: 0,
    cameraMode: 'third-person',
    paused: false,
  };
}

function createFloorWorld(): VoxelWorldData {
  return {
    isSolidAt: (_x: number, y: number) => y === 0,
  } as unknown as VoxelWorldData;
}

describe('DroppedItemManager', () => {
  const engines: NullEngine[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) {
      engine.dispose();
    }
  });

  it('merges nearby same-block drops up to the stack limit', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (_block, count) => count,
    });

    expect(manager.spawn(BlockType.Dirt, 0, 2, 0, 40)).toBe(0);
    expect(manager.spawn(BlockType.Dirt, 0.2, 2, 0.1, 30)).toBe(0);

    expect(manager.activeCount).toBe(2);
    expect(manager.snapshots.map((drop) => drop.count).sort((a, b) => a - b)).toEqual([
      6,
      64,
    ]);
    manager.dispose();
  });

  it('falls onto solid voxels and is collected after the pickup delay', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    let collected = 0;
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (_block, count) => {
        collected += count;
        return 0;
      },
    });
    manager.spawn(BlockType.Stone, 0, 2.5, 0, 1);

    const farPlayer = createPlayer(20, 1.4, 20);
    for (let index = 0; index < 180; index += 1) {
      manager.update(farPlayer, 1 / 60);
    }
    expect(manager.snapshots[0]?.grounded).toBe(true);

    const nearPlayer = createPlayer(0, 1.4, 0);
    for (let index = 0; index < 60; index += 1) {
      manager.update(nearPlayer, 1 / 60);
    }
    expect(collected).toBe(1);
    expect(manager.activeCount).toBe(0);
    manager.dispose();
  });

  it('keeps inventory overflow in the world', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (_block, count) => count,
    });
    manager.spawn(BlockType.Grass, 0, 1, 0, 3);

    const player = createPlayer(0, 1.4, 0);
    for (let index = 0; index < 60; index += 1) {
      manager.update(player, 1 / 60);
    }

    expect(manager.activeCount).toBe(1);
    expect(manager.snapshots[0]?.count).toBe(3);
    manager.dispose();
  });
});
