import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  getItemColor,
  getItemDefinition,
  itemToBlock,
  ItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import { BlockType } from '../world/BlockType';
import { getBlockItemColor } from '../world/BlockVisuals';

export interface HeldItemAction {
  readonly breaking: boolean;
  readonly placing: boolean;
  readonly breakProgress: number;
}

type VectorTuple = readonly [number, number, number];

function createMaterial(
  name: string,
  diffuse: Color3,
  scene: Scene,
  emissive: Color3 = diffuse.scale(0.055),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.ambientColor = diffuse.scale(0.58);
  material.emissiveColor = emissive;
  material.specularColor = Color3.Black();
  material.freeze();
  return material;
}

function createBox(
  name: string,
  parent: TransformNode,
  size: VectorTuple,
  position: VectorTuple,
  material: StandardMaterial,
  scene: Scene,
  renderingGroupId: number,
  rotation: VectorTuple = [0, 0, 0],
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderOutline = true;
  mesh.outlineColor = new Color3(0.035, 0.045, 0.04);
  mesh.outlineWidth = 0.018;
  mesh.renderingGroupId = renderingGroupId;
  return mesh;
}

function colorFromTuple(color: readonly [number, number, number]): Color3 {
  return new Color3(color[0], color[1], color[2]);
}

export class HeldItemModel {
  readonly #scene: Scene;
  readonly #thirdPersonRoot: TransformNode;
  readonly #firstPersonRoot: TransformNode;
  readonly #materials = new Map<string, StandardMaterial>();
  readonly #thirdPersonMeshes: Mesh[] = [];
  readonly #firstPersonMeshes: Mesh[] = [];
  #selectedItem: ItemTypeValue | null = null;
  #actionPhase = 0;
  #elapsedSeconds = 0;

  public constructor(scene: Scene, rightHandParent: TransformNode) {
    this.#scene = scene;
    this.#thirdPersonRoot = new TransformNode('third-person-held-item', scene);
    this.#thirdPersonRoot.parent = rightHandParent;
    this.#thirdPersonRoot.position.set(0, -0.77, 0.035);
    this.#thirdPersonRoot.rotation.set(0.18, 0, -0.12);
    this.#thirdPersonRoot.setEnabled(false);
    this.#firstPersonRoot = new TransformNode('first-person-held-item', scene);
    this.#firstPersonRoot.parent = scene.activeCamera;
    this.#firstPersonRoot.position.set(0.48, -0.42, 0.82);
    this.#firstPersonRoot.rotation.set(0.12, -0.38, -0.12);
    this.#firstPersonRoot.setEnabled(false);
  }

  public update(
    player: PlayerState,
    frameSeconds: number,
    item: ItemTypeValue | null,
    action: HeldItemAction,
  ): void {
    if (item !== this.#selectedItem) this.#setItem(item);
    const hasItem = this.#selectedItem !== null;
    this.#thirdPersonRoot.setEnabled(
      hasItem && player.cameraMode === 'third-person',
    );
    this.#firstPersonRoot.setEnabled(
      hasItem && player.cameraMode === 'first-person',
    );
    if (!hasItem) return;

    const seconds = Math.min(Math.max(frameSeconds, 0), 0.1);
    this.#elapsedSeconds += seconds;
    if (action.breaking || action.placing) {
      this.#actionPhase += seconds * (action.breaking ? 15 : 10);
    } else {
      this.#actionPhase = 0;
    }
    const movementAmount =
      player.grounded && !player.paused
        ? Math.min(player.horizontalSpeed / 5.5, 1)
        : 0;
    const walkBob =
      Math.sin(this.#elapsedSeconds * 9) * 0.018 * movementAmount;
    const strike = action.breaking
      ? Math.sin(Math.min(Math.PI, this.#actionPhase % Math.PI))
      : 0;
    const placePush = action.placing
      ? Math.sin(Math.min(Math.PI, this.#actionPhase % Math.PI))
      : 0;
    this.#firstPersonRoot.position.set(
      0.48 + walkBob,
      -0.42 - Math.abs(walkBob) - strike * 0.08,
      0.82 + placePush * 0.12,
    );
    this.#firstPersonRoot.rotation.set(
      0.12 - strike * 0.95 + placePush * 0.16,
      -0.38 + strike * 0.3,
      -0.12 - strike * 0.18,
    );
  }

  public dispose(): void {
    this.#disposeMeshes(this.#thirdPersonMeshes);
    this.#disposeMeshes(this.#firstPersonMeshes);
    this.#thirdPersonRoot.dispose(false, false);
    this.#firstPersonRoot.dispose(false, false);
    for (const material of this.#materials.values()) material.dispose();
    this.#materials.clear();
  }

  #setItem(item: ItemTypeValue | null): void {
    this.#selectedItem = item;
    this.#disposeMeshes(this.#thirdPersonMeshes);
    this.#disposeMeshes(this.#firstPersonMeshes);
    if (item === null) return;
    this.#buildItem(
      item,
      this.#thirdPersonRoot,
      0.72,
      1,
      this.#thirdPersonMeshes,
    );
    this.#buildItem(
      item,
      this.#firstPersonRoot,
      1.08,
      2,
      this.#firstPersonMeshes,
    );
  }

