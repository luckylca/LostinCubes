import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import type { EntityKind } from './EntityRegistry';

type CreatureKind = Exclude<EntityKind, 'arrow' | 'tnt' | 'dropped-item'>;

interface UpgradedModel {
  readonly kind: CreatureKind;
  readonly sourceBody: Mesh;
  readonly root: TransformNode;
  readonly material: StandardMaterial;
  readonly accentMaterials: StandardMaterial[];
  readonly legs: Mesh[];
  readonly previousPosition: Vector3;
  phase: number;
}

const CREATURE_PATTERN = /^(?:body)-(?<kind>zombie|skeleton|spider|creeper|cow|pig|sheep)-/;
const LEGACY_EYE_PATTERN = /^eye-(?:zombie|skeleton|spider|creeper|cow|pig|sheep)-/;

const TEXTURE_URLS: Readonly<Record<CreatureKind, string>> = {
  zombie: new URL('../assets/entities/zombie.svg', import.meta.url).href,
  skeleton: new URL('../assets/entities/skeleton.svg', import.meta.url).href,
  spider: new URL('../assets/entities/spider.svg', import.meta.url).href,
  creeper: new URL('../assets/entities/creeper.svg', import.meta.url).href,
  cow: new URL('../assets/entities/cow.svg', import.meta.url).href,
  pig: new URL('../assets/entities/pig.svg', import.meta.url).href,
  sheep: new URL('../assets/entities/sheep.svg', import.meta.url).href,
};

function isCreatureKind(value: string): value is CreatureKind {
  return Object.hasOwn(TEXTURE_URLS, value);
}

function makeTexturedMaterial(
  name: string,
  scene: Scene,
  texture: Texture,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  material.ambientColor = new Color3(0.55, 0.55, 0.55);
  material.specularColor = Color3.Black();
  return material;
}

function makePlainMaterial(
  name: string,
  scene: Scene,
  color: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color.scale(0.48);
  material.specularColor = Color3.Black();
  return material;
}

function createPart(
  scene: Scene,
  root: TransformNode,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: StandardMaterial,
): Mesh {
  const part = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  part.parent = root;
  part.position.set(position[0], position[1], position[2]);
  part.material = material;
  part.isPickable = false;
  return part;
}

function addFourLegs(
  scene: Scene,
  root: TransformNode,
  material: StandardMaterial,
  prefix: string,
  x: number,
  z: number,
  y = -0.36,
  height = 0.58,
): Mesh[] {
  return [
    createPart(scene, root, `${prefix}-leg-fl`, [0.22, height, 0.22], [-x, y, z], material),
    createPart(scene, root, `${prefix}-leg-fr`, [0.22, height, 0.22], [x, y, z], material),
    createPart(scene, root, `${prefix}-leg-bl`, [0.22, height, 0.22], [-x, y, -z], material),
    createPart(scene, root, `${prefix}-leg-br`, [0.22, height, 0.22], [x, y, -z], material),
  ];
}

function buildHumanoid(
  scene: Scene,
  root: TransformNode,
  material: StandardMaterial,
  prefix: string,
  skeleton: boolean,
): Mesh[] {
  const limbWidth = skeleton ? 0.13 : 0.22;
  const bodyWidth = skeleton ? 0.38 : 0.52;
  const bodyDepth = skeleton ? 0.2 : 0.28;
  createPart(scene, root, `${prefix}-head`, [0.5, 0.5, 0.5], [0, 0.66, 0], material);
  createPart(scene, root, `${prefix}-body`, [bodyWidth, 0.68, bodyDepth], [0, 0.09, 0], material);
  const armLeft = createPart(scene, root, `${prefix}-arm-l`, [limbWidth, 0.72, limbWidth], [-0.38, 0.08, 0], material);
  const armRight = createPart(scene, root, `${prefix}-arm-r`, [limbWidth, 0.72, limbWidth], [0.38, 0.08, 0], material);
  const legLeft = createPart(scene, root, `${prefix}-leg-l`, [limbWidth + 0.02, 0.72, limbWidth + 0.02], [-0.14, -0.6, 0], material);
  const legRight = createPart(scene, root, `${prefix}-leg-r`, [limbWidth + 0.02, 0.72, limbWidth + 0.02], [0.14, -0.6, 0], material);
  return [armLeft, armRight, legLeft, legRight];
}

