import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
} from '@babylonjs/core';
import type {
  AbstractMesh,
  Observer,
  Scene,
  Vector3,
} from '@babylonjs/core';
import type { EntityKind } from './EntityRegistry';

type CreatureKind = Exclude<EntityKind, 'arrow' | 'tnt' | 'dropped-item'>;

interface CreatureModel {
  readonly sourceBody: Mesh;
  readonly root: TransformNode;
  readonly material: StandardMaterial;
  readonly accents: StandardMaterial[];
  readonly legs: Mesh[];
  readonly previousPosition: Vector3;
  phase: number;
}

const BODY_PATTERN = /^body-(?<kind>zombie|skeleton|spider|creeper|cow|pig|sheep)-/;

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

function texturedMaterial(
  scene: Scene,
  name: string,
  texture: Texture,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  material.ambientColor = new Color3(0.56, 0.56, 0.56);
  material.specularColor = Color3.Black();
  return material;
}

function plainMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color.scale(0.5);
  material.specularColor = Color3.Black();
  return material;
}

function part(
  scene: Scene,
  root: TransformNode,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: StandardMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.parent = root;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function fourLegs(
  scene: Scene,
  root: TransformNode,
  material: StandardMaterial,
  prefix: string,
  x: number,
  z: number,
  y: number,
  height: number,
): Mesh[] {
  return [
    part(scene, root, `${prefix}-leg-fl`, [0.22, height, 0.22], [-x, y, z], material),
    part(scene, root, `${prefix}-leg-fr`, [0.22, height, 0.22], [x, y, z], material),
    part(scene, root, `${prefix}-leg-bl`, [0.22, height, 0.22], [-x, y, -z], material),
    part(scene, root, `${prefix}-leg-br`, [0.22, height, 0.22], [x, y, -z], material),
  ];
}

function humanoid(
  scene: Scene,
  root: TransformNode,
  material: StandardMaterial,
  prefix: string,
  skeleton: boolean,
): Mesh[] {
  const limb = skeleton ? 0.13 : 0.22;
  const torso = skeleton ? 0.38 : 0.52;
  const depth = skeleton ? 0.2 : 0.28;
  part(scene, root, `${prefix}-head`, [0.5, 0.5, 0.5], [0, 0.66, 0], material);
  part(scene, root, `${prefix}-body`, [torso, 0.68, depth], [0, 0.09, 0], material);
  return [
    part(scene, root, `${prefix}-arm-l`, [limb, 0.72, limb], [-0.38, 0.08, 0], material),
    part(scene, root, `${prefix}-arm-r`, [limb, 0.72, limb], [0.38, 0.08, 0], material),
    part(scene, root, `${prefix}-leg-l`, [limb + 0.02, 0.72, limb + 0.02], [-0.14, -0.6, 0], material),
    part(scene, root, `${prefix}-leg-r`, [limb + 0.02, 0.72, limb + 0.02], [0.14, -0.6, 0], material),
  ];
}

function buildModel(
  scene: Scene,
  root: TransformNode,
  kind: CreatureKind,
  material: StandardMaterial,
  accents: StandardMaterial[],
  suffix: string,
): Mesh[] {
  const prefix = `${kind}-${suffix}`;
  switch (kind) {
    case 'zombie':
      return humanoid(scene, root, material, prefix, false);
    case 'skeleton':
      return humanoid(scene, root, material, prefix, true);
    case 'creeper':
      part(scene, root, `${prefix}-head`, [0.58, 0.58, 0.58], [0, 0.62, 0.04], material);
      part(scene, root, `${prefix}-body`, [0.48, 0.78, 0.34], [0, 0.05, 0], material);
      return fourLegs(scene, root, material, prefix, 0.17, 0.16, -0.5, 0.42);
    case 'spider': {
      part(scene, root, `${prefix}-head`, [0.58, 0.4, 0.5], [0, 0.02, 0.46], material);
      part(scene, root, `${prefix}-body`, [0.8, 0.46, 0.72], [0, 0.02, -0.18], material);
      const legs: Mesh[] = [];
      for (const side of [-1, 1] as const) {
        for (let index = 0; index < 4; index += 1) {
          const leg = part(
            scene,
            root,
            `${prefix}-leg-${String(side)}-${String(index)}`,
            [0.68, 0.1, 0.1],
            [side * 0.66, -0.04, 0.34 - index * 0.24],
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
      part(scene, root, `${prefix}-body`, [0.9, 0.64, 1.08], [0, 0.12, -0.08], material);
      part(scene, root, `${prefix}-head`, [0.62, 0.58, 0.62], [0, 0.2, 0.67], material);
      const snout = plainMaterial(scene, `${prefix}-snout-material`, new Color3(0.86, 0.52, 0.55));
      accents.push(snout);
      part(scene, root, `${prefix}-snout`, [0.38, 0.22, 0.14], [0, 0.12, 1.01], snout);
      part(scene, root, `${prefix}-ear-l`, [0.16, 0.18, 0.12], [-0.22, 0.55, 0.72], material);
      part(scene, root, `${prefix}-ear-r`, [0.16, 0.18, 0.12], [0.22, 0.55, 0.72], material);
      return fourLegs(scene, root, material, prefix, 0.3, 0.32, -0.4, 0.56);
    }
    case 'cow': {
      part(scene, root, `${prefix}-body`, [0.98, 0.74, 1.2], [0, 0.18, -0.08], material);
      part(scene, root, `${prefix}-head`, [0.62, 0.62, 0.58], [0, 0.3, 0.74], material);
      const muzzle = plainMaterial(scene, `${prefix}-muzzle-material`, new Color3(0.62, 0.44, 0.32));
      const horn = plainMaterial(scene, `${prefix}-horn-material`, new Color3(0.86, 0.82, 0.68));
      accents.push(muzzle, horn);
      part(scene, root, `${prefix}-muzzle`, [0.46, 0.24, 0.16], [0, 0.17, 1.05], muzzle);
      part(scene, root, `${prefix}-horn-l`, [0.1, 0.18, 0.1], [-0.27, 0.67, 0.74], horn).rotation.z = -0.35;
      part(scene, root, `${prefix}-horn-r`, [0.1, 0.18, 0.1], [0.27, 0.67, 0.74], horn).rotation.z = 0.35;
      return fourLegs(scene, root, material, prefix, 0.33, 0.38, -0.42, 0.62);
    }
    case 'sheep': {
      const face = plainMaterial(scene, `${prefix}-face-material`, new Color3(0.27, 0.25, 0.22));
      accents.push(face);
      part(scene, root, `${prefix}-wool`, [1.02, 0.82, 1.16], [0, 0.2, -0.08], material);
      part(scene, root, `${prefix}-head`, [0.5, 0.54, 0.52], [0, 0.22, 0.7], face);
      return fourLegs(scene, root, face, prefix, 0.3, 0.34, -0.43, 0.58);
    }
  }
}

/**
 * Deferred creature visual adapter.
 *
 * Babylon can announce a mesh before ClassicEntityManager has assigned its
 * entity TransformNode parent. Bodies are therefore discovered both through
 * onNewMeshAdded and a cheap per-frame fallback scan. The legacy body stays
 * visible until the multipart replacement was built successfully.
 */
export class CreatureVisualRuntime {
  readonly #scene: Scene;
  readonly #pending = new Set<Mesh>();
  readonly #models = new Map<Mesh, CreatureModel>();
  readonly #textures = new Map<CreatureKind, Texture>();
  readonly #meshObserver: Observer<AbstractMesh>;
  readonly #frameObserver: Observer<Scene>;

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#meshObserver = scene.onNewMeshAddedObservable.add((mesh) => this.#queue(mesh));
    this.#frameObserver = scene.onBeforeRenderObservable.add(() => {
      this.#flushPending();
      this.#updateModels();
    });
    for (const mesh of scene.meshes) this.#queue(mesh);
  }

  public dispose(): void {
    this.#scene.onNewMeshAddedObservable.remove(this.#meshObserver);
    this.#scene.onBeforeRenderObservable.remove(this.#frameObserver);
    this.#pending.clear();
    for (const model of this.#models.values()) this.#disposeModel(model);
    this.#models.clear();
    for (const texture of this.#textures.values()) texture.dispose();
    this.#textures.clear();
  }

  #queue(abstractMesh: AbstractMesh): void {
    if (!(abstractMesh instanceof Mesh)) return;
    const match = BODY_PATTERN.exec(abstractMesh.name);
    const kind = match?.groups?.kind;
    if (kind === undefined || !isCreatureKind(kind)) return;
    if (this.#models.has(abstractMesh)) return;
    this.#pending.add(abstractMesh);
  }

  #flushPending(): void {
    for (const mesh of this.#scene.meshes) this.#queue(mesh);

    for (const body of [...this.#pending]) {
      if (body.isDisposed()) {
        this.#pending.delete(body);
        continue;
      }
      const parent = body.parent;
      if (!(parent instanceof TransformNode)) continue;
      const match = BODY_PATTERN.exec(body.name);
      const kind = match?.groups?.kind;
      if (kind === undefined || !isCreatureKind(kind)) {
        this.#pending.delete(body);
        continue;
      }

      try {
        const root = new TransformNode(`upgraded-${body.name}`, this.#scene);
        root.parent = parent;
        const material = texturedMaterial(
          this.#scene,
          `upgraded-${kind}-${String(body.uniqueId)}`,
          this.#texture(kind),
        );
        const accents: StandardMaterial[] = [];
        const legs = buildModel(
          this.#scene,
          root,
          kind,
          material,
          accents,
          String(body.uniqueId),
        );
        const model: CreatureModel = {
          sourceBody: body,
          root,
          material,
          accents,
          legs,
          previousPosition: parent.getAbsolutePosition().clone(),
          phase: 0,
        };
        this.#models.set(body, model);
        body.isVisible = false;
        const entityId = body.name.slice('body-'.length);
        const legacyEye = this.#scene.getMeshByName(`eye-${entityId}`);
        if (legacyEye !== null) legacyEye.isVisible = false;
        this.#pending.delete(body);
      } catch (error: unknown) {
        body.isVisible = true;
        console.error(`Failed to build creature model for ${body.name}.`, error);
        this.#pending.delete(body);
      }
    }
  }

  #texture(kind: CreatureKind): Texture {
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

  #updateModels(): void {
    for (const [body, model] of this.#models) {
      if (body.isDisposed()) {
        this.#disposeModel(model);
        this.#models.delete(body);
        continue;
      }
      const parent = body.parent;
      if (!(parent instanceof TransformNode)) continue;
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

      const hurt = body.material?.name.startsWith('hurt-') === true;
      model.material.emissiveColor = hurt
        ? new Color3(0.42, 0.025, 0.018)
        : Color3.Black();
      for (const accent of model.accents) {
        accent.emissiveColor = hurt
          ? new Color3(0.32, 0.018, 0.012)
          : Color3.Black();
      }
    }
  }

  #disposeModel(model: CreatureModel): void {
    model.root.dispose(false, false);
    model.material.dispose(false, false);
    for (const accent of model.accents) accent.dispose(false, false);
  }
}
