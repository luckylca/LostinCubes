import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import type { ItemType } from '../inventory/ItemDefinitions';
import { HeldItemModel } from './HeldItemModel';

type VectorTuple = readonly [number, number, number];

export interface PlayerActionPresentation {
  readonly breaking: boolean;
  readonly placing: boolean;
  readonly breakProgress: number;
  readonly heldItem: ItemType | null;
}

const IDLE_ACTION: PlayerActionPresentation = {
  breaking: false,
  placing: false,
  breakProgress: 0,
  heldItem: null,
};

function createMaterial(
  name: string,
  diffuse: Color3,
  scene: Scene,
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.ambientColor = diffuse.scale(0.42);
  material.emissiveColor = emissive;
  material.specularColor = Color3.Black();
  material.freeze();
  return material;
}

function createNode(
  name: string,
  parent: TransformNode | null,
  position: VectorTuple,
  scene: Scene,
): TransformNode {
  const node = new TransformNode(name, scene);
  node.position.set(...position);
  node.parent = parent;
  return node;
}

function createBox(
  name: string,
  parent: TransformNode,
  size: VectorTuple,
  position: VectorTuple,
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.position.set(...position);
  mesh.parent = parent;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderOutline = true;
  mesh.outlineColor = new Color3(0.028, 0.038, 0.034);
  mesh.outlineWidth = 0.014;
  return mesh;
}

function ease(current: number, target: number, frameSeconds: number): number {
  const blend = 1 - Math.exp(-14 * Math.min(frameSeconds, 0.1));
  return current + (target - current) * blend;
}

/**
 * Compact 1.8-block voxel character. The visible feet, head, and eyes are
 * aligned with the collision body instead of using the earlier oversized
 * prototype proportions.
 */
export class VoxelPlayerModel {
  readonly #root: TransformNode;
  readonly #bodyRoot: TransformNode;
  readonly #headRoot: TransformNode;
  readonly #leftArm: TransformNode;
  readonly #rightArm: TransformNode;
  readonly #leftLeg: TransformNode;
  readonly #rightLeg: TransformNode;
  readonly #heldItem: HeldItemModel;
  #animationPhase = 0;
  #actionPhase = 0;
  #currentBob = 0;

