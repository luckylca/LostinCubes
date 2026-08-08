import {
  Color3,
  Constants,
  Material,
  MeshBuilder,
  RawTexture,
  StandardMaterial,
  Texture,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  getMiningSpeedMultiplier,
  itemToBlock,
} from '../inventory/ItemDefinitions';
import type { ItemType } from '../inventory/ItemDefinitions';
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
import {
  canReplaceBlockForPlacement,
  getFluidReplacementAfterBreak,
} from './FluidRules';
import { raycastVoxels } from './VoxelRaycast';
import type { VoxelCoordinate, VoxelRaycastHit } from './VoxelRaycast';
import type { VoxelWorldData } from './VoxelWorldData';

export interface VoxelInteractionCallbacks {
  readonly onBlockChanged: (
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => void;
  readonly onBlockBroken: (
    block: BlockTypeValue,
    position: VoxelCoordinate,
  ) => void;
  readonly canPlaceBlock: (block: BlockTypeValue) => boolean;
  readonly onBlockPlaced: (block: BlockTypeValue) => void;
  readonly onToolUsed: (block: BlockTypeValue) => void;
  readonly onUseBlock?: (
    block: BlockTypeValue,
    position: VoxelCoordinate,
  ) => boolean;
}

export interface InteractionTargetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const CRACK_STAGE_COUNT = 8;
const CRACK_TEXTURE_SIZE = 16;

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

function setCrackPixel(
  pixels: Uint8Array,
  x: number,
  y: number,
  alpha = 220,
): void {
  if (x < 0 || y < 0 || x >= CRACK_TEXTURE_SIZE || y >= CRACK_TEXTURE_SIZE) {
    return;
  }
  const offset = (x + y * CRACK_TEXTURE_SIZE) * 4;
  pixels[offset] = 15;
  pixels[offset + 1] = 12;
  pixels[offset + 2] = 10;
  pixels[offset + 3] = alpha;
}

function createCrackTextures(scene: Scene): RawTexture[] {
  const branches = [
    [[8, 8], [7, 7], [6, 6], [5, 5], [4, 4], [3, 3]],
    [[8, 8], [9, 7], [10, 6], [11, 5], [12, 4], [13, 3]],
    [[8, 8], [7, 9], [6, 10], [5, 11], [4, 12], [3, 13]],
    [[8, 8], [9, 9], [10, 10], [11, 11], [12, 12], [13, 13]],
    [[6, 6], [6, 5], [7, 4], [7, 3], [8, 2]],
    [[10, 10], [10, 11], [9, 12], [9, 13], [8, 14]],
    [[5, 11], [4, 10], [3, 10], [2, 9]],
    [[11, 5], [12, 6], [13, 6], [14, 7]],
  ] as const;

  return Array.from({ length: CRACK_STAGE_COUNT }, (_, stage) => {
    const pixels = new Uint8Array(CRACK_TEXTURE_SIZE * CRACK_TEXTURE_SIZE * 4);
    const branchCount = Math.min(stage + 1, branches.length);
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const branch = branches[branchIndex] ?? [];
      const pointCount = Math.max(
        2,
        Math.ceil((branch.length * (stage + 2)) / (CRACK_STAGE_COUNT + 1)),
      );
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const point = branch[pointIndex];
        if (point === undefined) continue;
        setCrackPixel(pixels, point[0], point[1]);
        if (stage >= 4 && pointIndex % 2 === 0) {
          setCrackPixel(pixels, point[0] + 1, point[1], 165);
        }
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      CRACK_TEXTURE_SIZE,
      CRACK_TEXTURE_SIZE,
      scene,
      false,
      false,
      Texture.NEAREST_NEAREST,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    texture.name = `voxel-crack-stage-${String(stage + 1)}`;
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  });
}

export class VoxelInteractionController {
  readonly #world: VoxelWorldData;
  readonly #highlight: Mesh;
  readonly #highlightMaterial: StandardMaterial;
  readonly #crackOverlay: Mesh;
  readonly #crackMaterial: StandardMaterial;
  readonly #crackTextures: RawTexture[];
  readonly #timing = new BlockInteractionState();
  readonly #callbacks: VoxelInteractionCallbacks;
  #target: VoxelRaycastHit | null = null;
  #targetPoint: InteractionTargetPoint | null = null;
  #heldItem: ItemType | null = null;
  #selectedBlock: BlockTypeValue = BlockType.Air;
  #breakProgress = 0;
  #useWasHeld = false;

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
    this.#highlight.renderingGroupId = 2;
    this.#highlight.setEnabled(false);

    this.#crackTextures = createCrackTextures(scene);
    this.#crackMaterial = new StandardMaterial('voxel-crack-material', scene);
    this.#crackMaterial.diffuseColor = Color3.White();
    this.#crackMaterial.specularColor = Color3.Black();
    this.#crackMaterial.disableLighting = true;
    this.#crackMaterial.backFaceCulling = false;
    this.#crackMaterial.useAlphaFromDiffuseTexture = true;
    this.#crackMaterial.transparencyMode = Material.MATERIAL_ALPHATEST;
    this.#crackMaterial.alphaCutOff = 0.08;
    this.#crackMaterial.diffuseTexture = this.#crackTextures[0] ?? null;

