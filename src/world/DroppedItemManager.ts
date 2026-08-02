import {
  Color3,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import type { VoxelWorldData } from './VoxelWorldData';

const MAXIMUM_DROPS = 96;
const MAXIMUM_DROP_STACK = 64;
const DROP_SIZE = 0.28;
const DROP_HALF_SIZE = DROP_SIZE / 2;
const GRAVITY = -18;
const PICKUP_DELAY_SECONDS = 0.32;
const ATTRACTION_RADIUS = 2.5;
const PICKUP_RADIUS = 0.58;
const MERGE_RADIUS = 1.25;
const MAXIMUM_LIFETIME_SECONDS = 300;

interface DropEntity {
  readonly mesh: Mesh;
  active: boolean;
  block: BlockTypeValue;
  count: number;
  x: number;
  y: number;
  z: number;
  velocityY: number;
  ageSeconds: number;
  phase: number;
  grounded: boolean;
}

export interface DroppedItemSnapshot {
  readonly block: BlockTypeValue;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
}

export interface DroppedItemCallbacks {
  readonly onPickup: (block: BlockTypeValue, count: number) => number;
}

function createMaterial(
  name: string,
  color: Color3,
  scene: Scene,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.08);
  material.specularColor = Color3.Black();
  material.freeze();
  return material;
}

function getMaterialForBlock(
  block: BlockTypeValue,
  materials: ReadonlyMap<BlockTypeValue, StandardMaterial>,
): StandardMaterial {
  const material = materials.get(block);
  if (material === undefined) {
    throw new Error(`No dropped-item material for block ${String(block)}.`);
  }
  return material;
}

function distanceSquared(
  leftX: number,
  leftY: number,
  leftZ: number,
  rightX: number,
  rightY: number,
  rightZ: number,
): number {
  const deltaX = leftX - rightX;
  const deltaY = leftY - rightY;
  const deltaZ = leftZ - rightZ;
  return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
}

/**
 * Fixed-capacity dropped-item pool. Meshes are reused, same-block drops merge,
 * and pickup returns any inventory overflow to the world instead of deleting it.
 */
