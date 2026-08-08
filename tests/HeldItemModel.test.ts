import {
  FreeCamera,
  NullEngine,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { HeldItemModel } from '../src/player/HeldItemModel';
import { createTestPlayerState } from './TestPlayerState';

function createPlayer(cameraMode: PlayerState['cameraMode']): PlayerState {
  return createTestPlayerState({
    position: { x: 0, y: 1.4, z: 0 },
    yaw: 0,
    pitch: 0,
    cameraMode,
  });
}

const IDLE_ACTION = {
  breaking: false,
  placing: false,
  breakProgress: 0,
} as const;

function createModel(): {
  engine: NullEngine;
  scene: Scene;
  model: HeldItemModel;
} {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new FreeCamera('test-camera', Vector3.Zero(), scene);
  const model = new HeldItemModel(
    scene,
    new TransformNode('test-hand', scene),
  );
  return { engine, scene, model };
}

describe('HeldItemModel', () => {
  it('builds a visible held tool for both camera modes', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.StonePickaxe,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-pickaxe-handle'),
    ).toHaveLength(2);
    expect(
      scene.transformNodes
        .find((node) => node.name === 'third-person-held-item')
        ?.isEnabled(),
    ).toBe(true);
    expect(
      scene.transformNodes
        .find((node) => node.name === 'first-person-held-item')
        ?.isEnabled(),
    ).toBe(false);
    model.update(
      createPlayer('first-person'),
      1 / 60,
      ItemType.StonePickaxe,
      IDLE_ACTION,
    );
    expect(
      scene.transformNodes
        .find((node) => node.name === 'third-person-held-item')
        ?.isEnabled(),
    ).toBe(false);
    expect(
      scene.transformNodes
        .find((node) => node.name === 'first-person-held-item')
        ?.isEnabled(),
    ).toBe(true);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('replaces tool geometry and renders iron tool heads', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.WoodenPickaxe,
      IDLE_ACTION,
    );
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.IronAxe,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-pickaxe-handle'),
    ).toHaveLength(0);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-axe-handle'),
    ).toHaveLength(2);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-axe-edge'),
    ).toHaveLength(2);
    expect(
      scene.materials.some(
        (material) => material.name === 'held-tool-iron-head',
      ),
    ).toBe(true);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('renders sticks and iron ingots as held materials', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.Stick,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-stick'),
    ).toHaveLength(2);
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.IronIngot,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-iron-ingot'),
    ).toHaveLength(2);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('renders apple bodies and stems as held food', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('first-person'),
      1 / 60,
      ItemType.Apple,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-apple'),
    ).toHaveLength(2);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-apple-stem'),
    ).toHaveLength(2);
    expect(
      scene.transformNodes
        .find((node) => node.name === 'first-person-held-item')
        ?.isEnabled(),
    ).toBe(true);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('renders bow and arrow as separate recognizable held items', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('first-person'),
      1 / 60,
      ItemType.Bow,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-bow-grip'),
    ).toHaveLength(2);
    expect(
      scene.meshes.filter((mesh) => mesh.name.startsWith('held-bow-string-')),
    ).toHaveLength(4);

    model.update(
      createPlayer('first-person'),
      1 / 60,
      ItemType.Arrow,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-bow-grip'),
    ).toHaveLength(0);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-arrow-shaft'),
    ).toHaveLength(2);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-arrow-tip'),
    ).toHaveLength(2);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('renders armor instead of silently dropping weapon-adjacent item kinds', () => {
    const { engine, scene, model } = createModel();
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.IronChestplate,
      IDLE_ACTION,
    );
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-iron-chestplate-body'),
    ).toHaveLength(2);
    model.dispose();
    scene.dispose();
    engine.dispose();
  });
});