    this.#crackOverlay = MeshBuilder.CreateBox(
      'voxel-crack-overlay',
      { size: 1.041 },
      scene,
    );
    this.#crackOverlay.material = this.#crackMaterial;
    this.#crackOverlay.isPickable = false;
    this.#crackOverlay.renderingGroupId = 3;
    this.#crackOverlay.setEnabled(false);
  }

  public update(
    player: PlayerState,
    frameSeconds: number,
    breakHeld: boolean,
    placeHeld: boolean,
  ): void {
    this.#updateTarget(player);

    const targetBlock = this.targetBlock;
    const useNow = placeHeld && !this.#useWasHeld;
    this.#useWasHeld = placeHeld;
    if (
      useNow &&
      this.#target !== null &&
      this.#callbacks.onUseBlock?.(targetBlock, this.#target.block) === true
    ) {
      this.#timing.reset();
      this.#breakProgress = 0;
      this.#updateHighlightPresentation();
      return;
    }

    const timing = this.#timing.update({
      targetKey: this.#target === null ? null : createTargetKey(this.#target),
      targetBlock,
      canBreakTarget: this.#target !== null && this.#target.block.y > 0,
      breakHeld,
      placeHeld: placeHeld && this.#selectedBlock !== BlockType.Air,
      breakSpeedMultiplier: getMiningSpeedMultiplier(
        this.#heldItem,
        targetBlock,
      ),
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

  public setHeldItem(item: ItemType | null): void {
    this.#heldItem = item;
    this.#selectedBlock = itemToBlock(item) ?? BlockType.Air;
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

  public get targetBlock(): BlockTypeValue {
    return this.#target === null
      ? BlockType.Air
      : this.#world.sampleBlock(
          this.#target.block.x,
          this.#target.block.y,
          this.#target.block.z,
        );
  }

  public get hasTarget(): boolean {
    return this.#target !== null;
  }

  public dispose(): void {
    this.#highlightMaterial.dispose();
    this.#highlight.dispose(false, false);
    this.#crackMaterial.dispose(false, false);
    this.#crackOverlay.dispose(false, false);
    for (const texture of this.#crackTextures) texture.dispose();
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
      this.#crackOverlay.setEnabled(false);
      return;
    }

    const { block, normal, distance } = this.#target;
    this.#targetPoint = {
      x: eye.x + direction.x * distance + normal.x * 0.02,
      y: eye.y + direction.y * distance + normal.y * 0.02,
      z: eye.z + direction.z * distance + normal.z * 0.02,
    };
    this.#highlight.position.set(block.x, block.y, block.z);
    this.#crackOverlay.position.set(block.x, block.y, block.z);
    this.#highlight.setEnabled(true);
  }

  #updateHighlightPresentation(): void {
    if (this.#target === null) {
      this.#crackOverlay.setEnabled(false);
      return;
    }

    const progress = this.#breakProgress;
    const scale = 1 + progress * 0.025;
    this.#highlight.scaling.setAll(scale);
    this.#highlightMaterial.alpha = 0.58 + progress * 0.2;
    this.#highlightMaterial.emissiveColor.set(
      0.34 + progress * 0.24,
      0.3 - progress * 0.1,
      0.04,
    );

    if (progress <= 0) {
      this.#crackOverlay.setEnabled(false);
      return;
    }
    const stage = Math.min(
      Math.floor(progress * CRACK_STAGE_COUNT),
      CRACK_STAGE_COUNT - 1,
    );
    this.#crackMaterial.diffuseTexture = this.#crackTextures[stage] ?? null;
    this.#crackOverlay.setEnabled(true);
  }

  #breakTarget(): boolean {
    if (this.#target === null || this.#target.block.y <= 0) {
      return false;
    }
    const { x, y, z } = this.#target.block;
    const brokenBlock = this.#world.sampleBlock(x, y, z);
    const replacement = getFluidReplacementAfterBreak(
      (worldX, worldY, worldZ) =>
        this.#world.sampleBlock(worldX, worldY, worldZ),
      x,
      y,
      z,
    );
    if (
      brokenBlock === BlockType.Air ||
      !this.#world.setBlock(x, y, z, replacement)
    ) {
      return false;
    }
    this.#callbacks.onBlockChanged(x, y, z);
    this.#callbacks.onToolUsed(brokenBlock);
    this.#callbacks.onBlockBroken(brokenBlock, { x, y, z });
    this.#target = null;
    this.#targetPoint = null;
    this.#highlight.setEnabled(false);
    this.#crackOverlay.setEnabled(false);
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
    const existingBlock = this.#world.sampleBlock(x, y, z);
    if (
      !canReplaceBlockForPlacement(existingBlock) ||
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
