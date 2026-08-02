import {
  Color3,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  PLAYER_COLLISION_HALF_HEIGHT,
  PLAYER_COLLISION_RADIUS,
} from '../player/KinematicPlayerMotor';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
  PLAYER_BLOCK_REACH,
} from '../player/PlayerView';
import { BlockInteractionState } from './BlockInteractionState';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { raycastVoxels } from './VoxelRaycast';
import type { VoxelRaycastHit } from './VoxelRaycast';
import type { VoxelWorldData } from './VoxelWorldData';

export interface VoxelInteractionCallbacks {
  readonly onBlockChanged: (
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => void;
  readonly onBlockBroken: (block: BlockTypeValue) => void;
  readonly canPlaceBlock: (block: BlockTypeValue) => boolean;
  readonly onBlockPlaced: (block: BlockTypeValue) => void;
}

export interface InteractionTargetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function blockIntersectsPlayer(
  worldX: number,
  worldY: number,
  worldZ: number,
  player: PlayerState,
): boolean {
  const horizontalOverlap =
    Math.abs(player.position.x - worldX) < 0.5 + PLAYER_COLLISION_RADIUS &&
    Math.abs(player.position.z - worldZ) < 0.5 + PLAYER_COLLISION_RADIUS;
  const verticalOverlap =
    player.position.y + PLAYER_COLLISION_HALF_HEIGHT > worldY - 0.5 &&
    player.position.y - PLAYER_COLLISION_HALF_HEIGHT < worldY + 0.5;
  return horizontalOverlap && verticalOverlap;
}

function createTargetKey(hit: VoxelRaycastHit): string {
  const { x, y, z } = hit.block;
  return `${String(x)},${String(y)},${String(z)}`;
}

export class VoxelInteractionController {
  readonly #world: VoxelWorldData;
  readonly #highlight: Mesh;
  readonly #highlightMaterial: StandardMaterial;
  readonly #timing = new BlockInteractionState();
  readonly #callbacks: VoxelInteractionCallbacks;
  #target: VoxelRaycastHit | null = null;
  #targetPoint: InteractionTargetPoint | null = null;
  #selectedBlock: BlockTypeValue = BlockType.Air;
  #breakProgress = 0;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    callbacks: VoxelInteractionCallbacks,
  ) {
    this.#world = world;
    this.#callbacks = callbacks;

    this.#highlightMaterial = new StandardMaterial(
      'voxel-target-material',
      scene,
    );
    this.#highlightMaterial.diffuseColor = new Color3(0.95, 0.86, 0.25);
    this.#highlightMaterial.emissiveColor = new Color3(0.42, 0.32, 0.04);
    this.#highlightMaterial.alpha = 0.72;
    this.#highlightMaterial.wireframe = true;
    this.#highlightMaterial.disableLighting = true;

    this.#highlight = MeshBuilder.CreateBox(
      'voxel-target-highlight',
      { size: 1.035 },
      scene,
    );
    this.#highlight.material = this.#highlightMaterial;
    this.#highlight.isPickable = false;
    this.#highlight.renderingGroupId = 1;
    this.#highlight.setEnabled(false);
  }

  public update(
    player: PlayerState,
    frameSeconds: number,
    breakHeld: boolean,
    placeHeld: boolean,
  ): void {
    this.#updateTarget(player);

    const targetBlock =
      this.#target === null
        ? BlockType.Air
        : this.#world.sampleBlock(
            this.#target.block.x,
            this.#target.block.y,
            this.#target.block.z,
          );
    const timing = this.#timing.update({
      targetKey: this.#target === null ? null : createTargetKey(this.#target),
      targetBlock,
      canBreakTarget: this.#target !== null && this.#target.block.y > 0,
      breakHeld,
      placeHeld: placeHeld && this.#selectedBlock !== BlockType.Air,
      frameSeconds,
    });
    this.#breakProgress = timing.breakProgress;
    this.#updateHighlightPresentation();

    if (timing.breakNow) {
      this.#breakTarget();
    } else if (timing.placeNow) {
      this.#placeTarget(player);
    }
  }

  public setSelectedBlock(block: BlockTypeValue | null): void {
    this.#selectedBlock = block ?? BlockType.Air;
  }

  public get selectedBlock(): BlockTypeValue {
    return this.#selectedBlock;
  }

  public get breakProgress(): number {
    return this.#breakProgress;
  }

  public get targetPoint(): InteractionTargetPoint | null {
    return this.#targetPoint;
  }

  public get hasTarget(): boolean {
    return this.#target !== null;
  }

  public dispose(): void {
    this.#highlightMaterial.dispose();
    this.#highlight.dispose(false, false);
  }

  #updateTarget(player: PlayerState): void {
    const eye = getPlayerEyePosition(player);
    const direction = getPlayerViewDirection(player);
    this.#target = raycastVoxels(
      eye,
      direction,
      PLAYER_BLOCK_REACH,
      (worldX, worldY, worldZ) =>
        this.#world.sampleBlock(worldX, worldY, worldZ),
    );

    if (this.#target === null) {
      this.#targetPoint = null;
      this.#highlight.setEnabled(false);
      return;
    }

    const { block, normal, distance } = this.#target;
    this.#targetPoint = {
      x: eye.x + direction.x * distance + normal.x * 0.02,
      y: eye.y + direction.y * distance + normal.y * 0.02,
      z: eye.z + direction.z * distance + normal.z * 0.02,
    };
    this.#highlight.position.set(block.x, block.y, block.z);
    this.#highlight.setEnabled(true);
  }

  #updateHighlightPresentation(): void {
    if (this.#target === null) {
      return;
    }

    const progress = this.#breakProgress;
    const scale = 1 + progress * 0.035;
    this.#highlight.scaling.setAll(scale);
    this.#highlightMaterial.alpha = 0.72 + progress * 0.2;
    this.#highlightMaterial.emissiveColor.set(
      0.42 + progress * 0.35,
      0.32 - progress * 0.12,
      0.04,
    );
  }

  #breakTarget(): boolean {
    if (this.#target === null || this.#target.block.y <= 0) {
      return false;
    }
    const { x, y, z } = this.#target.block;
    const brokenBlock = this.#world.sampleBlock(x, y, z);
    if (
      brokenBlock === BlockType.Air ||
      !this.#world.setBlock(x, y, z, BlockType.Air)
    ) {
      return false;
    }
    this.#callbacks.onBlockChanged(x, y, z);
    this.#callbacks.onBlockBroken(brokenBlock);
    this.#target = null;
    this.#targetPoint = null;
    this.#highlight.setEnabled(false);
    return true;
  }

  #placeTarget(player: PlayerState): boolean {
    if (
      this.#target === null ||
      this.#selectedBlock === BlockType.Air ||
      !this.#callbacks.canPlaceBlock(this.#selectedBlock)
    ) {
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
    this.#callbacks.onBlockChanged(x, y, z);
    this.#callbacks.onBlockPlaced(this.#selectedBlock);
    return true;
  }
}
