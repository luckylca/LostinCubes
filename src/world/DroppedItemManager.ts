import { Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  getItemColor,
  getItemDefinition,
  isItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType } from '../inventory/ItemDefinitions';
import type { InventorySlotSnapshot } from '../inventory/PlayerInventory';
import type { VoxelWorldData } from './VoxelWorldData';

const MAXIMUM_DROPS = 96;
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
  item: ItemType;
  count: number;
  durability: number | null;
  x: number;
  y: number;
  z: number;
  velocityY: number;
  ageSeconds: number;
  phase: number;
  grounded: boolean;
}

export interface DroppedItemSnapshot {
  readonly item: ItemType;
  readonly count: number;
  readonly durability: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
}

export interface DroppedItemCallbacks {
  readonly onPickup: (
    stack: InventorySlotSnapshot,
  ) => InventorySlotSnapshot | null;
  readonly onPickupSucceeded?: (stack: InventorySlotSnapshot) => void;
}

function createMaterial(item: ItemType, scene: Scene): StandardMaterial {
  const colorTuple = getItemColor(item);
  const color = new Color3(colorTuple[0], colorTuple[1], colorTuple[2]);
  const material = new StandardMaterial(`drop-${item}`, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.08);
  material.specularColor = Color3.Black();
  material.freeze();
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

function normalizeDurability(
  item: ItemType,
  durability: number | null,
): number | null {
  const definition = getItemDefinition(item);
  if (definition.kind !== 'tool') return null;
  const maximum = definition.maximumDurability ?? 1;
  if (durability === null || !Number.isInteger(durability)) return maximum;
  return Math.min(Math.max(durability, 1), maximum);
}

export class DroppedItemManager {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #callbacks: DroppedItemCallbacks;
  readonly #materials = new Map<ItemType, StandardMaterial>();
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
  }

  public spawn(
    item: ItemType,
    worldX: number,
    worldY: number,
    worldZ: number,
    count = 1,
    durability: number | null = null,
  ): number {
    if (
      !isItemType(item) ||
      !Number.isInteger(count) ||
      count <= 0 ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY) ||
      !Number.isFinite(worldZ)
    ) {
      return count;
    }

    const definition = getItemDefinition(item);
    const maximumStack = definition.maximumStack;
    const normalizedDurability = normalizeDurability(item, durability);
    let remaining = count;
    for (const drop of this.#drops) {
      if (
        !drop.active ||
        drop.item !== item ||
        drop.durability !== normalizedDurability ||
        drop.count >= maximumStack ||
        distanceSquared(drop.x, drop.y, drop.z, worldX, worldY, worldZ) >
          MERGE_RADIUS * MERGE_RADIUS
      ) {
        continue;
      }
      const accepted = Math.min(maximumStack - drop.count, remaining);
      drop.count += accepted;
      remaining -= accepted;
      drop.ageSeconds = Math.min(drop.ageSeconds, PICKUP_DELAY_SECONDS);
      if (remaining === 0) return 0;
    }

    while (remaining > 0) {
      const drop = this.#acquireDrop(item);
      if (drop === null) return remaining;
      const stackCount = Math.min(maximumStack, remaining);
      remaining -= stackCount;
      const phase = this.#nextPhase;
      this.#nextPhase += 1;
      this.#activateDrop(drop, {
        item,
        count: stackCount,
        durability: normalizedDurability,
        x: worldX + Math.sin(phase * 2.31) * 0.12,
        y: worldY + 0.18,
        z: worldZ + Math.cos(phase * 1.73) * 0.12,
        grounded: false,
      });
      drop.velocityY = 2.2 + (phase % 3) * 0.16;
      drop.ageSeconds = 0;
      drop.phase = phase * 0.73;
    }
    return 0;
  }

  public restore(snapshots: readonly DroppedItemSnapshot[]): void {
    for (const snapshot of snapshots.slice(0, MAXIMUM_DROPS)) {
      if (
        !isItemType(snapshot.item) ||
        snapshot.count <= 0 ||
        !Number.isFinite(snapshot.x) ||
        !Number.isFinite(snapshot.y) ||
        !Number.isFinite(snapshot.z)
      ) {
        continue;
      }
      const drop = this.#acquireDrop(snapshot.item);
      if (drop === null) return;
      this.#activateDrop(drop, {
        ...snapshot,
        durability: normalizeDurability(snapshot.item, snapshot.durability),
        count: Math.min(
          snapshot.count,
          getItemDefinition(snapshot.item).maximumStack,
        ),
      });
      drop.velocityY = 0;
      drop.ageSeconds = PICKUP_DELAY_SECONDS;
      drop.phase = this.#nextPhase * 0.73;
      this.#nextPhase += 1;
    }
  }

  public update(player: PlayerState, frameSeconds: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
    const seconds = Math.min(frameSeconds, 0.1);
    for (const drop of this.#drops) {
      if (!drop.active) continue;
      drop.ageSeconds += seconds;
      if (drop.ageSeconds >= MAXIMUM_LIFETIME_SECONDS || drop.y < -64) {
        this.#deactivate(drop);
        continue;
      }
      if (
        drop.ageSeconds >= PICKUP_DELAY_SECONDS &&
        this.#attractAndPickup(drop, player, seconds)
      ) {
        continue;
      }
      if (!drop.grounded) this.#advanceVertical(drop, seconds);
      drop.mesh.rotation.y += seconds * 1.8;
      drop.mesh.rotation.x =
        Math.sin(drop.ageSeconds * 1.4 + drop.phase) * 0.12;
      const bob = drop.grounded
        ? Math.sin(drop.ageSeconds * 3.2 + drop.phase) * 0.045
        : 0;
      this.#syncMesh(drop, bob);
    }
  }

  public get activeCount(): number {
    return this.#drops.reduce(
      (count, drop) => count + (drop.active ? 1 : 0),
      0,
    );
  }

  public get snapshots(): readonly DroppedItemSnapshot[] {
    return this.#drops
      .filter((drop) => drop.active)
      .map((drop) => ({
        item: drop.item,
        count: drop.count,
        durability: drop.durability,
        x: drop.x,
        y: drop.y,
        z: drop.z,
        grounded: drop.grounded,
      }));
  }

  public dispose(): void {
    for (const drop of this.#drops) drop.mesh.dispose(false, false);
    this.#drops.length = 0;
    for (const material of this.#materials.values()) material.dispose();
    this.#materials.clear();
  }

  #materialFor(item: ItemType): StandardMaterial {
    const existing = this.#materials.get(item);
    if (existing !== undefined) return existing;
    const material = createMaterial(item, this.#scene);
    this.#materials.set(item, material);
    return material;
  }

  #activateDrop(drop: DropEntity, snapshot: DroppedItemSnapshot): void {
    drop.active = true;
    drop.item = snapshot.item;
    drop.count = snapshot.count;
    drop.durability = snapshot.durability;
    drop.x = snapshot.x;
    drop.y = snapshot.y;
    drop.z = snapshot.z;
    drop.grounded = snapshot.grounded;
    drop.mesh.material = this.#materialFor(snapshot.item);
    const definition = getItemDefinition(snapshot.item);
    if (definition.kind === 'tool') {
      drop.mesh.scaling.set(0.55, 1.35, 0.42);
    } else if (definition.kind === 'material' || definition.kind === 'food') {
      drop.mesh.scaling.set(0.78, 0.5, 0.78);
    } else {
      drop.mesh.scaling.setAll(1);
    }
    drop.mesh.setEnabled(true);
    this.#syncMesh(drop, 0);
  }

  #acquireDrop(item: ItemType): DropEntity | null {
    const inactive = this.#drops.find((drop) => !drop.active);
    if (inactive !== undefined) return inactive;
    if (this.#drops.length >= MAXIMUM_DROPS) return null;
    const mesh = MeshBuilder.CreateBox(
      `dropped-item-${String(this.#drops.length)}`,
      { size: DROP_SIZE },
      this.#scene,
    );
    mesh.isPickable = false;
    mesh.material = this.#materialFor(item);
    mesh.setEnabled(false);
    const drop: DropEntity = {
      mesh,
      active: false,
      item,
      count: 0,
      durability: null,
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
  ): boolean {
    const targetY = player.position.y - 0.15;
    const deltaX = player.position.x - drop.x;
    const deltaY = targetY - drop.y;
    const deltaZ = player.position.z - drop.z;
    const distance = Math.hypot(deltaX, deltaY, deltaZ);
    if (distance > ATTRACTION_RADIUS) return false;
    if (distance <= PICKUP_RADIUS) return this.#attemptPickup(drop);
    if (distance <= Number.EPSILON) return false;
    const moveDistance = Math.min(
      distance,
      (3.5 + (ATTRACTION_RADIUS - distance) * 3) * seconds,
    );
    drop.x += (deltaX / distance) * moveDistance;
    drop.y += (deltaY / distance) * moveDistance;
    drop.z += (deltaZ / distance) * moveDistance;
    drop.velocityY = 0;
    drop.grounded = false;
    return distance - moveDistance <= PICKUP_RADIUS
      ? this.#attemptPickup(drop)
      : false;
  }

  #attemptPickup(drop: DropEntity): boolean {
    const original: InventorySlotSnapshot = {
      item: drop.item,
      count: drop.count,
      durability: drop.durability,
    };
    const remaining = this.#callbacks.onPickup(original);
    const remainingCount = remaining?.count ?? 0;
    const pickedUp = original.count - remainingCount;
    if (pickedUp > 0) {
      this.#callbacks.onPickupSucceeded?.({
        ...original,
        count: pickedUp,
      });
    }
    if (remaining === null || remaining.count <= 0) {
      this.#deactivate(drop);
      return true;
    }
    drop.item = remaining.item ?? drop.item;
    drop.count = remaining.count;
    drop.durability = remaining.durability;
    drop.ageSeconds = PICKUP_DELAY_SECONDS;
    return false;
  }

  #syncMesh(drop: DropEntity, verticalOffset: number): void {
    drop.mesh.position.set(drop.x, drop.y + verticalOffset, drop.z);
    const stackScale = 1 + Math.min(drop.count - 1, 15) * 0.006;
    const definition = getItemDefinition(drop.item);
    if (definition.kind === 'tool') {
      drop.mesh.scaling.set(
        0.55 * stackScale,
        1.35 * stackScale,
        0.42 * stackScale,
      );
    } else if (definition.kind === 'material' || definition.kind === 'food') {
      drop.mesh.scaling.set(
        0.78 * stackScale,
        0.5 * stackScale,
        0.78 * stackScale,
      );
    } else {
      drop.mesh.scaling.setAll(stackScale);
    }
  }

  #deactivate(drop: DropEntity): void {
    drop.active = false;
    drop.count = 0;
    drop.durability = null;
    drop.mesh.setEnabled(false);
  }
}