  public constructor(scene: Scene) {
    this.#root = createNode('player-model-root', null, [0, 0, 0], scene);
    this.#bodyRoot = createNode('player-body-root', this.#root, [0, 0, 0], scene);
    this.#headRoot = createNode('player-head-root', this.#root, [0, 0.48, 0], scene);
    this.#leftArm = createNode('player-left-arm-root', this.#root, [-0.4, 0.35, 0], scene);
    this.#rightArm = createNode('player-right-arm-root', this.#root, [0.4, 0.35, 0], scene);
    this.#leftLeg = createNode('player-left-leg-root', this.#root, [-0.16, -0.23, 0], scene);
    this.#rightLeg = createNode('player-right-leg-root', this.#root, [0.16, -0.23, 0], scene);

    const skin = createMaterial(
      'player-skin',
      new Color3(0.78, 0.58, 0.41),
      scene,
    );
    const skinLight = createMaterial(
      'player-skin-light',
      new Color3(0.9, 0.69, 0.5),
      scene,
    );
    const hair = createMaterial(
      'player-hair',
      new Color3(0.105, 0.07, 0.045),
      scene,
    );
    const coat = createMaterial(
      'player-coat',
      new Color3(0.12, 0.3, 0.24),
      scene,
    );
    const coatLight = createMaterial(
      'player-coat-light',
      new Color3(0.22, 0.46, 0.33),
      scene,
    );
    const trousers = createMaterial(
      'player-trousers',
      new Color3(0.15, 0.2, 0.18),
      scene,
    );
    const leather = createMaterial(
      'player-leather',
      new Color3(0.29, 0.17, 0.09),
      scene,
    );
    const boots = createMaterial(
      'player-boots',
      new Color3(0.07, 0.055, 0.045),
      scene,
    );
    const eyeWhite = createMaterial(
      'player-eye-white',
      new Color3(0.88, 0.91, 0.84),
      scene,
    );
    const pupils = createMaterial(
      'player-pupils',
      new Color3(0.025, 0.04, 0.035),
      scene,
    );
    const rune = createMaterial(
      'player-rune',
      new Color3(0.12, 0.67, 0.36),
      scene,
      new Color3(0.025, 0.19, 0.09),
    );

    createBox(
      'player-torso',
      this.#bodyRoot,
      [0.58, 0.65, 0.3],
      [0, 0.08, 0],
      coat,
      scene,
    );
    createBox(
      'player-shoulder-panel',
      this.#bodyRoot,
      [0.66, 0.14, 0.34],
      [0, 0.34, 0],
      coatLight,
      scene,
    );
    createBox(
      'player-belt',
      this.#bodyRoot,
      [0.61, 0.12, 0.34],
      [0, -0.22, 0],
      leather,
      scene,
    );
    createBox(
      'player-chest-rune-vertical',
      this.#bodyRoot,
      [0.08, 0.3, 0.032],
      [0, 0.1, 0.166],
      rune,
      scene,
    );
    createBox(
      'player-chest-rune-horizontal',
      this.#bodyRoot,
      [0.25, 0.08, 0.034],
      [0, 0.1, 0.168],
      rune,
      scene,
    );
    createBox(
      'player-back-panel',
      this.#bodyRoot,
      [0.5, 0.52, 0.055],
      [0, 0.05, -0.18],
      coatLight,
      scene,
    );

    createBox(
      'player-head',
      this.#headRoot,
      [0.5, 0.5, 0.5],
      [0, 0.17, 0],
      skin,
      scene,
    );
    createBox(
      'player-hair-top',
      this.#headRoot,
      [0.53, 0.13, 0.53],
      [0, 0.445, 0],
      hair,
      scene,
    );
    createBox(
      'player-hair-back',
      this.#headRoot,
      [0.53, 0.39, 0.09],
      [0, 0.2, -0.29],
      hair,
      scene,
    );
    createBox(
      'player-hair-fringe-left',
      this.#headRoot,
      [0.18, 0.16, 0.045],
      [-0.14, 0.36, 0.27],
      hair,
      scene,
    );
    createBox(
      'player-hair-fringe-right',
      this.#headRoot,
      [0.12, 0.11, 0.045],
      [0.16, 0.385, 0.27],
      hair,
      scene,
    );
    createBox(
      'player-left-eye-white',
      this.#headRoot,
      [0.12, 0.075, 0.025],
      [-0.13, 0.24, 0.263],
      eyeWhite,
      scene,
    );
    createBox(
      'player-right-eye-white',
      this.#headRoot,
      [0.12, 0.075, 0.025],
      [0.13, 0.24, 0.263],
      eyeWhite,
      scene,
    );
    createBox(
      'player-left-pupil',
      this.#headRoot,
      [0.055, 0.07, 0.018],
      [-0.12, 0.235, 0.279],
      pupils,
      scene,
    );
    createBox(
      'player-right-pupil',
      this.#headRoot,
      [0.055, 0.07, 0.018],
      [0.12, 0.235, 0.279],
      pupils,
      scene,
    );
    createBox(
      'player-nose',
      this.#headRoot,
      [0.07, 0.08, 0.045],
      [0, 0.135, 0.277],
      skinLight,
      scene,
    );

    this.#createArm('left', this.#leftArm, skin, coatLight, leather, scene);
    this.#createArm('right', this.#rightArm, skin, coatLight, leather, scene);
    this.#createLeg('left', this.#leftLeg, trousers, boots, scene);
    this.#createLeg('right', this.#rightLeg, trousers, boots, scene);

    this.#heldItem = new HeldItemModel(scene, this.#rightArm);
  }

