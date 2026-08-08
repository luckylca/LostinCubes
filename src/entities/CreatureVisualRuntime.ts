import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, Vector3 } from '@babylonjs/core';
import type { EntityKind } from './EntityRegistry';

type CreatureKind = Exclude<EntityKind, 'arrow' | 'tnt' | 'dropped-item'>;
type MaterialRole = 'primary' | 'secondary' | 'detail' | 'dark';

interface CreatureModel {
  readonly sourceBody: Mesh;
  readonly root: TransformNode;
  readonly previousPosition: Vector3;
  correctionX: number;
  correctionZ: number;
  hitElapsed: number;
  wasHurt: boolean;
}

interface CreaturePalette {
  readonly primary: Color3;
  readonly secondary: Color3;
  readonly detail: Color3;
  readonly dark: Color3;
}

interface ModelGroups {
  readonly primary: Mesh[];
  readonly secondary: Mesh[];
  readonly detail: Mesh[];
  readonly dark: Mesh[];
}

const CREATURE_KINDS = [
  'zombie',
  'skeleton',
  'spider',
  'creeper',
  'cow',
  'pig',
  'sheep',
] as const satisfies readonly CreatureKind[];
const MATERIAL_ROLES = [
  'primary',
  'secondary',
  'detail',
  'dark',
] as const satisfies readonly MaterialRole[];
const BODY_PATTERN = /^body-(?<kind>zombie|skeleton|spider|creeper|cow|pig|sheep)-/;
const HIT_PRESENTATION_SECONDS = 0.24;
const HIT_LIFT = 0.34;

