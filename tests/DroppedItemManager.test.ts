import { NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import { ItemType } from '../src/inventory/ItemDefinitions';
import type { InventorySlotSnapshot } from '../src/inventory/PlayerInventory';
import { DroppedItemManager } from '../src/world/DroppedItemManager';
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
    health: 20,
    maximumHealth: 20,
    damageTaken: 0,
    deathCount: 0,
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
    for (const engine of engines.splice(0)) engine.dispose();
  });

  it('merges nearby same-item drops up to the stack limit', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (stack) => stack,
    });
    expect(manager.spawn(ItemType.Coal, 0, 2, 0, 40)).toBe(0);
    expect(manager.spawn(ItemType.Coal, 0.2, 2, 0.1, 30)).toBe(0);
    expect(manager.activeCount).toBe(2);
    expect(
      manager.snapshots.map((drop) => drop.count).sort((a, b) => a - b),
    ).toEqual([6, 64]);
    expect(manager.snapshots.every((drop) => drop.item === ItemType.Coal)).toBe(
      true,
    );
    expect(manager.snapshots.every((drop) => drop.durability === null)).toBe(
      true,
    );
    manager.dispose();
  });

  it('falls onto solid voxels and collects material drops after the delay', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    let collected = 0;
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (stack) => {
        collected += stack.count;
        return null;
      },
    });
    manager.spawn(ItemType.RawIron, 0, 2.5, 0, 1);
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
      onPickup: (stack) => stack,
    });
    manager.spawn(ItemType.GrassBlock, 0, 1, 0, 3);
    const player = createPlayer(0, 1.4, 0);
    for (let index = 0; index < 60; index += 1) {
      manager.update(player, 1 / 60);
    }
    expect(manager.activeCount).toBe(1);
    expect(manager.snapshots[0]?.count).toBe(3);
    manager.dispose();
  });

  it('preserves damaged tool durability and does not merge different tools', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const pickedUp: InventorySlotSnapshot[] = [];
    const manager = new DroppedItemManager(scene, createFloorWorld(), {
      onPickup: (stack) => {
        pickedUp.push(stack);
        return null;
      },
    });

    manager.spawn(ItemType.IronAxe, 0, 1, 0, 1, 73);
    manager.spawn(ItemType.IronAxe, 0.1, 1, 0.1, 1, 180);
    expect(manager.activeCount).toBe(2);
    expect(
      manager.snapshots.map((drop) => drop.durability).sort((a, b) =>
        (a ?? 0) - (b ?? 0),
      ),
    ).toEqual([73, 180]);

    const player = createPlayer(0, 1.4, 0);
    for (let index = 0; index < 60 && pickedUp.length === 0; index += 1) {
      manager.update(player, 1 / 60);
    }
    expect(pickedUp[0]?.item).toBe(ItemType.IronAxe);
    expect([73, 180]).toContain(pickedUp[0]?.durability);
    manager.dispose();
  });
});