  public update(
    player: PlayerState,
    frameSeconds: number,
    action: PlayerActionPresentation = IDLE_ACTION,
  ): void {
    this.#root.setEnabled(player.cameraMode !== 'first-person');
    this.#heldItem.update(player, frameSeconds, action.heldItem, action);

    const speedFactor = Math.min(player.horizontalSpeed / 6.2, 1);
    const moving = speedFactor > 0.02 && player.grounded && !player.paused;
    if (moving) {
      const gaitRate = player.sprinting ? 12 : 8;
      this.#animationPhase += frameSeconds * gaitRate * Math.max(0.4, speedFactor);
    }
    if (action.breaking || action.placing) {
      this.#actionPhase += frameSeconds * (action.breaking ? 16 : 10);
    } else {
      this.#actionPhase = 0;
    }

    let leftLeg = 0;
    let rightLeg = 0;
    let leftArm = 0;
    let rightArm = 0;
    let rightArmRoll = 0;
    let bodyTilt = 0;
    let bob = 0;

    if (!player.grounded) {
      const rising = player.verticalVelocity > 0;
      leftLeg = rising ? -0.4 : 0.18;
      rightLeg = rising ? 0.26 : -0.26;
      leftArm = rising ? -0.5 : -0.22;
      rightArm = rising ? -0.32 : -0.12;
      bodyTilt = 0.07;
    } else if (moving) {
      const amplitude = player.sprinting ? 0.78 : 0.52;
      const swing = Math.sin(this.#animationPhase) * amplitude * speedFactor;
      leftLeg = swing;
      rightLeg = -swing;
      leftArm = -swing * 0.76;
      rightArm = swing * 0.76;
      bodyTilt = player.sprinting ? 0.12 : 0.04;
      bob = Math.abs(Math.sin(this.#animationPhase * 2)) * 0.035 * speedFactor;
    }

    if (action.breaking) {
      const strike = Math.abs(Math.sin(this.#actionPhase));
      rightArm = -0.78 - strike * (0.68 + action.breakProgress * 0.15);
      rightArmRoll = -0.16;
    } else if (action.placing) {
      rightArm = -1.02 - Math.abs(Math.sin(this.#actionPhase)) * 0.2;
      rightArmRoll = -0.1;
    }

    this.#leftLeg.rotation.x = ease(this.#leftLeg.rotation.x, leftLeg, frameSeconds);
    this.#rightLeg.rotation.x = ease(this.#rightLeg.rotation.x, rightLeg, frameSeconds);
    this.#leftArm.rotation.x = ease(this.#leftArm.rotation.x, leftArm, frameSeconds);
    this.#rightArm.rotation.x = ease(this.#rightArm.rotation.x, rightArm, frameSeconds);
    this.#rightArm.rotation.z = ease(
      this.#rightArm.rotation.z,
      rightArmRoll,
      frameSeconds,
    );
    this.#bodyRoot.rotation.x = ease(this.#bodyRoot.rotation.x, bodyTilt, frameSeconds);
    this.#headRoot.rotation.x = ease(
      this.#headRoot.rotation.x,
      -player.pitch * 0.7,
      frameSeconds,
    );
    this.#currentBob = ease(this.#currentBob, bob, frameSeconds);

    this.#root.position.set(
      player.position.x,
      player.position.y + this.#currentBob,
      player.position.z,
    );
    this.#root.rotation.y = player.yaw;
  }

  public dispose(): void {
    this.#heldItem.dispose();
    this.#root.dispose(false, true);
  }

  #createArm(
    side: 'left' | 'right',
    root: TransformNode,
    skin: StandardMaterial,
    cloth: StandardMaterial,
    leather: StandardMaterial,
    scene: Scene,
  ): void {
    createBox(
      `player-${side}-sleeve`,
      root,
      [0.22, 0.38, 0.24],
      [0, -0.16, 0],
      cloth,
      scene,
    );
    createBox(
      `player-${side}-forearm`,
      root,
      [0.19, 0.3, 0.2],
      [0, -0.49, 0],
      skin,
      scene,
    );
    createBox(
      `player-${side}-wrist-wrap`,
      root,
      [0.215, 0.1, 0.22],
      [0, -0.39, 0],
      leather,
      scene,
    );
    createBox(
      `player-${side}-hand`,
      root,
      [0.2, 0.16, 0.21],
      [0, -0.69, 0.015],
      skin,
      scene,
    );
  }

  #createLeg(
    side: 'left' | 'right',
    root: TransformNode,
    cloth: StandardMaterial,
    boots: StandardMaterial,
    scene: Scene,
  ): void {
    createBox(
      `player-${side}-leg`,
      root,
      [0.25, 0.52, 0.27],
      [0, -0.25, 0],
      cloth,
      scene,
    );
    createBox(
      `player-${side}-boot`,
      root,
      [0.27, 0.3, 0.36],
      [0, -0.52, 0.045],
      boots,
      scene,
    );
  }
}