  #buildItem(
    item: ItemTypeValue,
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const block = itemToBlock(item);
    if (block !== null) {
      this.#buildBlock(block, parent, scale, renderingGroupId, output);
      return;
    }

    if (item === ItemType.Bow) {
      this.#buildBow(parent, scale, renderingGroupId, output);
      return;
    }
    if (item === ItemType.Arrow) {
      this.#buildArrow(parent, scale, renderingGroupId, output);
      return;
    }

    const definition = getItemDefinition(item);
    if (definition.kind === 'material' || definition.kind === 'food') {
      this.#buildMaterial(item, parent, scale, renderingGroupId, output);
      return;
    }
    if (definition.kind === 'armor') {
      this.#buildArmor(item, parent, scale, renderingGroupId, output);
      return;
    }
    if (definition.kind !== 'tool' || definition.toolKind === null) {
      this.#buildGenericItem(item, parent, scale, renderingGroupId, output);
      return;
    }

    const head =
      definition.toolTier === 'iron'
        ? this.#getMaterial(
            'held-tool-iron-head',
            new Color3(0.78, 0.81, 0.8),
          )
        : definition.toolTier === 'stone'
          ? this.#getMaterial(
              'held-tool-stone-head',
              new Color3(0.44, 0.47, 0.46),
            )
          : this.#getMaterial(
              'held-tool-wood-head',
              new Color3(0.64, 0.4, 0.19),
            );
    this.#buildTool(
      definition.toolKind,
      parent,
      scale,
      renderingGroupId,
      output,
      head,
    );
  }

  #buildBow(
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const wood = this.#getMaterial('held-bow-wood', new Color3(0.48, 0.29, 0.13));
    const string = this.#getMaterial('held-bow-string', new Color3(0.84, 0.83, 0.76));
    output.push(
      createBox(
        'held-bow-grip',
        parent,
        [0.11 * scale, 0.34 * scale, 0.1 * scale],
        [0, -0.04 * scale, 0],
        wood,
        this.#scene,
        renderingGroupId,
      ),
      createBox(
        'held-bow-upper-limb',
        parent,
        [0.1 * scale, 0.48 * scale, 0.1 * scale],
        [0.13 * scale, 0.34 * scale, 0],
        wood,
        this.#scene,
        renderingGroupId,
        [0, 0, -0.38],
      ),
      createBox(
        'held-bow-lower-limb',
        parent,
        [0.1 * scale, 0.48 * scale, 0.1 * scale],
        [0.13 * scale, -0.42 * scale, 0],
        wood,
        this.#scene,
        renderingGroupId,
        [0, 0, 0.38],
      ),
      createBox(
        'held-bow-string-upper',
        parent,
        [0.035 * scale, 0.62 * scale, 0.035 * scale],
        [0.31 * scale, 0.24 * scale, 0],
        string,
        this.#scene,
        renderingGroupId,
        [0, 0, 0.36],
      ),
      createBox(
        'held-bow-string-lower',
        parent,
        [0.035 * scale, 0.62 * scale, 0.035 * scale],
        [0.31 * scale, -0.34 * scale, 0],
        string,
        this.#scene,
        renderingGroupId,
        [0, 0, -0.36],
      ),
    );
  }

  #buildArrow(
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const shaft = this.#getMaterial('held-arrow-shaft-material', new Color3(0.48, 0.32, 0.16));
    const tip = this.#getMaterial('held-arrow-tip-material', new Color3(0.72, 0.75, 0.74));
    const feather = this.#getMaterial('held-arrow-feather-material', new Color3(0.88, 0.88, 0.82));
    output.push(
      createBox(
        'held-arrow-shaft',
        parent,
        [0.055 * scale, 0.82 * scale, 0.055 * scale],
        [0, -0.02 * scale, 0],
        shaft,
        this.#scene,
        renderingGroupId,
      ),
      createBox(
        'held-arrow-tip',
        parent,
        [0.16 * scale, 0.18 * scale, 0.16 * scale],
        [0, 0.48 * scale, 0],
        tip,
        this.#scene,
        renderingGroupId,
        [0, Math.PI / 4, 0],
      ),
      createBox(
        'held-arrow-feather-a',
        parent,
        [0.2 * scale, 0.2 * scale, 0.035 * scale],
        [0, -0.47 * scale, 0],
        feather,
        this.#scene,
        renderingGroupId,
      ),
      createBox(
        'held-arrow-feather-b',
        parent,
        [0.035 * scale, 0.2 * scale, 0.2 * scale],
        [0, -0.47 * scale, 0],
        feather,
        this.#scene,
        renderingGroupId,
      ),
    );
  }

  #buildArmor(
    item: ItemTypeValue,
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const iron = this.#getMaterial('held-armor-iron', new Color3(0.75, 0.78, 0.78));
    const darkIron = this.#getMaterial('held-armor-shadow', new Color3(0.48, 0.52, 0.52));
    const add = (
      name: string,
      size: VectorTuple,
      position: VectorTuple,
      material = iron,
    ): void => {
      output.push(
        createBox(
          name,
          parent,
          [size[0] * scale, size[1] * scale, size[2] * scale],
          [position[0] * scale, position[1] * scale, position[2] * scale],
          material,
          this.#scene,
          renderingGroupId,
        ),
      );
    };

    if (item === ItemType.IronHelmet) {
      add('held-iron-helmet-top', [0.5, 0.12, 0.42], [0, 0.18, 0]);
      add('held-iron-helmet-left', [0.12, 0.34, 0.42], [-0.19, 0, 0]);
      add('held-iron-helmet-right', [0.12, 0.34, 0.42], [0.19, 0, 0]);
      return;
    }
    if (item === ItemType.IronChestplate) {
      add('held-iron-chestplate-body', [0.5, 0.5, 0.12], [0, 0, 0]);
      add('held-iron-chestplate-shoulder-l', [0.2, 0.18, 0.16], [-0.29, 0.18, 0], darkIron);
      add('held-iron-chestplate-shoulder-r', [0.2, 0.18, 0.16], [0.29, 0.18, 0], darkIron);
      return;
    }
    if (item === ItemType.IronLeggings) {
      add('held-iron-leggings-belt', [0.48, 0.16, 0.12], [0, 0.17, 0]);
      add('held-iron-leggings-left', [0.18, 0.46, 0.12], [-0.14, -0.13, 0]);
      add('held-iron-leggings-right', [0.18, 0.46, 0.12], [0.14, -0.13, 0]);
      return;
    }
    if (item === ItemType.IronBoots) {
      add('held-iron-boots-left', [0.2, 0.3, 0.28], [-0.13, -0.06, 0.05]);
      add('held-iron-boots-right', [0.2, 0.3, 0.28], [0.13, -0.06, 0.05]);
      return;
    }
    this.#buildGenericItem(item, parent, scale, renderingGroupId, output);
  }

  #buildMaterial(
    item: ItemTypeValue,
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    if (item === ItemType.Stick) {
      output.push(
        createBox(
          'held-stick',
          parent,
          [0.09 * scale, 0.72 * scale, 0.09 * scale],
          [0, -0.08 * scale, 0],
          this.#woodMaterial(),
          this.#scene,
          renderingGroupId,
        ),
      );
      return;
    }
    if (item === ItemType.Apple) {
      output.push(
        createBox(
          'held-apple',
          parent,
          [0.34 * scale, 0.34 * scale, 0.34 * scale],
          [0, -0.05 * scale, 0],
          this.#getMaterial('held-apple-red', new Color3(0.72, 0.08, 0.07)),
          this.#scene,
          renderingGroupId,
        ),
        createBox(
          'held-apple-stem',
          parent,
          [0.07 * scale, 0.18 * scale, 0.07 * scale],
          [0, 0.19 * scale, 0],
          this.#getMaterial('held-apple-stem-material', new Color3(0.24, 0.15, 0.05)),
          this.#scene,
          renderingGroupId,
        ),
      );
      return;
    }
    if (item === ItemType.Bone) {
      const bone = this.#getMaterial('held-bone-material', new Color3(0.86, 0.84, 0.73));
      output.push(
        createBox('held-bone-shaft', parent, [0.1 * scale, 0.62 * scale, 0.1 * scale], [0, 0, 0], bone, this.#scene, renderingGroupId, [0, 0, -0.42]),
        createBox('held-bone-end-a', parent, [0.2 * scale, 0.13 * scale, 0.13 * scale], [-0.13 * scale, 0.29 * scale, 0], bone, this.#scene, renderingGroupId, [0, 0, -0.42]),
        createBox('held-bone-end-b', parent, [0.2 * scale, 0.13 * scale, 0.13 * scale], [0.13 * scale, -0.29 * scale, 0], bone, this.#scene, renderingGroupId, [0, 0, -0.42]),
      );
      return;
    }
    if (item === ItemType.Feather) {
      const feather = this.#getMaterial('held-feather-material', new Color3(0.93, 0.93, 0.88));
      const shaft = this.#getMaterial('held-feather-shaft', new Color3(0.7, 0.66, 0.52));
      output.push(
        createBox('held-feather-shaft-mesh', parent, [0.045 * scale, 0.72 * scale, 0.045 * scale], [0, -0.04 * scale, 0], shaft, this.#scene, renderingGroupId, [0, 0, -0.28]),
        createBox('held-feather-vane', parent, [0.3 * scale, 0.5 * scale, 0.045 * scale], [0.08 * scale, 0.08 * scale, 0], feather, this.#scene, renderingGroupId, [0, 0, -0.28]),
      );
      return;
    }
    if (item === ItemType.String) {
      const thread = this.#getMaterial('held-string-material', new Color3(0.82, 0.82, 0.78));
      output.push(
        createBox('held-string-a', parent, [0.035 * scale, 0.66 * scale, 0.035 * scale], [-0.08 * scale, -0.02 * scale, 0], thread, this.#scene, renderingGroupId, [0, 0, -0.55]),
        createBox('held-string-b', parent, [0.035 * scale, 0.66 * scale, 0.035 * scale], [0.08 * scale, -0.02 * scale, 0], thread, this.#scene, renderingGroupId, [0, 0, 0.55]),
      );
      return;
    }
    if (item === ItemType.Tnt) {
      const red = this.#getMaterial('held-tnt-red', new Color3(0.75, 0.11, 0.08));
      const band = this.#getMaterial('held-tnt-band', new Color3(0.85, 0.82, 0.68));
      output.push(
        createBox('held-tnt', parent, [0.42 * scale, 0.42 * scale, 0.42 * scale], [0, -0.04 * scale, 0], red, this.#scene, renderingGroupId),
        createBox('held-tnt-band', parent, [0.43 * scale, 0.13 * scale, 0.43 * scale], [0, -0.04 * scale, 0], band, this.#scene, renderingGroupId),
      );
      return;
    }
    if (item === ItemType.RawPorkchop || item === ItemType.RawBeef) {
      const color = item === ItemType.RawPorkchop
        ? new Color3(0.76, 0.37, 0.4)
        : new Color3(0.58, 0.18, 0.17);
      output.push(
        createBox(
          `held-${item}`,
          parent,
          [0.42 * scale, 0.12 * scale, 0.3 * scale],
          [0, -0.04 * scale, 0],
          this.#getMaterial(`held-meat-${item}`, color),
          this.#scene,
          renderingGroupId,
          [0.08, 0.2, -0.18],
        ),
      );
      return;
    }
    if (item === ItemType.IronIngot) {
      output.push(
        createBox(
          'held-iron-ingot',
          parent,
          [0.42 * scale, 0.15 * scale, 0.24 * scale],
          [0, -0.05 * scale, 0],
          this.#getMaterial('held-iron-ingot-material', new Color3(0.77, 0.79, 0.77)),
          this.#scene,
          renderingGroupId,
        ),
      );
      return;
    }

    this.#buildGenericItem(item, parent, scale, renderingGroupId, output);
  }

  #buildGenericItem(
    item: ItemTypeValue,
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const color = colorFromTuple(getItemColor(item));
    output.push(
      createBox(
        `held-${item}`,
        parent,
        [0.31 * scale, 0.25 * scale, 0.16 * scale],
        [0, -0.05 * scale, 0],
        this.#getMaterial(`held-material-${item}`, color),
        this.#scene,
        renderingGroupId,
        [0.08, 0.24, -0.14],
      ),
    );
  }

  #buildBlock(
    block: BlockType,
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const size = 0.34 * scale;
    const baseColor = colorFromTuple(getBlockItemColor(block));
    output.push(
      createBox(
        'held-block-body',
        parent,
        [size, size, size],
        [0, -0.05 * scale, 0],
        this.#getMaterial(
          `held-block-${String(block)}`,
          baseColor,
          block === BlockType.RuneStone
            ? new Color3(0.025, 0.11, 0.07)
            : baseColor.scale(0.045),
        ),
        this.#scene,
        renderingGroupId,
      ),
    );
    if (block === BlockType.Grass) {
      output.push(
        createBox(
          'held-grass-cap',
          parent,
          [size * 1.015, size * 0.12, size * 1.015],
          [0, size * 0.46, 0],
          this.#getMaterial(
            'held-grass-cap-material',
            new Color3(0.4, 0.68, 0.25),
          ),
          this.#scene,
          renderingGroupId,
        ),
      );
    } else if (block === BlockType.OakLog) {
      output.push(
        createBox(
          'held-log-cap',
          parent,
          [size * 1.02, size * 0.08, size * 1.02],
          [0, size * 0.48, 0],
          this.#getMaterial(
            'held-log-ring',
            new Color3(0.66, 0.46, 0.24),
          ),
          this.#scene,
          renderingGroupId,
        ),
      );
    } else if (block === BlockType.RuneStone) {
      output.push(
        createBox(
          'held-rune-vertical',
          parent,
          [size * 0.12, size * 0.7, size * 1.03],
          [0, -0.05 * scale, 0],
          this.#getMaterial(
            'held-rune-accent',
            new Color3(0.15, 0.72, 0.4),
            new Color3(0.04, 0.28, 0.14),
          ),
          this.#scene,
          renderingGroupId,
        ),
      );
    }
  }

  #buildTool(
    kind: 'pickaxe' | 'shovel' | 'axe',
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
    head: StandardMaterial,
  ): void {
    output.push(
      createBox(
        `held-${kind}-handle`,
        parent,
        [0.1 * scale, 0.72 * scale, 0.1 * scale],
        [0, -0.13 * scale, 0],
        this.#woodMaterial(),
        this.#scene,
        renderingGroupId,
      ),
    );
    if (kind === 'pickaxe') {
      output.push(
        createBox(
          'held-pickaxe-head',
          parent,
          [0.62 * scale, 0.13 * scale, 0.14 * scale],
          [0, 0.26 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
        createBox(
          'held-pickaxe-left-tip',
          parent,
          [0.12 * scale, 0.22 * scale, 0.14 * scale],
          [-0.27 * scale, 0.18 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
        createBox(
          'held-pickaxe-right-tip',
          parent,
          [0.12 * scale, 0.22 * scale, 0.14 * scale],
          [0.27 * scale, 0.18 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
      );
    } else if (kind === 'shovel') {
      output.push(
        createBox(
          'held-shovel-blade',
          parent,
          [0.34 * scale, 0.32 * scale, 0.12 * scale],
          [0, 0.27 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
      );
    } else {
      output.push(
        createBox(
          'held-axe-head',
          parent,
          [0.38 * scale, 0.33 * scale, 0.14 * scale],
          [0.13 * scale, 0.22 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
        createBox(
          'held-axe-edge',
          parent,
          [0.13 * scale, 0.46 * scale, 0.15 * scale],
          [0.29 * scale, 0.18 * scale, 0],
          head,
          this.#scene,
          renderingGroupId,
        ),
      );
    }
  }

  #woodMaterial(): StandardMaterial {
    return this.#getMaterial(
      'held-tool-handle',
      new Color3(0.48, 0.29, 0.13),
    );
  }

  #getMaterial(
    key: string,
    diffuse: Color3,
    emissive: Color3 = diffuse.scale(0.055),
  ): StandardMaterial {
    const existing = this.#materials.get(key);
    if (existing !== undefined) return existing;
    const material = createMaterial(key, diffuse, this.#scene, emissive);
    this.#materials.set(key, material);
    return material;
  }

  #disposeMeshes(meshes: Mesh[]): void {
    for (const mesh of meshes) mesh.dispose(false, false);
    meshes.length = 0;
  }
}
