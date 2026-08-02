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

function createPlayer(cameraMode: PlayerState['cameraMode']): PlayerState {
  return {
    position: { x: 0, y: 1.4, z: 0 },
    verticalVelocity: 0,
    horizontalSpeed: 0,
    sprinting: false,
    grounded: true,
    yaw: 0,
    pitch: 0,
    cameraMode,
    paused: false,
  };
}

const IDLE_ACTION = {
  breaking: false,
  placing: false,
  breakProgress: 0,
} as const;

describe('HeldItemModel', () => {
  it('builds a visible held tool for both camera modes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new FreeCamera(
      'test-camera',
      Vector3.Zero(),
      scene,
    );
    const hand = new TransformNode('test-hand', scene);
    const model = new HeldItemModel(scene, hand);

    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.WoodenPickaxe,
      IDLE_ACTION,
    );

    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-pickaxe-handle'),
    ).toHaveLength(2);
    expect(
      scene.transformNodes.find(
        (node) => node.name === 'third-person-held-item',
      )?.isEnabled(),
    ).toBe(true);
    expect(
      scene.transformNodes.find(
        (node) => node.name === 'first-person-held-item',
      )?.isEnabled(),
    ).toBe(false);

    model.update(
      createPlayer('first-person'),
      1 / 60,
      ItemType.WoodenPickaxe,
      IDLE_ACTION,
    );

    expect(
      scene.transformNodes.find(
        (node) => node.name === 'third-person-held-item',
      )?.isEnabled(),
    ).toBe(false);
    expect(
      scene.transformNodes.find(
        (node) => node.name === 'first-person-held-item',
      )?.isEnabled(),
    ).toBe(true);

    model.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('replaces tool geometry when the selected slot changes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new FreeCamera(
      'test-camera',
      Vector3.Zero(),
      scene,
    );
    const model = new HeldItemModel(
      scene,
      new TransformNode('test-hand', scene),
    );

    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.WoodenPickaxe,
      IDLE_ACTION,
    );
    model.update(
      createPlayer('third-person'),
      1 / 60,
      ItemType.WoodenShovel,
      IDLE_ACTION,
    );

    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-pickaxe-handle'),
    ).toHaveLength(0);
    expect(
      scene.meshes.filter((mesh) => mesh.name === 'held-shovel-handle'),
    ).toHaveLength(2);

    model.dispose();
    scene.dispose();
    engine.dispose();
  });
});
