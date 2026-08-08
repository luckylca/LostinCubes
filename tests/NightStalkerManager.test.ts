import { NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
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
      Math.min(0.1, seconds - index * 0.1),
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

  it('replaces the legacy collider with a complete lit multipart body', () => {
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

    const torso = scene.meshes.find((mesh) => mesh.name.endsWith('-torso'));
    expect(torso).toBeDefined();
    const torsoMaterial = torso?.material;
    expect(torsoMaterial).toBeInstanceOf(StandardMaterial);
    if (torsoMaterial instanceof StandardMaterial) {
      expect(
        torsoMaterial.diffuseColor.r +
          torsoMaterial.diffuseColor.g +
          torsoMaterial.diffuseColor.b,
      ).toBeGreaterThan(0.2);
      expect(
        torsoMaterial.emissiveColor.r +
          torsoMaterial.emissiveColor.g +
          torsoMaterial.emissiveColor.b,
      ).toBeGreaterThan(0);
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