export class DroppedItemManager {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #callbacks: DroppedItemCallbacks;
  readonly #materials: ReadonlyMap<BlockTypeValue, StandardMaterial>;
  readonly #drops: DropEntity[] = [];
  #nextPhase = 0;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    callbacks: DroppedItemCallbacks,
  ) {
    this.#scene = scene;
    this.#world = world;
    this.#callbacks = callbacks;
    this.#materials = new Map<BlockTypeValue, StandardMaterial>([
      [BlockType.Grass, createMaterial('drop-grass', new Color3(0.37, 0.58, 0.28), scene)],
      [BlockType.Dirt, createMaterial('drop-dirt', new Color3(0.44, 0.3, 0.2), scene)],
      [BlockType.Stone, createMaterial('drop-stone', new Color3(0.46, 0.48, 0.47), scene)],
      [BlockType.RuneStone, createMaterial('drop-rune', new Color3(0.2, 0.43, 0.31), scene)],
    ]);
  }

  public spawn(
    block: BlockTypeValue,
    worldX: number,
    worldY: number,
    worldZ: number,
    count = 1,
  ): number {
    if (
      block === BlockType.Air ||
      !Number.isInteger(count) ||
      count <= 0 ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY) ||
      !Number.isFinite(worldZ)
    ) {
      return count;
    }

    let remaining = count;
    for (const drop of this.#drops) {
      if (
        !drop.active ||
        drop.block !== block ||
        drop.count >= MAXIMUM_DROP_STACK ||
        distanceSquared(drop.x, drop.y, drop.z, worldX, worldY, worldZ) >
          MERGE_RADIUS * MERGE_RADIUS
      ) {
        continue;
      }
      const accepted = Math.min(MAXIMUM_DROP_STACK - drop.count, remaining);
      drop.count += accepted;
      remaining -= accepted;
      drop.ageSeconds = Math.min(drop.ageSeconds, PICKUP_DELAY_SECONDS);
      if (remaining === 0) {
        return 0;
      }
    }

    while (remaining > 0) {
      const drop = this.#acquireDrop(block);
      if (drop === null) {
        return remaining;
      }
      const stackCount = Math.min(MAXIMUM_DROP_STACK, remaining);
      remaining -= stackCount;
      const phase = this.#nextPhase;
      this.#nextPhase += 1;
      drop.active = true;
      drop.block = block;
      drop.count = stackCount;
      drop.x = worldX + Math.sin(phase * 2.31) * 0.12;
      drop.y = worldY + 0.18;
      drop.z = worldZ + Math.cos(phase * 1.73) * 0.12;
      drop.velocityY = 2.2 + (phase % 3) * 0.16;
      drop.ageSeconds = 0;
      drop.phase = phase * 0.73;
      drop.grounded = false;
      drop.mesh.material = getMaterialForBlock(block, this.#materials);
      drop.mesh.scaling.setAll(1);
      drop.mesh.setEnabled(true);
      this.#syncMesh(drop, 0);
    }
    return 0;
  }

  public update(player: PlayerState, frameSeconds: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) {
      return;
    }
    const seconds = Math.min(frameSeconds, 0.1);

    for (const drop of this.#drops) {
      if (!drop.active) {
        continue;
      }
      drop.ageSeconds += seconds;
      if (drop.ageSeconds >= MAXIMUM_LIFETIME_SECONDS || drop.y < -64) {
        this.#deactivate(drop);
        continue;
      }

      if (drop.ageSeconds >= PICKUP_DELAY_SECONDS) {
        this.#attractAndPickup(drop, player, seconds);
        if (!drop.active) {
          continue;
        }
      }

      if (!drop.grounded) {
        this.#advanceVertical(drop, seconds);
      }
      drop.mesh.rotation.y += seconds * 1.8;
      drop.mesh.rotation.x = Math.sin(drop.ageSeconds * 1.4 + drop.phase) * 0.12;
      const bob = drop.grounded
        ? Math.sin(drop.ageSeconds * 3.2 + drop.phase) * 0.045
        : 0;
      this.#syncMesh(drop, bob);
    }
  }

  public get activeCount(): number {
    let count = 0;
    for (const drop of this.#drops) {
      count += drop.active ? 1 : 0;
    }
    return count;
  }

  public get snapshots(): readonly DroppedItemSnapshot[] {
    return this.#drops
      .filter((drop) => drop.active)
      .map((drop) => ({
        block: drop.block,
        count: drop.count,
        x: drop.x,
        y: drop.y,
        z: drop.z,
        grounded: drop.grounded,
      }));
  }

  public dispose(): void {
    for (const drop of this.#drops) {
      drop.mesh.dispose(false, false);
    }
    this.#drops.length = 0;
    for (const material of this.#materials.values()) {
      material.dispose();
    }
  }

  #acquireDrop(block: BlockTypeValue): DropEntity | null {
    const inactive = this.#drops.find((drop) => !drop.active);
    if (inactive !== undefined) {
      return inactive;
    }
    if (this.#drops.length >= MAXIMUM_DROPS) {
      return null;
    }

    const mesh = MeshBuilder.CreateBox(
      `dropped-item-${String(this.#drops.length)}`,
      { size: DROP_SIZE },
      this.#scene,
    );
    mesh.isPickable = false;
    mesh.material = getMaterialForBlock(block, this.#materials);
    mesh.setEnabled(false);
    const drop: DropEntity = {
      mesh,
      active: false,
      block,
      count: 0,
      x: 0,
      y: 0,
      z: 0,
      velocityY: 0,
      ageSeconds: 0,
      phase: 0,
      grounded: false,
    };
    this.#drops.push(drop);
    return drop;
  }

  #advanceVertical(drop: DropEntity, seconds: number): void {
    const steps = Math.max(1, Math.ceil(seconds / 0.025));
    const stepSeconds = seconds / steps;
    for (let step = 0; step < steps; step += 1) {
      drop.velocityY += GRAVITY * stepSeconds;
      const nextY = drop.y + drop.velocityY * stepSeconds;
      if (drop.velocityY > 0) {
        drop.y = nextY;
        continue;
      }

      const cellX = Math.floor(drop.x + 0.5);
      const cellZ = Math.floor(drop.z + 0.5);
      const nextBottom = nextY - DROP_HALF_SIZE;
      const cellY = Math.floor(nextBottom + 0.5);
      const blockTop = cellY + 0.5;
      const currentBottom = drop.y - DROP_HALF_SIZE;
      if (
        this.#world.isSolidAt(cellX, cellY, cellZ) &&
        currentBottom >= blockTop - 0.06 &&
        nextBottom <= blockTop
      ) {
        drop.y = blockTop + DROP_HALF_SIZE;
        drop.velocityY = 0;
        drop.grounded = true;
        return;
      }
      drop.y = nextY;
    }
  }

  #attractAndPickup(
    drop: DropEntity,
    player: PlayerState,
    seconds: number,
  ): void {
    const targetY = player.position.y - 0.15;
    const deltaX = player.position.x - drop.x;
    const deltaY = targetY - drop.y;
    const deltaZ = player.position.z - drop.z;
    const distance = Math.hypot(deltaX, deltaY, deltaZ);
    if (distance > ATTRACTION_RADIUS || distance <= Number.EPSILON) {
      return;
    }

    const moveDistance = Math.min(distance, (3.5 + (ATTRACTION_RADIUS - distance) * 3) * seconds);
    drop.x += (deltaX / distance) * moveDistance;
    drop.y += (deltaY / distance) * moveDistance;
    drop.z += (deltaZ / distance) * moveDistance;
    drop.velocityY = 0;
    drop.grounded = false;

    if (distance > PICKUP_RADIUS) {
      return;
    }
    const remaining = this.#callbacks.onPickup(drop.block, drop.count);
    if (remaining <= 0) {
      this.#deactivate(drop);
    } else {
      drop.count = remaining;
      drop.ageSeconds = PICKUP_DELAY_SECONDS;
    }
  }

  #syncMesh(drop: DropEntity, verticalOffset: number): void {
    drop.mesh.position.set(drop.x, drop.y + verticalOffset, drop.z);
    const stackScale = 1 + Math.min(drop.count - 1, 15) * 0.006;
    drop.mesh.scaling.setAll(stackScale);
  }

  #deactivate(drop: DropEntity): void {
    drop.active = false;
    drop.count = 0;
    drop.mesh.setEnabled(false);
  }
}