function buildCreatureModel(
  scene: Scene,
  root: TransformNode,
  kind: CreatureKind,
  material: StandardMaterial,
  accents: StandardMaterial[],
): Mesh[] {
  switch (kind) {
    case 'zombie':
      return buildHumanoid(scene, root, material, 'zombie', false);
    case 'skeleton':
      return buildHumanoid(scene, root, material, 'skeleton', true);
    case 'creeper': {
      createPart(scene, root, 'creeper-head', [0.58, 0.58, 0.58], [0, 0.62, 0.04], material);
      createPart(scene, root, 'creeper-body', [0.48, 0.78, 0.34], [0, 0.05, 0], material);
      return addFourLegs(scene, root, material, 'creeper', 0.17, 0.16, -0.5, 0.42);
    }
    case 'spider': {
      createPart(scene, root, 'spider-head', [0.58, 0.4, 0.5], [0, 0.02, 0.46], material);
      createPart(scene, root, 'spider-body', [0.8, 0.46, 0.72], [0, 0.02, -0.18], material);
      const legs: Mesh[] = [];
      for (const side of [-1, 1] as const) {
        for (let index = 0; index < 4; index += 1) {
          const z = 0.34 - index * 0.24;
          const leg = createPart(
            scene,
            root,
            `spider-leg-${String(side)}-${String(index)}`,
            [0.68, 0.1, 0.1],
            [side * 0.66, -0.04, z],
            material,
          );
          leg.rotation.y = side * (0.18 + index * 0.05);
          leg.rotation.z = side * -0.18;
          legs.push(leg);
        }
      }
      return legs;
    }
    case 'pig': {
      createPart(scene, root, 'pig-body', [0.9, 0.64, 1.08], [0, 0.12, -0.08], material);
      createPart(scene, root, 'pig-head', [0.62, 0.58, 0.62], [0, 0.2, 0.67], material);
      const snout = makePlainMaterial('pig-snout-material', scene, new Color3(0.86, 0.52, 0.55));
      accents.push(snout);
      createPart(scene, root, 'pig-snout', [0.38, 0.22, 0.14], [0, 0.12, 1.01], snout);
      createPart(scene, root, 'pig-ear-l', [0.16, 0.18, 0.12], [-0.22, 0.55, 0.72], material);
      createPart(scene, root, 'pig-ear-r', [0.16, 0.18, 0.12], [0.22, 0.55, 0.72], material);
      return addFourLegs(scene, root, material, 'pig', 0.3, 0.32, -0.4, 0.56);
    }
    case 'cow': {
      createPart(scene, root, 'cow-body', [0.98, 0.74, 1.2], [0, 0.18, -0.08], material);
      createPart(scene, root, 'cow-head', [0.62, 0.62, 0.58], [0, 0.3, 0.74], material);
      const muzzle = makePlainMaterial('cow-muzzle-material', scene, new Color3(0.62, 0.44, 0.32));
      const horn = makePlainMaterial('cow-horn-material', scene, new Color3(0.86, 0.82, 0.68));
      accents.push(muzzle, horn);
      createPart(scene, root, 'cow-muzzle', [0.46, 0.24, 0.16], [0, 0.17, 1.05], muzzle);
      createPart(scene, root, 'cow-horn-l', [0.1, 0.18, 0.1], [-0.27, 0.67, 0.74], horn).rotation.z = -0.35;
      createPart(scene, root, 'cow-horn-r', [0.1, 0.18, 0.1], [0.27, 0.67, 0.74], horn).rotation.z = 0.35;
      return addFourLegs(scene, root, material, 'cow', 0.33, 0.38, -0.42, 0.62);
    }
    case 'sheep': {
      const dark = makePlainMaterial('sheep-face-material', scene, new Color3(0.27, 0.25, 0.22));
      accents.push(dark);
      createPart(scene, root, 'sheep-wool', [1.02, 0.82, 1.16], [0, 0.2, -0.08], material);
      createPart(scene, root, 'sheep-head', [0.5, 0.54, 0.52], [0, 0.22, 0.7], dark);
      return addFourLegs(scene, root, dark, 'sheep', 0.3, 0.34, -0.43, 0.58);
    }
  }
}

/**
 * Replaces the original one-box creature presentation without touching AI,
 * registry, combat, or persistence. The legacy body remains hidden so the
 * existing hurt-state code can continue using it as its state source.
 */
