import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
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
  readonly materials: StandardMaterial[];
  readonly animatedLimbs: Mesh[];
  readonly previousPosition: Vector3;
  phase: number;
}

interface CreaturePalette {
  readonly primary: Color3;
  readonly secondary: Color3;
  readonly detail: Color3;
  readonly dark: Color3;
}

const BODY_PATTERN = /^body-(?<kind>zombie|skeleton|spider|creeper|cow|pig|sheep)-/;

const PALETTES: Readonly<Record<CreatureKind, CreaturePalette>> = {
  zombie: {
    primary: new Color3(0.27, 0.52, 0.3),
    secondary: new Color3(0.12, 0.43, 0.43),
    detail: new Color3(0.18, 0.27, 0.43),
    dark: new Color3(0.05, 0.08, 0.055),
  },
  skeleton: {
    primary: new Color3(0.82, 0.81, 0.72),
    secondary: new Color3(0.67, 0.66, 0.59),
    detail: new Color3(0.92, 0.91, 0.82),
    dark: new Color3(0.07, 0.07, 0.06),
  },
  spider: {
    primary: new Color3(0.16, 0.105, 0.08),
    secondary: new Color3(0.23, 0.14, 0.1),
    detail: new Color3(0.72, 0.055, 0.025),
    dark: new Color3(0.045, 0.025, 0.02),
  },
  creeper: {
    primary: new Color3(0.27, 0.66, 0.3),
    secondary: new Color3(0.18, 0.51, 0.22),
    detail: new Color3(0.39, 0.76, 0.36),
    dark: new Color3(0.025, 0.065, 0.03),
  },
  cow: {
    primary: new Color3(0.36, 0.2, 0.12),
    secondary: new Color3(0.14, 0.085, 0.055),
    detail: new Color3(0.65, 0.46, 0.34),
    dark: new Color3(0.035, 0.025, 0.02),
  },
  pig: {
    primary: new Color3(0.78, 0.43, 0.47),
    secondary: new Color3(0.9, 0.57, 0.59),
    detail: new Color3(0.61, 0.27, 0.31),
    dark: new Color3(0.11, 0.055, 0.065),
  },
  sheep: {
    primary: new Color3(0.9, 0.89, 0.83),
    secondary: new Color3(0.28, 0.26, 0.22),
    detail: new Color3(0.72, 0.7, 0.64),
    dark: new Color3(0.055, 0.05, 0.045),
  },
};

function isCreatureKind(value: string): value is CreatureKind {
  return Object.hasOwn(PALETTES, value);
}

function material(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  result.ambientColor = color.scale(0.72);
  result.emissiveColor = color.scale(0.12);
  result.specularColor = Color3.Black();
  return result;
}

function part(
  scene: Scene,
  root: TransformNode,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  partMaterial: StandardMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.parent = root;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.material = partMaterial;
  mesh.isPickable = false;
  return mesh;
}

function addFace(
  scene: Scene,
  root: TransformNode,
  prefix: string,
  y: number,
  z: number,
  eyeSpacing: number,
  eyeMaterial: StandardMaterial,
  mouthMaterial = eyeMaterial,
): void {
  part(
    scene,
    root,
    `${prefix}-eye-l`,
    [0.12, 0.11, 0.04],
    [-eyeSpacing, y, z],
    eyeMaterial,
  );
  part(
    scene,
    root,
    `${prefix}-eye-r`,
    [0.12, 0.11, 0.04],
    [eyeSpacing, y, z],
    eyeMaterial,
  );
  part(
    scene,
    root,
    `${prefix}-mouth`,
    [0.22, 0.07, 0.04],
    [0, y - 0.17, z + 0.002],
    mouthMaterial,
  );
}

function fourLegs(
  scene: Scene,
  root: TransformNode,
  partMaterial: StandardMaterial,
  prefix: string,
  x: number,
  z: number,
  y: number,
  height: number,
): Mesh[] {
  return [
    part(scene, root, `${prefix}-leg-fl`, [0.22, height, 0.22], [-x, y, z], partMaterial),
    part(scene, root, `${prefix}-leg-fr`, [0.22, height, 0.22], [x, y, z], partMaterial),
    part(scene, root, `${prefix}-leg-bl`, [0.22, height, 0.22], [-x, y, -z], partMaterial),
    part(scene, root, `${prefix}-leg-br`, [0.22, height, 0.22], [x, y, -z], partMaterial),
  ];
}

