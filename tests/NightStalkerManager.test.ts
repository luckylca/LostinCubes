import {
  NullEngine,
  Scene,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { rayEntityAabbDistance } from '../src/entities/ClassicEntityManager';
import { NightStalkerManager } from '../src/entities/NightStalkerManager';
import type { PlayerState } from '../src/game/session/GameSession';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { BlockType } from '../src/world/BlockType';
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

describe('NightStalkerManager unified facade', () => {
  const engines: NullEngine[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
  });

  it('spawns classic hostile entities through the unified registry at night', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    advance(manager, createPlayer(), 0.9, 1.4);

    expect(manager.hostileCount).toBeGreaterThan(0);
    expect(manager.hostileCount).toBeLessThanOrEqual(28);
    expect(manager.activeCount).toBeGreaterThanOrEqual(manager.hostileCount);
    manager.dispose();
  });

  it('cycles cow pig and sheep independently from hostile spawn cadence', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    advance(manager, createPlayer(), 0.5, 4.8);

    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-cow-'))).toBe(true);
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-pig-'))).toBe(true);
    expect(scene.meshes.some((mesh) => mesh.name.startsWith('body-sheep-'))).toBe(true);
    manager.dispose();
  });

  it('replaces the legacy collider with a compact lit batched body', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    advance(manager, createPlayer(), 0.9, 0.9);

    const sourceBody = scene.meshes.find((mesh) => mesh.name.startsWith('body-'));
    expect(sourceBody).toBeDefined();
    expect(sourceBody?.isVisible).toBe(true);

    scene.onBeforeRenderObservable.notifyObservers(scene);

    expect(
      scene.transformNodes.some((node) => node.name.startsWith('upgraded-body-')),
    ).toBe(true);
    expect(sourceBody?.isVisible).toBe(false);

    const batchedMeshes = scene.meshes.filter(
      (mesh) => sourceBody !== undefined && mesh.name.startsWith(`${sourceBody.name}-`),
    );
    expect(batchedMeshes.length).toBeGreaterThanOrEqual(2);
    expect(batchedMeshes.length).toBeLessThanOrEqual(4);
    const material = batchedMeshes[0]?.material;
    expect(material).toBeInstanceOf(StandardMaterial);
    if (material instanceof StandardMaterial) {
      expect(
        material.diffuseColor.r +
          material.diffuseColor.g +
          material.diffuseColor.b,
      ).toBeGreaterThan(0.2);
      expect(
        material.emissiveColor.r +
          material.emissiveColor.g +
          material.emissiveColor.b,
      ).toBeGreaterThan(0);
    }
    manager.dispose();
  });

  it('batches skeleton bow, arrow and face detail into a few visible material groups', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    advance(manager, createPlayer(), 0.9, 1.7);
    scene.onBeforeRenderObservable.notifyObservers(scene);

    const skeletonBody = scene.meshes.find((mesh) =>
      mesh.name.startsWith('body-skeleton-'),
    );
    expect(skeletonBody).toBeDefined();
    expect(skeletonBody?.isVisible).toBe(false);
    if (skeletonBody !== undefined) {
      const prefix = `${skeletonBody.name}-`;
      expect(scene.meshes.some((mesh) => mesh.name === `${prefix}primary`)).toBe(true);
      expect(scene.meshes.some((mesh) => mesh.name === `${prefix}secondary`)).toBe(true);
      expect(scene.meshes.some((mesh) => mesh.name === `${prefix}detail`)).toBe(true);
      expect(scene.meshes.some((mesh) => mesh.name === `${prefix}dark`)).toBe(true);
      expect(
        scene.meshes.filter((mesh) => mesh.name.startsWith(prefix)).length,
      ).toBeLessThanOrEqual(4);
    }
    manager.dispose();
  });

  it('places the low spider root near the ground instead of player foot height', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    advance(manager, createPlayer(), 0.9, 2.5);
    const spiderRoot = scene.transformNodes.find((node) =>
      node.name.startsWith('entity-spider-'),
    );
    expect(spiderRoot).toBeDefined();
    expect(spiderRoot?.position.y).toBeLessThan(0.9);
    expect(spiderRoot?.position.y).toBeGreaterThan(0.55);
    manager.dispose();
  });

  it('uses full entity boxes for melee ray hits instead of one center point', () => {
    const distance = rayEntityAabbDistance(
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: -0.8, y: 0.5, z: 2 },
      { x: 0.8, y: 1.8, z: 3 },
      3.25,
    );
    expect(distance).toBeCloseTo(2);

    expect(
      rayEntityAabbDistance(
        { x: 0, y: 1.6, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -0.8, y: 0.5, z: 4 },
        { x: 0.8, y: 1.8, z: 5 },
        3.25,
      ),
    ).toBeNull();
  });

  it('enforces a real combat cooldown for repeated bow attacks', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });
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
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

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

  it('uses the same registry for arrows and primed TNT', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });
    const player = createPlayer();

    expect(manager.shootArrow(player, ItemType.Bow)).toBe(true);
    expect(manager.primeTnt(2, 1.4, 2)).toBe(true);
    expect(manager.activeCount).toBe(2);
    manager.dispose();
  });

  it('creates a visible shockwave and debris when TNT detonates', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });
    expect(manager.primeTnt(2, 1.4, 2)).toBe(true);

    advance(manager, createPlayer(), 0.5, 4.1);

    expect(scene.meshes.some((mesh) => mesh.name.startsWith('explosion-wave-'))).toBe(true);
    expect(
      scene.meshes.filter((mesh) => mesh.name.startsWith('explosion-particle-')).length,
    ).toBeGreaterThanOrEqual(18);
    manager.dispose();
  });

  it('keeps legacy melee calls safe when no entity intersects the view ray', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const manager = new NightStalkerManager(scene, createFlatWorld(), {
      onPlayerDamage: () => undefined,
      onDrop: () => undefined,
    });

    expect(manager.attack(createPlayer(), ItemType.IronAxe)).toEqual({
      hit: false,
      killed: false,
      damage: 0,
    });
    manager.dispose();
  });
});
