import {
  Color3,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import type { Mesh, Ray, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { raycastVoxels } from './VoxelRaycast';
import type { VoxelRaycastHit } from './VoxelRaycast';
import type { VoxelWorldData } from './VoxelWorldData';

const INTERACTION_DISTANCE = 6;
const PLAYER_RADIUS = 0.42;
const PLAYER_HALF_HEIGHT = 0.9;

function blockIntersectsPlayer(
  worldX: number,
  worldY: number,
  worldZ: number,
  player: PlayerState,
): boolean {
  const horizontalOverlap =
    Math.abs(player.position.x - worldX) < 0.5 + PLAYER_RADIUS &&
    Math.abs(player.position.z - worldZ) < 0.5 + PLAYER_RADIUS;
  const verticalOverlap =
    player.position.y + PLAYER_HALF_HEIGHT > worldY - 0.5 &&
    player.position.y - PLAYER_HALF_HEIGHT < worldY + 0.5;
  return horizontalOverlap && verticalOverlap;
}

export class VoxelInteractionController {
  readonly #world: VoxelWorldData;
  readonly #highlight: Mesh;
  readonly #onBlockChanged: (
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => void;
  #target: VoxelRaycastHit | null = null;
  #selectedBlock: BlockTypeValue = BlockType.Dirt;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    onBlockChanged: (
      worldX: number,
      worldY: number,
      worldZ: number,
    ) => void,
  ) {
    this.#world = world;
    this.#onBlockChanged = onBlockChanged;

    const material = new StandardMaterial('voxel-target-material', scene);
    material.diffuseColor = new Color3(0.95, 0.86, 0.25);
    material.emissiveColor = new Color3(0.42, 0.32, 0.04);
    material.alpha = 0.72;
    material.wireframe = true;
    material.disableLighting = true;

    this.#highlight = MeshBuilder.CreateBox(
      'voxel-target-highlight',
      { size: 1.035 },
      scene,
    );
    this.#highlight.material = material;
    this.#highlight.isPickable = false;
    this.#highlight.renderingGroupId = 1;
    this.#highlight.setEnabled(false);
  }

  public update(ray: Ray): void {
    this.#target = raycastVoxels(
      { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      INTERACTION_DISTANCE,
      (worldX, worldY, worldZ) =>
        this.#world.sampleBlock(worldX, worldY, worldZ),
    );

    if (this.#target === null) {
      this.#highlight.setEnabled(false);
      return;
    }

    const { block } = this.#target;
    this.#highlight.position.set(block.x, block.y, block.z);
    this.#highlight.setEnabled(true);
  }

  public breakTarget(): boolean {
    if (this.#target === null || this.#target.block.y <= 0) {
      return false;
    }
    const { x, y, z } = this.#target.block;
    if (!this.#world.setBlock(x, y, z, BlockType.Air)) {
      return false;
    }
    this.#onBlockChanged(x, y, z);
    this.#target = null;
    this.#highlight.setEnabled(false);
    return true;
  }

  public placeTarget(player: PlayerState): boolean {
    if (this.#target === null) {
      return false;
    }
    const { x, y, z } = this.#target.adjacent;
    if (
      this.#world.sampleBlock(x, y, z) !== BlockType.Air ||
      blockIntersectsPlayer(x, y, z, player)
    ) {
      return false;
    }
    if (!this.#world.setBlock(x, y, z, this.#selectedBlock)) {
      return false;
    }
    this.#onBlockChanged(x, y, z);
    return true;
  }

  public setSelectedBlock(block: BlockTypeValue): void {
    if (block !== BlockType.Air) {
      this.#selectedBlock = block;
    }
  }

  public get selectedBlock(): BlockTypeValue {
    return this.#selectedBlock;
  }

  public dispose(): void {
    this.#highlight.material?.dispose();
    this.#highlight.dispose(false, false);
  }
}