function buildHumanoid(
  scene: Scene,
  root: TransformNode,
  prefix: string,
  skin: StandardMaterial,
  torsoMaterial: StandardMaterial,
  legMaterial: StandardMaterial,
  eyeMaterial: StandardMaterial,
  skeleton: boolean,
): Mesh[] {
  const limb = skeleton ? 0.14 : 0.22;
  const torsoWidth = skeleton ? 0.4 : 0.54;
  const torsoDepth = skeleton ? 0.22 : 0.3;

  part(scene, root, `${prefix}-head`, [0.5, 0.5, 0.5], [0, 0.7, 0], skin);
  part(
    scene,
    root,
    `${prefix}-torso`,
    [torsoWidth, 0.72, torsoDepth],
    [0, 0.08, 0],
    torsoMaterial,
  );
  addFace(scene, root, prefix, 0.75, 0.272, 0.12, eyeMaterial);
  if (skeleton) {
    part(scene, root, `${prefix}-nose`, [0.08, 0.1, 0.04], [0, 0.65, 0.274], eyeMaterial);
  }

  return [
    part(scene, root, `${prefix}-arm-l`, [limb, 0.72, limb], [-0.39, 0.05, 0], torsoMaterial),
    part(scene, root, `${prefix}-arm-r`, [limb, 0.72, limb], [0.39, 0.05, 0], torsoMaterial),
    part(scene, root, `${prefix}-leg-l`, [limb + 0.02, 0.72, limb + 0.02], [-0.14, -0.62, 0], legMaterial),
    part(scene, root, `${prefix}-leg-r`, [limb + 0.02, 0.72, limb + 0.02], [0.14, -0.62, 0], legMaterial),
  ];
}

function addSkeletonBow(
  scene: Scene,
  root: TransformNode,
  prefix: string,
  materials: StandardMaterial[],
): void {
  const wood = material(scene, `${prefix}-bow-material`, new Color3(0.48, 0.28, 0.1));
  const string = material(scene, `${prefix}-bow-string-material`, new Color3(0.82, 0.78, 0.62));
  const iron = material(scene, `${prefix}-arrow-head-material`, new Color3(0.68, 0.7, 0.69));
  materials.push(wood, string, iron);

  const upper = part(scene, root, `${prefix}-bow-upper`, [0.08, 0.55, 0.08], [0.53, 0.3, 0.18], wood);
  upper.rotation.z = -0.28;
  const lower = part(scene, root, `${prefix}-bow-lower`, [0.08, 0.55, 0.08], [0.53, -0.19, 0.18], wood);
  lower.rotation.z = 0.28;
  part(scene, root, `${prefix}-bow-grip`, [0.1, 0.18, 0.1], [0.46, 0.05, 0.18], wood);
  part(scene, root, `${prefix}-bow-string`, [0.025, 1.02, 0.025], [0.64, 0.05, 0.18], string);
  part(scene, root, `${prefix}-held-arrow-shaft`, [0.035, 0.035, 0.72], [0.2, 0.08, 0.38], wood);
  const head = part(scene, root, `${prefix}-held-arrow-head`, [0.11, 0.11, 0.13], [0.2, 0.08, 0.77], iron);
  head.rotation.z = Math.PI / 4;
}