const PALETTES: Readonly<Record<CreatureKind, CreaturePalette>> = {
  zombie: {
    primary: new Color3(0.27, 0.52, 0.3),
    secondary: new Color3(0.12, 0.43, 0.43),
    detail: new Color3(0.18, 0.27, 0.43),
    dark: new Color3(0.05, 0.08, 0.055),
  },
  skeleton: {
    primary: new Color3(0.84, 0.83, 0.75),
    secondary: new Color3(0.64, 0.62, 0.54),
    detail: new Color3(0.47, 0.28, 0.11),
    dark: new Color3(0.045, 0.045, 0.04),
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

function createMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  result.ambientColor = color.scale(0.7);
  result.emissiveColor = color.scale(0.08);
  result.specularColor = Color3.Black();
  result.freeze();
  return result;
}

function emptyGroups(): ModelGroups {
  return { primary: [], secondary: [], detail: [], dark: [] };
}

function addBox(
  scene: Scene,
  groups: ModelGroups,
  role: MaterialRole,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): void {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.isPickable = false;
  groups[role].push(mesh);
}

function addFace(
  scene: Scene,
  groups: ModelGroups,
  prefix: string,
  y: number,
  z: number,
  spacing: number,
  mouthWidth = 0.22,
): void {
  const faceZ = z + 0.035;
  addBox(scene, groups, 'dark', `${prefix}-eye-l`, [0.12, 0.12, 0.055], [-spacing, y, faceZ]);
  addBox(scene, groups, 'dark', `${prefix}-eye-r`, [0.12, 0.12, 0.055], [spacing, y, faceZ]);
  addBox(scene, groups, 'dark', `${prefix}-mouth`, [mouthWidth, 0.075, 0.055], [0, y - 0.17, faceZ]);
}

function addFourLegs(
  scene: Scene,
  groups: ModelGroups,
  prefix: string,
  role: MaterialRole,
  x: number,
  z: number,
  y: number,
  height: number,
): void {
  addBox(scene, groups, role, `${prefix}-leg-fl`, [0.22, height, 0.22], [-x, y, z]);
  addBox(scene, groups, role, `${prefix}-leg-fr`, [0.22, height, 0.22], [x, y, z]);
  addBox(scene, groups, role, `${prefix}-leg-bl`, [0.22, height, 0.22], [-x, y, -z]);
  addBox(scene, groups, role, `${prefix}-leg-br`, [0.22, height, 0.22], [x, y, -z]);
}

function buildHumanoid(
  scene: Scene,
  groups: ModelGroups,
  prefix: string,
  skeleton: boolean,
): void {
  const limb = skeleton ? 0.14 : 0.22;
  const torsoWidth = skeleton ? 0.4 : 0.54;
  const torsoDepth = skeleton ? 0.22 : 0.3;
  addBox(scene, groups, 'primary', `${prefix}-head`, [0.5, 0.5, 0.5], [0, 0.7, 0]);
  addBox(scene, groups, skeleton ? 'primary' : 'secondary', `${prefix}-torso`, [torsoWidth, 0.72, torsoDepth], [0, 0.08, 0]);
  addFace(scene, groups, prefix, 0.75, 0.25, 0.12, skeleton ? 0.26 : 0.22);
  if (skeleton) {
    addBox(scene, groups, 'dark', `${prefix}-nose`, [0.075, 0.1, 0.055], [0, 0.65, 0.29]);
  }
  addBox(scene, groups, skeleton ? 'primary' : 'secondary', `${prefix}-arm-l`, [limb, 0.72, limb], [-0.39, 0.05, 0]);
  addBox(scene, groups, skeleton ? 'primary' : 'secondary', `${prefix}-arm-r`, [limb, 0.72, limb], [0.39, 0.05, 0]);
  addBox(scene, groups, skeleton ? 'secondary' : 'detail', `${prefix}-leg-l`, [limb + 0.02, 0.72, limb + 0.02], [-0.14, -0.62, 0]);
  addBox(scene, groups, skeleton ? 'secondary' : 'detail', `${prefix}-leg-r`, [limb + 0.02, 0.72, limb + 0.02], [0.14, -0.62, 0]);
}

function buildSkeletonBow(scene: Scene, groups: ModelGroups, prefix: string): void {
  addBox(scene, groups, 'detail', `${prefix}-bow-upper`, [0.08, 0.55, 0.08], [0.53, 0.3, 0.18], [0, 0, -0.28]);
  addBox(scene, groups, 'detail', `${prefix}-bow-lower`, [0.08, 0.55, 0.08], [0.53, -0.19, 0.18], [0, 0, 0.28]);
  addBox(scene, groups, 'detail', `${prefix}-bow-grip`, [0.1, 0.18, 0.1], [0.46, 0.05, 0.18]);
  addBox(scene, groups, 'dark', `${prefix}-bow-string`, [0.024, 1.02, 0.024], [0.64, 0.05, 0.18]);
  addBox(scene, groups, 'detail', `${prefix}-held-arrow-shaft`, [0.035, 0.035, 0.72], [0.2, 0.08, 0.38]);
  addBox(scene, groups, 'secondary', `${prefix}-held-arrow-head`, [0.11, 0.11, 0.13], [0.2, 0.08, 0.77], [0, 0, Math.PI / 4]);
}

function buildParts(scene: Scene, kind: CreatureKind, suffix: string): ModelGroups {
  const groups = emptyGroups();
  const prefix = `${kind}-${suffix}`;
  switch (kind) {
    case 'zombie':
      buildHumanoid(scene, groups, prefix, false);
      break;
    case 'skeleton':
      buildHumanoid(scene, groups, prefix, true);
      buildSkeletonBow(scene, groups, prefix);
      break;
    case 'creeper':
      addBox(scene, groups, 'primary', `${prefix}-head`, [0.6, 0.6, 0.6], [0, 0.65, 0.03]);
      addBox(scene, groups, 'secondary', `${prefix}-torso`, [0.5, 0.82, 0.36], [0, 0.05, 0]);
      addFace(scene, groups, prefix, 0.7, 0.33, 0.13, 0.25);
      addFourLegs(scene, groups, prefix, 'primary', 0.17, 0.16, -0.52, 0.44);
      break;
    case 'spider':
      addBox(scene, groups, 'secondary', `${prefix}-head`, [0.58, 0.4, 0.52], [0, 0.02, 0.46]);
      addBox(scene, groups, 'primary', `${prefix}-torso`, [0.84, 0.48, 0.76], [0, 0.02, -0.18]);
      for (const x of [-0.18, -0.06, 0.06, 0.18]) {
        addBox(scene, groups, 'detail', `${prefix}-eye-${String(x)}`, [0.075, 0.07, 0.04], [x, 0.08, 0.745]);
      }
      for (const side of [-1, 1] as const) {
        for (let index = 0; index < 4; index += 1) {
          addBox(scene, groups, 'dark', `${prefix}-leg-${String(side)}-${String(index)}`, [0.7, 0.1, 0.1], [side * 0.67, -0.05, 0.34 - index * 0.24], [0, side * (0.18 + index * 0.05), side * -0.18]);
        }
      }
      break;
    case 'pig':
      addBox(scene, groups, 'primary', `${prefix}-torso`, [0.92, 0.66, 1.08], [0, 0.13, -0.08]);
      addBox(scene, groups, 'secondary', `${prefix}-head`, [0.64, 0.6, 0.62], [0, 0.22, 0.67]);
      addBox(scene, groups, 'detail', `${prefix}-snout`, [0.4, 0.22, 0.15], [0, 0.12, 1.01]);
      addFace(scene, groups, prefix, 0.32, 0.98, 0.18);
      addFourLegs(scene, groups, prefix, 'secondary', 0.3, 0.32, -0.4, 0.56);
      break;
    case 'cow':
      addBox(scene, groups, 'primary', `${prefix}-torso`, [0.98, 0.74, 1.2], [0, 0.18, -0.08]);
      addBox(scene, groups, 'secondary', `${prefix}-head`, [0.64, 0.62, 0.6], [0, 0.3, 0.74]);
      addBox(scene, groups, 'detail', `${prefix}-muzzle`, [0.46, 0.24, 0.16], [0, 0.17, 1.05]);
      addFace(scene, groups, prefix, 0.4, 1.02, 0.18);
      addBox(scene, groups, 'detail', `${prefix}-horn-l`, [0.1, 0.18, 0.1], [-0.27, 0.67, 0.74], [0, 0, -0.35]);
      addBox(scene, groups, 'detail', `${prefix}-horn-r`, [0.1, 0.18, 0.1], [0.27, 0.67, 0.74], [0, 0, 0.35]);
      addFourLegs(scene, groups, prefix, 'secondary', 0.33, 0.38, -0.42, 0.62);
      break;
    case 'sheep':
      addBox(scene, groups, 'primary', `${prefix}-torso`, [1.04, 0.84, 1.16], [0, 0.2, -0.08]);
      addBox(scene, groups, 'secondary', `${prefix}-head`, [0.52, 0.56, 0.52], [0, 0.22, 0.7]);
      addFace(scene, groups, prefix, 0.3, 0.95, 0.15);
      addFourLegs(scene, groups, prefix, 'secondary', 0.3, 0.34, -0.43, 0.58);
      break;
  }
  return groups;
}

function mergeTemplateGroup(
  parts: Mesh[],
  name: string,
  material: StandardMaterial,
): Mesh | null {
  if (parts.length === 0) return null;
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (merged === null) return null;
  merged.name = name;
  merged.material = material;
  merged.isPickable = false;
  merged.isVisible = false;
  return merged;
}

export class CreatureVisualRuntime {
  readonly #scene: Scene;
  readonly #pending = new Set<Mesh>();
  readonly #models = new Map<Mesh, CreatureModel>();
  readonly #materials = new Map<string, StandardMaterial>();
  readonly #templates = new Map<CreatureKind, Map<MaterialRole, Mesh>>();
  readonly #meshObserver: Observer<AbstractMesh>;
  readonly #frameObserver: Observer<Scene>;

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#meshObserver = scene.onNewMeshAddedObservable.add((mesh) => this.#queue(mesh));
    for (const kind of CREATURE_KINDS) {
      this.#templates.set(kind, this.#buildTemplate(kind));
    }
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
    for (const model of this.#models.values()) model.root.dispose(false, false);
    this.#models.clear();
    for (const templates of this.#templates.values()) {
      for (const template of templates.values()) template.dispose(false, false);
    }
    this.#templates.clear();
    for (const sharedMaterial of this.#materials.values()) {
      sharedMaterial.dispose(false, false);
    }
    this.#materials.clear();
  }

  #queue(abstractMesh: AbstractMesh): void {
    if (!(abstractMesh instanceof Mesh)) return;
    const match = BODY_PATTERN.exec(abstractMesh.name);
    const kind = match?.groups?.kind;
    if (kind === undefined || !isCreatureKind(kind)) return;
    if (this.#models.has(abstractMesh) || this.#pending.has(abstractMesh)) return;
    this.#pending.add(abstractMesh);
  }

  #material(kind: CreatureKind, role: MaterialRole): StandardMaterial {
    const key = `${kind}:${role}`;
    const existing = this.#materials.get(key);
    if (existing !== undefined) return existing;
    const created = createMaterial(
      this.#scene,
      `creature-${key}`,
      PALETTES[kind][role],
    );
    this.#materials.set(key, created);
    return created;
  }

  #buildTemplate(kind: CreatureKind): Map<MaterialRole, Mesh> {
    const templates = new Map<MaterialRole, Mesh>();
    const groups = buildParts(this.#scene, kind, 'template');
    for (const role of MATERIAL_ROLES) {
      const merged = mergeTemplateGroup(
        groups[role],
        `creature-template-${kind}-${role}`,
        this.#material(kind, role),
      );
      if (merged !== null) templates.set(role, merged);
    }
    return templates;
  }

  #cloneTemplate(kind: CreatureKind, root: TransformNode, bodyName: string): void {
    const templates = this.#templates.get(kind);
    if (templates === undefined) return;
    for (const [role, template] of templates) {
      const clone = template.clone(`${bodyName}-${role}`, root);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scaling.set(1, 1, 1);
      clone.material = template.material;
      clone.isPickable = false;
      clone.isVisible = true;
    }
  }

  #flushPending(): void {
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
        this.#cloneTemplate(kind, root, body.name);
        this.#models.set(body, {
          sourceBody: body,
          root,
          previousPosition: parent.getAbsolutePosition().clone(),
          correctionX: 0,
          correctionZ: 0,
          hitElapsed: HIT_PRESENTATION_SECONDS,
          wasHurt: false,
        });
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
    const seconds = Math.min(this.#scene.getEngine().getDeltaTime() / 1000, 0.05);
    for (const [body, model] of this.#models) {
      if (body.isDisposed()) {
        model.root.dispose(false, false);
        this.#models.delete(body);
        continue;
      }
      const parent = body.parent;
      if (!(parent instanceof TransformNode)) continue;
      const position = parent.getAbsolutePosition();
      const deltaX = position.x - model.previousPosition.x;
      const deltaZ = position.z - model.previousPosition.z;
      const travel = Math.hypot(deltaX, deltaZ);
      const hurt = body.material?.name.startsWith('hurt-') === true;
      if (hurt && !model.wasHurt) {
        if (travel > 0.03) {
          model.correctionX = -deltaX;
          model.correctionZ = -deltaZ;
        }
        model.hitElapsed = 0;
      }
      model.wasHurt = hurt;
      model.previousPosition.copyFrom(position);
      if (model.hitElapsed < HIT_PRESENTATION_SECONDS) {
        model.hitElapsed = Math.min(
          model.hitElapsed + seconds,
          HIT_PRESENTATION_SECONDS,
        );
        const progress = model.hitElapsed / HIT_PRESENTATION_SECONDS;
        const horizontalRemaining = (1 - progress) ** 3;
        model.root.position.set(
          model.correctionX * horizontalRemaining,
          Math.sin(progress * Math.PI) * HIT_LIFT,
          model.correctionZ * horizontalRemaining,
        );
      } else if (
        model.root.position.x !== 0 ||
        model.root.position.y !== 0 ||
        model.root.position.z !== 0
      ) {
        model.root.position.set(0, 0, 0);
        model.correctionX = 0;
        model.correctionZ = 0;
      }
    }
  }
}
