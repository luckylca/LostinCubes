import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';

type VectorTuple = readonly [number, number, number];

function createMaterial(
  name: string,
  diffuse: Color3,
  scene: Scene,
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.specularColor = Color3.Black();
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
  return mesh;
}

function ease(current: number, target: number, frameSeconds: number): number {
  const blend = 1 - Math.exp(-14 * Math.min(frameSeconds, 0.1));
  return current + (target - current) * blend;
}

export class VoxelPlayerModel {
  readonly #root: TransformNode;
  readonly #bodyRoot: TransformNode;
  readonly #headRoot: TransformNode;
  readonly #leftArm: TransformNode;
  readonly #rightArm: TransformNode;
  readonly #leftLeg: TransformNode;
  readonly #rightLeg: TransformNode;
  #animationPhase = 0;
  #currentBob = 0;

  public constructor(scene: Scene) {
    this.#root = createNode('player-model-root', null, [0, 0, 0], scene);
    this.#bodyRoot = createNode('player-body-root', this.#root, [0, 0, 0], scene);
    this.#headRoot = createNode('player-head-root', this.#root, [0, 0.78, 0], scene);
    this.#leftArm = createNode('player-left-arm-root', this.#root, [-0.48, 0.53, 0], scene);
    this.#rightArm = createNode('player-right-arm-root', this.#root, [0.48, 0.53, 0], scene);
    this.#leftLeg = createNode('player-left-leg-root', this.#root, [-0.2, -0.18, 0], scene);
    this.#rightLeg = createNode('player-right-leg-root', this.#root, [0.2, -0.18, 0], scene);

    const skin = createMaterial('player-skin', new Color3(0.77, 0.59, 0.43), scene);
    const hair = createMaterial('player-hair', new Color3(0.12, 0.08, 0.055), scene);
    const tunic = createMaterial('player-tunic', new Color3(0.16, 0.34, 0.26), scene);
    const tunicLight = createMaterial(
      'player-tunic-light',
      new Color3(0.28, 0.5, 0.36),
      scene,
    );
    const leather = createMaterial('player-leather', new Color3(0.25, 0.14, 0.08), scene);
    const boots = createMaterial('player-boots', new Color3(0.105, 0.075, 0.055), scene);
    const eyes = createMaterial('player-eyes', new Color3(0.025, 0.04, 0.03), scene);
    const rune = createMaterial(
      'player-rune',
      new Color3(0.12, 0.55, 0.31),
      scene,
      new Color3(0.03, 0.18, 0.09),
    );

    createBox('player-torso', this.#bodyRoot, [0.72, 0.72, 0.36], [0, 0.2, 0], tunic, scene);
    createBox(
      'player-shoulder-cloth',
      this.#bodyRoot,
      [0.82, 0.18, 0.42],
      [0, 0.52, 0],
      tunicLight,
      scene,
    );
    createBox('player-belt', this.#bodyRoot, [0.76, 0.14, 0.4], [0, -0.18, 0], leather, scene);
    createBox(
      'player-chest-rune',
      this.#bodyRoot,
      [0.16, 0.3, 0.035],
      [0, 0.25, 0.198],
      rune,
      scene,
    );
    createBox(
      'player-back-cloak',
      this.#bodyRoot,
      [0.62, 0.78, 0.1],
      [0, 0.17, -0.24],
      tunicLight,
      scene,
    );

    createBox('player-head', this.#headRoot, [0.54, 0.54, 0.54], [0, 0.12, 0], skin, scene);
    createBox('player-hair-top', this.#headRoot, [0.58, 0.16, 0.58], [0, 0.42, 0], hair, scene);
    createBox(
      'player-hair-back',
      this.#headRoot,
      [0.58, 0.44, 0.12],
      [0, 0.16, -0.31],
      hair,
      scene,
    );
    createBox(
      'player-left-eye',
      this.#headRoot,
      [0.075, 0.075, 0.035],
      [-0.13, 0.18, 0.29],
      eyes,
      scene,
    );
    createBox(
      'player-right-eye',
      this.#headRoot,
      [0.075, 0.075, 0.035],
      [0.13, 0.18, 0.29],
      eyes,
      scene,
    );

    this.#createArm('left', this.#leftArm, skin, tunicLight, leather, scene);
    this.#createArm('right', this.#rightArm, skin, tunicLight, leather, scene);
    this.#createLeg('left', this.#leftLeg, tunic, boots, scene);
    this.#createLeg('right', this.#rightLeg, tunic, boots, scene);
  }

  public update(player: PlayerState, frameSeconds: number): void {
    this.#root.setEnabled(player.cameraMode !== 'first-person');

    const speedFactor = Math.min(player.horizontalSpeed / 6.2, 1);
    const moving = speedFactor > 0.02 && player.grounded && !player.paused;
    if (moving) {
      const gaitRate = player.sprinting ? 12 : 8;
      this.#animationPhase += frameSeconds * gaitRate * Math.max(0.4, speedFactor);
    }

    let leftLeg = 0;
    let rightLeg = 0;
    let leftArm = 0;
    let rightArm = 0;
    let bodyTilt = 0;
    let bob = 0;

    if (!player.grounded) {
      const rising = player.verticalVelocity > 0;
      leftLeg = rising ? -0.42 : 0.2;
      rightLeg = rising ? 0.28 : -0.28;
      leftArm = rising ? -0.55 : -0.25;
      rightArm = rising ? -0.35 : -0.15;
      bodyTilt = 0.08;
    } else if (moving) {
      const amplitude = player.sprinting ? 0.82 : 0.56;
      const swing = Math.sin(this.#animationPhase) * amplitude * speedFactor;
      leftLeg = swing;
      rightLeg = -swing;
      leftArm = -swing * 0.78;
      rightArm = swing * 0.78;
      bodyTilt = player.sprinting ? 0.13 : 0.045;
      bob = Math.abs(Math.sin(this.#animationPhase * 2)) * 0.045 * speedFactor;
    }

    this.#leftLeg.rotation.x = ease(this.#leftLeg.rotation.x, leftLeg, frameSeconds);
    this.#rightLeg.rotation.x = ease(this.#rightLeg.rotation.x, rightLeg, frameSeconds);
    this.#leftArm.rotation.x = ease(this.#leftArm.rotation.x, leftArm, frameSeconds);
    this.#rightArm.rotation.x = ease(this.#rightArm.rotation.x, rightArm, frameSeconds);
    this.#bodyRoot.rotation.x = ease(this.#bodyRoot.rotation.x, bodyTilt, frameSeconds);
    this.#headRoot.rotation.x = ease(
      this.#headRoot.rotation.x,
      -player.pitch * 0.65,
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
    createBox(`player-${side}-sleeve`, root, [0.25, 0.44, 0.27], [0, -0.2, 0], cloth, scene);
    createBox(`player-${side}-forearm`, root, [0.21, 0.34, 0.22], [0, -0.56, 0], skin, scene);
    createBox(
      `player-${side}-wrist-wrap`,
      root,
      [0.235, 0.12, 0.24],
      [0, -0.46, 0],
      leather,
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
    createBox(`player-${side}-leg`, root, [0.29, 0.58, 0.3], [0, -0.3, 0], cloth, scene);
    createBox(`player-${side}-boot`, root, [0.31, 0.28, 0.43], [0, -0.7, 0.075], boots, scene);
  }
}