function buildModel(
  scene: Scene,
  root: TransformNode,
  kind: CreatureKind,
  materials: StandardMaterial[],
  suffix: string,
): Mesh[] {
  const palette = PALETTES[kind];
  const prefix = `${kind}-${suffix}`;
  const primary = material(scene, `${prefix}-primary-material`, palette.primary);
  const secondary = material(scene, `${prefix}-secondary-material`, palette.secondary);
  const detail = material(scene, `${prefix}-detail-material`, palette.detail);
  const dark = material(scene, `${prefix}-dark-material`, palette.dark);
  materials.push(primary, secondary, detail, dark);

  switch (kind) {
    case 'zombie':
      return buildHumanoid(
        scene,
        root,
        prefix,
        primary,
        secondary,
        detail,
        dark,
        false,
      );
    case 'skeleton': {
      const limbs = buildHumanoid(
        scene,
        root,
        prefix,
        primary,
        primary,
        secondary,
        dark,
        true,
      );
      addSkeletonBow(scene, root, prefix, materials);
      return limbs;
    }
    case 'creeper':
      part(scene, root, `${prefix}-head`, [0.6, 0.6, 0.6], [0, 0.65, 0.03], primary);
      part(scene, root, `${prefix}-torso`, [0.5, 0.82, 0.36], [0, 0.05, 0], secondary);
      addFace(scene, root, prefix, 0.7, 0.35, 0.13, dark);
      return fourLegs(scene, root, primary, prefix, 0.17, 0.16, -0.52, 0.44);
    case 'spider': {
      part(scene, root, `${prefix}-head`, [0.58, 0.4, 0.52], [0, 0.02, 0.46], secondary);
      part(scene, root, `${prefix}-torso`, [0.84, 0.48, 0.76], [0, 0.02, -0.18], primary);
      for (const x of [-0.18, -0.06, 0.06, 0.18]) {
        part(scene, root, `${prefix}-eye-${String(x)}`, [0.075, 0.07, 0.035], [x, 0.08, 0.735], detail);
      }
      const legs: Mesh[] = [];
      for (const side of [-1, 1] as const) {
        for (let index = 0; index < 4; index += 1) {
          const leg = part(
            scene,
            root,
            `${prefix}-leg-${String(side)}-${String(index)}`,
            [0.7, 0.1, 0.1],
            [side * 0.67, -0.05, 0.34 - index * 0.24],
            dark,
          );
          leg.rotation.y = side * (0.18 + index * 0.05);
          leg.rotation.z = side * -0.18;
          legs.push(leg);
        }
      }
      return legs;
    }
    case 'pig': {
      part(scene, root, `${prefix}-torso`, [0.92, 0.66, 1.08], [0, 0.13, -0.08], primary);
      part(scene, root, `${prefix}-head`, [0.64, 0.6, 0.62], [0, 0.22, 0.67], secondary);
      part(scene, root, `${prefix}-snout`, [0.4, 0.22, 0.15], [0, 0.12, 1.01], detail);
      addFace(scene, root, prefix, 0.32, 0.996, 0.18, dark);
      part(scene, root, `${prefix}-ear-l`, [0.16, 0.18, 0.12], [-0.22, 0.56, 0.72], primary);
      part(scene, root, `${prefix}-ear-r`, [0.16, 0.18, 0.12], [0.22, 0.56, 0.72], primary);
      return fourLegs(scene, root, secondary, prefix, 0.3, 0.32, -0.4, 0.56);
    }
    case 'cow': {
      part(scene, root, `${prefix}-torso`, [0.98, 0.74, 1.2], [0, 0.18, -0.08], primary);
      part(scene, root, `${prefix}-head`, [0.64, 0.62, 0.6], [0, 0.3, 0.74], secondary);
      part(scene, root, `${prefix}-muzzle`, [0.46, 0.24, 0.16], [0, 0.17, 1.05], detail);
      addFace(scene, root, prefix, 0.4, 1.05, 0.18, dark);
      const horn = material(scene, `${prefix}-horn-material`, new Color3(0.86, 0.82, 0.68));
      materials.push(horn);
      part(scene, root, `${prefix}-horn-l`, [0.1, 0.18, 0.1], [-0.27, 0.67, 0.74], horn).rotation.z = -0.35;
      part(scene, root, `${prefix}-horn-r`, [0.1, 0.18, 0.1], [0.27, 0.67, 0.74], horn).rotation.z = 0.35;
      return fourLegs(scene, root, secondary, prefix, 0.33, 0.38, -0.42, 0.62);
    }
    case 'sheep':
      part(scene, root, `${prefix}-torso`, [1.04, 0.84, 1.16], [0, 0.2, -0.08], primary);
      part(scene, root, `${prefix}-head`, [0.52, 0.56, 0.52], [0, 0.22, 0.7], secondary);
      addFace(scene, root, prefix, 0.3, 0.976, 0.15, dark);
      return fourLegs(scene, root, secondary, prefix, 0.3, 0.34, -0.43, 0.58);
  }
}

/**
 * Converts the simple collision body owned by ClassicEntityManager into a
 * synchronous blocky multipart creature. Presentation never depends on an
 * external image finishing its decode, so a mob cannot become a black or
 * head-and-feet-only placeholder while assets are loading.
 */
export class CreatureVisualRuntime {
  readonly #scene: Scene;
  readonly #pending = new Set<Mesh>();
  readonly #models = new Map<Mesh, CreatureModel>();
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
        const materials: StandardMaterial[] = [];
        const animatedLimbs = buildModel(
          this.#scene,
          root,
          kind,
          materials,
          String(body.uniqueId),
        );
        const model: CreatureModel = {
          sourceBody: body,
          root,
          materials,
          animatedLimbs,
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
      for (let index = 0; index < model.animatedLimbs.length; index += 1) {
        const limb = model.animatedLimbs[index];
        if (limb === undefined) continue;
        limb.rotation.x = index % 2 === 0 ? stride : -stride;
      }

      const hurt = body.material?.name.startsWith('hurt-') === true;
      for (const partMaterial of model.materials) {
        partMaterial.emissiveColor = hurt
          ? new Color3(0.42, 0.025, 0.018)
          : partMaterial.diffuseColor.scale(0.12);
      }
    }
  }

  #disposeModel(model: CreatureModel): void {
    model.root.dispose(false, false);
    for (const partMaterial of model.materials) {
      partMaterial.dispose(false, false);
    }
  }
}
