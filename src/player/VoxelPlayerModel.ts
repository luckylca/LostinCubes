import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';

interface BoxPartOptions {
  readonly name: string;
  readonly size: Readonly<{ width: number; height: number; depth: number }>;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly material: StandardMaterial;
  readonly parent: TransformNode;
  readonly scene: Scene;
}

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

function createBoxPart(options: BoxPartOptions): Mesh {
  const mesh = MeshBuilder.CreateBox(
    options.name,
    {
      width: options.size.width,
      height: options.size.height,
      depth: options.size.depth,
    },
    options.scene,
  );
  mesh.position.set(
    options.position.x,
    options.position.y,
    options.position.z,
  );
  mesh.parent = options.parent;
  mesh.material = options.material;
  mesh.isPickable = false;
  return mesh;
}

function ease(current: number, target: number, frameSeconds: number): number {
  const blend = 1 - Math.exp(-14 * Math.min(frameSeconds, 0.1));
  return current + (target - current) * blend;
}

/**
 * A lightweight, original block-character rig assembled entirely from Babylon
 * primitives. The logical player remains independent from this presentation
 * object, so the model can later be replaced by an imported GLB without
 * changing movement, saving, replay, or networking code.
 */
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
    this.#root = new TransformNode('player-model-root', scene);
    this.#bodyRoot = new TransformNode('player-body-root', scene);
    this.#bodyRoot.parent = this.#root;

    this.#headRoot = new TransformNode('player-head-root', scene);
    this.#headRoot.position.y = 0.78;
    this.#headRoot.parent = this.#root;

    this.#leftArm = new TransformNode('player-left-arm-root', scene);
    this.#leftArm.position.set(-0.48, 0.53, 0);
    this.#leftArm.parent = this.#root;

    this.#rightArm = new TransformNode('player-right-arm-root', scene);
    this.#rightArm.position.set(0.48, 0.53, 0);
    this.#rightArm.parent = this.#root;

    this.#leftLeg = new TransformNode('player-left-leg-root', scene);
    this.#leftLeg.position.set(-0.2, -0.18, 0);
    this.#leftLeg.parent = this.#root;

    this.#rightLeg = new TransformNode('player-right-leg-root', scene);
    this.#rightLeg.position.set(0.2, -0.18, 0);
    this.#rightLeg.parent = this.#root;

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

    createBoxPart({
      name: 'player-torso',
      size: { width: 0.72, height: 0.72, depth: 0.36 },
      position: { x: 0, y: 0.2, z: 0 },
      material: tunic,
      parent: this.#bodyRoot,
      scene,
    });
    createBoxPart({
      name: 'player-shoulder-cloth',
      size: { width: 0.82, height: 0.18, depth: 0.42 },
      position: { x: 0, y: 0.52, z: 0 },
      material: tunicLight,
      parent: this.#bodyRoot,
      scene,
    });
    createBoxPart({
      name: 'player-belt',
      size: { width: 0.76, height: 0.14, depth: 0.4 },
      position: { x: 0, y: -0.18, z: 0 },
      material: leather,
      parent: this.#bodyRoot,
      scene,
    });
    createBoxPart({
      name: 'player-chest-rune',
      size: { width: 0.16, height: 0.3, depth: 0.035 },
      position: { x: 0, y: 0.25, z: 0.198 },
      material: rune,
      parent: this.#bodyRoot,
      scene,
    });
    createBoxPart({
      name: 'player-back-cloak',
      size: { width: 0.62, height: 0.78, depth: 0.1 },
      position: { x: 0, y: 0.17, z: -0.24 },
      material: tunicLight,
      parent: this.#bodyRoot,
      scene,
    });

    createBoxPart({
      name: 'player-head',
      size: { width: 0.54, height: 0.54, depth: 0.54 },
      position: { x: 0, y: 0.12, z: 0 },
      material: skin,
      parent: this.#headRoot,
      scene,
    });
    createBoxPart({
      name: 'player-hair-top',
      size: { width: 0.58, height: 0.16, depth: 0.58 },
      position: { x: 0, y: 0.42, z: 0 },
      material: hair,
      parent: this.#headRoot,
      scene,
    });
    createBoxPart({
      name: 'player-hair-back',
      size: { width: 0.58, height: 0.44, depth: 0.12 },
      position: { x: 0, y: 0.16, z: -0.31 },
      material: hair,
      parent: this.#headRoot,
      scene,
    });
    createBoxPart({
      name: 'player-left-eye',
      size: { width: 0.075, height: 0.075, depth: 0.035 },
      position: { x: -0.13, y: 0.18, z: 0.29 },
      material: eyes,
      parent: this.#headRoot,
      scene,
    });
    createBoxPart({
      name: 'player-right-eye',
      size: { width: 0.075, height: 0.075, depth: 0.035 },
      position: { x: 0.13, y: 0.18, z: 0.29 },
      material: eyes,
      parent: this.#headRoot,
      scene,
    });

    this.#createArm('left', this.#leftArm, skin, tunicLight, leather, scene);
    this.#createArm('right', this.#rightArm, skin, tunicLight, leather, scene);
    this.#createLeg('left', this.#leftLeg, tunic, boots, scene);
    this.#createLeg('right', this.#rightLeg, tunic, boots, scene);
  }

  public update(player: PlayerState, frameSeconds: number): void {
    const firstPerson = player.cameraMode === 'first-person';
    this.#root.setEnabled(!firstPerson);

    const speedFactor = Math.min(player.horizontalSpeed / 6.2, 1);
    const isMoving = speedFactor > 0.02 && player.grounded && !player.paused;
    const gaitRate = player.sprinting ? 12 : 8;
    if (isMoving) {
      this.#animationPhase += frameSeconds * gaitRate * Math.max(0.4, speedFactor);
    }

    let leftLegTarget = 0;
    let rightLegTarget = 0;
    let leftArmTarget = 0;
    let rightArmTarget = 0;
    let bodyTiltTarget = 0;
    let bobTarget = 0;

    if (!player.grounded) {
      const rising = player.verticalVelocity > 0;
      leftLegTarget = rising ? -0.42 : 0.2;
      rightLegTarget = rising ? 0.28 : -0.28;
      leftArmTarget = rising ? -0.55 : -0.25;
      rightArmTarget = rising ? -0.35 : -0.15;
      bodyTiltTarget = 0.08;
    } else if (isMoving) {
      const amplitude = player.sprinting ? 0.82 : 0.56;
      const swing = Math.sin(this.#animationPhase) * amplitude * speedFactor;
      leftLegTarget = swing;
      rightLegTarget = -swing;
      leftArmTarget = -swing * 0.78;
      rightArmTarget = swing * 0.78;
      bodyTiltTarget = player.sprinting ? 0.13 : 0.045;
      bobTarget = Math.abs(Math.sin(this.#animationPhase * 2)) * 0.045 * speedFactor;
    }

    this.#leftLeg.rotation.x = ease(
      this.#leftLeg.rotation.x,
      leftLegTarget,
      frameSeconds,
    );
    this.#rightLeg.rotation.x = ease(
      this.#rightLeg.rotation.x,
      rightLegTarget,
      frameSeconds,
    );
    this.#leftArm.rotation.x = ease(
      this.#leftArm.rotation.x,
      leftArmTarget,
      frameSeconds,
    );
    this.#rightArm.rotation.x = ease(
      this.#rightArm.rotation.x,
      rightArmTarget,
      frameSeconds,
    );
    this.#bodyRoot.rotation.x = ease(
      this.#bodyRoot.rotation.x,
      bodyTiltTarget,
      frameSeconds,
    );
    this.#headRoot.rotation.x = ease(
      this.#headRoot.rotation.x,
      -player.pitch * 0.18,
      frameSeconds,
    );
    this.#currentBob = ease(this.#currentBob, bobTarget, frameSeconds);

    this.#root.position.copyFrom(
      new Vector3(
        player.position.x,
        player.position.y + this.#currentBob,
        player.position.z,
      ),
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
    createBoxPart({
      name: `player-${side}-sleeve`,
      size: { width: 0.25, height: 0.44, depth: 0.27 },
      position: { x: 0, y: -0.2, z: 0 },
      material: cloth,
      parent: root,
      scene,
    });
    createBoxPart({
      name: `player-${side}-forearm`,
      size: { width: 0.21, height: 0.34, depth: 0.22 },
      position: { x: 0, y: -0.56, z: 0 },
      material: skin,
      parent: root,
      scene,
    });
    createBoxPart({
      name: `player-${side}-wrist-wrap`,
      size: { width: 0.235, height: 0.12, depth: 0.24 },
      position: { x: 0, y: -0.46, z: 0 },
      material: leather,
      parent: root,
      scene,
    });
  }

  #createLeg(
    side: 'left' | 'right',
    root: TransformNode,
    cloth: StandardMaterial,
    boots: StandardMaterial,
    scene: Scene,
  ): void {
    createBoxPart({
      name: `player-${side}-leg`,
      size: { width: 0.29, height: 0.58, depth: 0.3 },
      position: { x: 0, y: -0.3, z: 0 },
      material: cloth,
      parent: root,
      scene,
    });
    createBoxPart({
      name: `player-${side}-boot`,
      size: { width: 0.31, height: 0.28, depth: 0.43 },
      position: { x: 0, y: -0.7, z: 0.075 },
      material: boots,
      parent: root,
      scene,
    });
  }
}