export class EntityVisualUpgradeRuntime {
  readonly #scene: Scene;
  readonly #models = new Map<Mesh, UpgradedModel>();
  readonly #textures = new Map<CreatureKind, Texture>();
  readonly #meshObserver: Observer<AbstractMesh>;
  readonly #frameObserver: Observer<Scene>;

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#meshObserver = scene.onNewMeshAddedObservable.add((mesh) => this.#inspectMesh(mesh));
    this.#frameObserver = scene.onBeforeRenderObservable.add(() => this.#updateModels());
    for (const mesh of scene.meshes) this.#inspectMesh(mesh);
  }

  public dispose(): void {
    this.#scene.onNewMeshAddedObservable.remove(this.#meshObserver);
    this.#scene.onBeforeRenderObservable.remove(this.#frameObserver);
    for (const model of this.#models.values()) {
      model.root.dispose(false, false);
      model.material.dispose(false, false);
      for (const material of model.accentMaterials) material.dispose(false, false);
    }
    this.#models.clear();
    for (const texture of this.#textures.values()) texture.dispose();
    this.#textures.clear();
  }

  #inspectMesh(abstractMesh: AbstractMesh): void {
    if (!(abstractMesh instanceof Mesh)) return;
    if (LEGACY_EYE_PATTERN.test(abstractMesh.name)) {
      abstractMesh.isVisible = false;
      return;
    }
    const match = CREATURE_PATTERN.exec(abstractMesh.name);
    const kind = match?.groups?.kind;
    if (kind === undefined || !isCreatureKind(kind) || this.#models.has(abstractMesh)) return;
    this.#upgradeBody(abstractMesh, kind);
  }

  #getTexture(kind: CreatureKind): Texture {
    const existing = this.#textures.get(kind);
    if (existing !== undefined) return existing;
    const texture = new Texture(
      TEXTURE_URLS[kind],
      this.#scene,
      false,
      false,
      Texture.NEAREST_NEAREST,
    );
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.#textures.set(kind, texture);
    return texture;
  }

  #upgradeBody(sourceBody: Mesh, kind: CreatureKind): void {
    const parent = sourceBody.parent;
    if (parent === null) return;
    sourceBody.isVisible = false;
    sourceBody.isPickable = false;

    const root = new TransformNode(`upgraded-${sourceBody.name}`, this.#scene);
    root.parent = parent;
    const material = makeTexturedMaterial(
      `upgraded-${kind}-${sourceBody.uniqueId}`,
      this.#scene,
      this.#getTexture(kind),
    );
    const accentMaterials: StandardMaterial[] = [];
    const legs = buildCreatureModel(
      this.#scene,
      root,
      kind,
      material,
      accentMaterials,
    );
    this.#models.set(sourceBody, {
      kind,
      sourceBody,
      root,
      material,
      accentMaterials,
      legs,
      previousPosition: parent.getAbsolutePosition().clone(),
      phase: 0,
    });
  }

  #updateModels(): void {
    for (const [sourceBody, model] of this.#models) {
      if (sourceBody.isDisposed()) {
        model.root.dispose(false, false);
        model.material.dispose(false, false);
        for (const material of model.accentMaterials) material.dispose(false, false);
        this.#models.delete(sourceBody);
        continue;
      }

      const parent = sourceBody.parent;
      if (parent === null) continue;
      const position = parent.getAbsolutePosition();
      const deltaX = position.x - model.previousPosition.x;
      const deltaZ = position.z - model.previousPosition.z;
      const travel = Math.hypot(deltaX, deltaZ);
      if (travel > 0.0004) {
        parent.rotation.y = Math.atan2(deltaX, deltaZ);
        model.phase += Math.min(travel * 11, 0.55);
      }
      model.previousPosition.copyFrom(position);

      const stride = travel > 0.0004 ? Math.sin(model.phase * 4.2) * 0.55 : 0;
      for (let index = 0; index < model.legs.length; index += 1) {
        const leg = model.legs[index];
        if (leg === undefined) continue;
        leg.rotation.x = index % 2 === 0 ? stride : -stride;
      }

      const hurt = sourceBody.material?.name.startsWith('hurt-') === true;
      model.material.emissiveColor = hurt
        ? new Color3(0.42, 0.025, 0.018)
        : Color3.Black();
      for (const material of model.accentMaterials) {
        material.emissiveColor = hurt
          ? new Color3(0.32, 0.018, 0.012)
          : Color3.Black();
      }
    }
  }
}
