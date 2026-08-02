import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import {
  itemToBlock,
  ItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import { BlockType } from '../world/BlockType';
import { getBlockItemColor } from '../world/BlockVisuals';
import type { PlayerState } from '../game/session/GameSession';

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
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.ambientColor = diffuse.scale(0.45);
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
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(...position);
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

/**
 * Shared held-item presentation for the third-person right hand and a compact
 * first-person view model. Item geometry is rebuilt only when selection changes.
 */
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
    if (item !== this.#selectedItem) {
      this.#setItem(item);
    }

    const hasItem = this.#selectedItem !== null;
    this.#thirdPersonRoot.setEnabled(
      hasItem && player.cameraMode === 'third-person',
    );
    this.#firstPersonRoot.setEnabled(
      hasItem && player.cameraMode === 'first-person',
    );
    if (!hasItem) {
      return;
    }

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
    const walkBob = Math.sin(this.#elapsedSeconds * 9) * 0.018 * movementAmount;
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
    for (const material of this.#materials.values()) {
      material.dispose();
    }
    this.#materials.clear();
  }

  #setItem(item: ItemTypeValue | null): void {
    this.#selectedItem = item;
    this.#disposeMeshes(this.#thirdPersonMeshes);
    this.#disposeMeshes(this.#firstPersonMeshes);
    if (item === null) {
      return;
    }

    this.#buildItem(item, this.#thirdPersonRoot, 0.72, 1, this.#thirdPersonMeshes);
    this.#buildItem(item, this.#firstPersonRoot, 1.08, 2, this.#firstPersonMeshes);
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
      this.#buildBlock(
        block,
        parent,
        scale,
        renderingGroupId,
        output,
      );
      return;
    }

    if (item === ItemType.WoodenPickaxe) {
      this.#buildPickaxe(parent, scale, renderingGroupId, output);
    } else if (item === ItemType.WoodenShovel) {
      this.#buildShovel(parent, scale, renderingGroupId, output);
    }
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
    const baseMaterial = this.#getMaterial(
      `held-block-${String(block)}`,
      baseColor,
      block === BlockType.RuneStone
        ? new Color3(0.025, 0.11, 0.07)
        : Color3.Black(),
    );
    output.push(
      createBox(
        'held-block-body',
        parent,
        [size, size, size],
        [0, -0.05 * scale, 0],
        baseMaterial,
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
    } else if (block === BlockType.RuneStone) {
      const runeMaterial = this.#getMaterial(
        'held-rune-accent',
        new Color3(0.15, 0.72, 0.4),
        new Color3(0.04, 0.28, 0.14),
      );
      output.push(
        createBox(
          'held-rune-vertical',
          parent,
          [size * 0.12, size * 0.7, size * 1.03],
          [0, -0.05 * scale, 0],
          runeMaterial,
          this.#scene,
          renderingGroupId,
        ),
        createBox(
          'held-rune-horizontal',
          parent,
          [size * 0.7, size * 0.12, size * 1.035],
          [0, -0.05 * scale, 0],
          runeMaterial,
          this.#scene,
          renderingGroupId,
        ),
      );
    }
  }

  #buildPickaxe(
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const wood = this.#getMaterial(
      'held-tool-wood',
      new Color3(0.48, 0.29, 0.13),
    );
    const head = this.#getMaterial(
      'held-tool-stone',
      new Color3(0.42, 0.45, 0.44),
    );
    output.push(
      createBox(
        'held-pickaxe-handle',
        parent,
        [0.1 * scale, 0.72 * scale, 0.1 * scale],
        [0, -0.12 * scale, 0],
        wood,
        this.#scene,
        renderingGroupId,
      ),
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
  }

  #buildShovel(
    parent: TransformNode,
    scale: number,
    renderingGroupId: number,
    output: Mesh[],
  ): void {
    const wood = this.#getMaterial(
      'held-tool-wood',
      new Color3(0.48, 0.29, 0.13),
    );
    const head = this.#getMaterial(
      'held-tool-stone',
      new Color3(0.42, 0.45, 0.44),
    );
    output.push(
      createBox(
        'held-shovel-handle',
        parent,
        [0.1 * scale, 0.72 * scale, 0.1 * scale],
        [0, -0.13 * scale, 0],
        wood,
        this.#scene,
        renderingGroupId,
      ),
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
  }

  #getMaterial(
    key: string,
    diffuse: Color3,
    emissive = Color3.Black(),
  ): StandardMaterial {
    const existing = this.#materials.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const material = createMaterial(key, diffuse, this.#scene, emissive);
    this.#materials.set(key, material);
    return material;
  }

  #disposeMeshes(meshes: Mesh[]): void {
    for (const mesh of meshes) {
      mesh.dispose(false, false);
    }
    meshes.length = 0;
  }
}
