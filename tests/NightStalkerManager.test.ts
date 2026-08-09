import { NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { rayEntityAabbDistance } from '../src/entities/ClassicEntityManager';
import { NightStalkerManager } from '../src/entities/NightStalkerManager';
import type { PlayerState } from '../src/game/session/GameSession';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { BlockType } from '../src/world/BlockType';
import type { VoxelWorldData } from '../src/world/VoxelWorldData';
import { createTestPlayerState } from './TestPlayerState';

function createPlayer(): PlayerState {
  return createTestPlayerState({
    position: { x: 0, y: 1.4, z: 0 },
    yaw: 0,
    pitch: 0,
    cameraMode: 'first-person',
  });
}

function createFlatWorld(): VoxelWorldData {
  return {
    persistenceId: 'entity-test-world',
    worldSeed: 'entity-test-seed',
    sampleStandingY: () => 1.4,
    isSolidAt: () => false,
    sampleBlock: () => BlockType.Air,
    setBlock: () => false,
  } as unknown as VoxelWorldData;
}

function advance(
  manager: NightStalkerManager,
  player: PlayerState,
  dayTime: number,
  seconds: number,
): void {
  const steps = Math.ceil(seconds / 0.1);
  for (let index = 0; index < steps; index += 1) {
    manager.update(
      player,
      dayTime,
      Math.min(0.1, Math.max(seconds - index * 0.1, 0.001)),
    );
  }
}

describe('NightStalkerManager stability facade', () => {
  const engines: NullEngine[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
  });

  function createManager(scene: Scene): NightStalkerManager {
    return new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });
  }

  it('spawns hostiles at night without the secondary creature visual runtime', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = createManager(scene);

    advance(manager, createPlayer(), 0.9, 1.4);

    expect(manager.hostileCount).toBeGreaterThan(0);
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-'))).toBe(true);
    expect(
      scene.transformNodes.some((node) => node.name.startsWith('upgraded-body-')),
    ).toBe(false);
    manager.dispose();
  });

  it('cycles cow pig and sheep independently', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = createManager(scene);

    advance(manager, createPlayer(), 0.5, 4.8);

    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-cow-'))).toBe(true);
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-pig-'))).toBe(true);
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-sheep-'))).toBe(true);
    manager.dispose();
  });

  it('uses full entity boxes for melee ray hits', () => {
    expect(
      rayEntityAabbDistance(
        { x: 0, y: 1.6, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -0.8, y: 0.5, z: 2 },
        { x: 0.8, y: 1.8, z: 3 },
        3.25,
      ),
    ).toBeCloseTo(2);
  });

  it('enforces repeated bow attack cooldown', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = createManager(scene);
    const player = createPlayer();

    expect(manager.shootArrow(player, ItemType.Bow)).toBe(true);
    expect(manager.shootArrow(player, ItemType.Bow)).toBe(false);
    advance(manager, player, 0.5, 0.55);
    expect(manager.shootArrow(player, ItemType.Bow)).toBe(true);
    manager.dispose();
  });

  it('blocks player occupancy inside a living creature body', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = createManager(scene);

    advance(manager, createPlayer(), 0.5, 1.6);
    const cowBody = scene.meshes.find((mesh) => mesh.name.startsWith('body-cow-'));
    const parent = cowBody?.parent;
    expect(parent).toBeInstanceOf(TransformNode);
    if (parent instanceof TransformNode) {
      const root = parent.getAbsolutePosition();
      expect(manager.canPlayerOccupy({ x: root.x, y: root.y, z: root.z })).toBe(false);
      expect(manager.canPlayerOccupy({ x: root.x + 4, y: root.y, z: root.z })).toBe(true);
    }
    manager.dispose();
  });

  it('keeps TNT and projectiles in the same registry', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = createManager(scene);
    const player = createPlayer();

    expect(manager.shootArrow(player, ItemType.Bow)).toBe(true);
    expect(manager.primeTnt(2, 1.4, 2)).toBe(true);
    expect(manager.activeCount).toBe(2);
    manager.dispose();
  });
});
