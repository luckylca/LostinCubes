import {
  getBlockDefinition,
  isFluidBlock,
  isFullCubeBlock,
} from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { CHUNK_HEIGHT } from './VoxelChunk';

const RANDOM_TICK_INTERVAL_SECONDS = 0.25;
const RANDOM_SAMPLES_PER_BATCH = 4;
const HORIZONTAL_RADIUS = 12;
const VERTICAL_RADIUS = 9;
const LEAF_LOG_RADIUS = 4;
const SAPLING_GROWTH_CHANCE = 1 / 28;
const SCHEDULED_TICK_LIMIT_PER_UPDATE = 32;
const SUPPORT_TICK_DELAY_SECONDS = 0.05;
const WATER_TICK_DELAY_SECONDS = 0.14;
const LAVA_TICK_DELAY_SECONDS = 0.38;
const WATER_MAXIMUM_FLOW_LEVEL = 7;
const LAVA_MAXIMUM_FLOW_LEVEL = 3;

const SIX_NEIGHBORS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

const HORIZONTAL_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export interface RandomTickWorld {
  readonly worldSeed: string;
  sampleBlock(worldX: number, worldY: number, worldZ: number): BlockTypeValue;
  isSolidAt(worldX: number, worldY: number, worldZ: number): boolean;
  setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): boolean;
}

export interface WorldTickChange {
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly previous: BlockTypeValue;
  readonly next: BlockTypeValue;
}

export interface WorldTickManagerOptions {
  readonly onBlockChanged?: (change: WorldTickChange) => void;
}

interface ScheduledBlockTick {
  readonly key: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly dueAt: number;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function coordinateKey(worldX: number, worldY: number, worldZ: number): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

function fluidDelay(block: BlockTypeValue): number {
  return block === BlockType.Lava
    ? LAVA_TICK_DELAY_SECONDS
    : WATER_TICK_DELAY_SECONDS;
}

function maximumFluidLevel(block: BlockTypeValue): number {
  return block === BlockType.Lava
    ? LAVA_MAXIMUM_FLOW_LEVEL
    : WATER_MAXIMUM_FLOW_LEVEL;
}

/** Fixed nearby random ticks plus a bounded deduplicated scheduled-tick queue. */
export class WorldTickManager {
  readonly #world: RandomTickWorld;
  readonly #onBlockChanged: ((change: WorldTickChange) => void) | undefined;
  readonly #scheduled = new Map<string, ScheduledBlockTick>();
  // Procedural / pre-existing fluid cells are source level 0. Cells created by
  // this runtime are tracked as levels 1..7 (water) / 1..3 (lava), allowing
  // finite spread and recession without adding a new persisted block ID.
  readonly #fluidLevels = new Map<string, number>();
  #state: number;
  #elapsed = 0;
  #clock = 0;

  public constructor(
    world: RandomTickWorld,
    options: WorldTickManagerOptions = {},
  ) {
    this.#world = world;
    this.#onBlockChanged = options.onBlockChanged;
    this.#state = hashSeed(world.worldSeed) || 1;
  }

  public update(
    playerX: number,
    playerY: number,
    playerZ: number,
    stepSeconds: number,
  ): number {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return 0;
    this.#clock += stepSeconds;
    let changed = this.#runScheduledTicks();

    this.#elapsed += stepSeconds;
    let batches = 0;
    while (this.#elapsed >= RANDOM_TICK_INTERVAL_SECONDS && batches < 2) {
      this.#elapsed -= RANDOM_TICK_INTERVAL_SECONDS;
      batches += 1;
      for (let sample = 0; sample < RANDOM_SAMPLES_PER_BATCH; sample += 1) {
        const worldX =
          Math.floor(playerX) +
          this.#nextInteger(-HORIZONTAL_RADIUS, HORIZONTAL_RADIUS);
        const worldZ =
          Math.floor(playerZ) +
          this.#nextInteger(-HORIZONTAL_RADIUS, HORIZONTAL_RADIUS);
        const worldY = Math.min(
          Math.max(
            Math.floor(playerY) +
              this.#nextInteger(-VERTICAL_RADIUS, VERTICAL_RADIUS),
            0,
          ),
          CHUNK_HEIGHT - 1,
        );
        if (this.#tickBlock(worldX, worldY, worldZ)) changed += 1;
      }
    }
    return changed;
  }

  public scheduleBlockTick(
    worldX: number,
    worldY: number,
    worldZ: number,
    delaySeconds = SUPPORT_TICK_DELAY_SECONDS,
  ): void {
    if (
      !Number.isInteger(worldX) ||
      !Number.isInteger(worldY) ||
      !Number.isInteger(worldZ) ||
      worldY < 0 ||
      worldY >= CHUNK_HEIGHT
    ) {
      return;
    }
    const delay = Number.isFinite(delaySeconds)
      ? Math.max(delaySeconds, 0.01)
      : SUPPORT_TICK_DELAY_SECONDS;
    const key = coordinateKey(worldX, worldY, worldZ);
    const dueAt = this.#clock + delay;
    const existing = this.#scheduled.get(key);
    if (existing !== undefined && existing.dueAt <= dueAt) return;
    this.#scheduled.set(key, { key, worldX, worldY, worldZ, dueAt });
  }

  public notifyBlockChanged(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    this.scheduleBlockTick(worldX, worldY, worldZ);
    for (const [offsetX, offsetY, offsetZ] of SIX_NEIGHBORS) {
      this.scheduleBlockTick(
        worldX + offsetX,
        worldY + offsetY,
        worldZ + offsetZ,
      );
    }
  }

  public get scheduledTickCount(): number {
    return this.#scheduled.size;
  }

  public getFlowLevel(worldX: number, worldY: number, worldZ: number): number {
    const block = this.#world.sampleBlock(worldX, worldY, worldZ);
    if (!isFluidBlock(block)) return -1;
    return this.#fluidLevels.get(coordinateKey(worldX, worldY, worldZ)) ?? 0;
  }

  #rescheduleBlockTick(
    worldX: number,
    worldY: number,
    worldZ: number,
    delaySeconds: number,
  ): void {
    this.#scheduled.delete(coordinateKey(worldX, worldY, worldZ));
    this.scheduleBlockTick(worldX, worldY, worldZ, delaySeconds);
  }

  #runScheduledTicks(): number {
    let processed = 0;
    let changed = 0;
    while (processed < SCHEDULED_TICK_LIMIT_PER_UPDATE) {
      let next: ScheduledBlockTick | null = null;
      for (const candidate of this.#scheduled.values()) {
        if (candidate.dueAt > this.#clock) continue;
        if (next === null || candidate.dueAt < next.dueAt) next = candidate;
      }
      if (next === null) break;
      this.#scheduled.delete(next.key);
      changed += this.#tickScheduled(next.worldX, next.worldY, next.worldZ);
      processed += 1;
    }
    return changed;
  }

  #tickScheduled(worldX: number, worldY: number, worldZ: number): number {
    const block = this.#world.sampleBlock(worldX, worldY, worldZ);
    if (block === BlockType.Water || block === BlockType.Lava) {
      return this.#tickFluid(worldX, worldY, worldZ, block);
    }
    this.#fluidLevels.delete(coordinateKey(worldX, worldY, worldZ));
    return this.#tickBlock(worldX, worldY, worldZ) ? 1 : 0;
  }

  #tickFluid(
    worldX: number,
    worldY: number,
    worldZ: number,
    fluid: BlockTypeValue,
  ): number {
    const key = coordinateKey(worldX, worldY, worldZ);
    const opposite =
      fluid === BlockType.Water ? BlockType.Lava : BlockType.Water;

    for (const [offsetX, offsetY, offsetZ] of SIX_NEIGHBORS) {
      const neighborX = worldX + offsetX;
      const neighborY = worldY + offsetY;
      const neighborZ = worldZ + offsetZ;
      if (this.#world.sampleBlock(neighborX, neighborY, neighborZ) !== opposite) {
        continue;
      }
      if (fluid === BlockType.Lava) {
        return this.#replace(worldX, worldY, worldZ, BlockType.Cobblestone)
          ? 1
          : 0;
      }
      return this.#replace(neighborX, neighborY, neighborZ, BlockType.Cobblestone)
        ? 1
        : 0;
    }

    const trackedLevel = this.#fluidLevels.get(key);
    let level = trackedLevel ?? 0;
    const maximumLevel = maximumFluidLevel(fluid);

    // A flowing cell survives only while a source/faster-flowing neighbor can
    // feed it. Removing the source therefore produces an outward recession wave
    // instead of leaving every propagated cell as a permanent source.
    if (trackedLevel !== undefined) {
      let incomingLevel = Number.POSITIVE_INFINITY;
      if (
        worldY + 1 < CHUNK_HEIGHT &&
        this.#world.sampleBlock(worldX, worldY + 1, worldZ) === fluid
      ) {
        incomingLevel = 1;
      }
      for (const [offsetX, offsetZ] of HORIZONTAL_NEIGHBORS) {
        const neighborX = worldX + offsetX;
        const neighborZ = worldZ + offsetZ;
        if (this.#world.sampleBlock(neighborX, worldY, neighborZ) !== fluid) {
          continue;
        }
        const neighborKey = coordinateKey(neighborX, worldY, neighborZ);
        const neighborLevel = this.#fluidLevels.get(neighborKey) ?? 0;
        incomingLevel = Math.min(incomingLevel, neighborLevel + 1);
      }

      if (!Number.isFinite(incomingLevel) || incomingLevel > maximumLevel) {
        return this.#replace(worldX, worldY, worldZ, BlockType.Air) ? 1 : 0;
      }
      if (incomingLevel !== level) {
        level = incomingLevel;
        this.#fluidLevels.set(key, level);
      }
    }

    if (worldY > 0) {
      const below = this.#world.sampleBlock(worldX, worldY - 1, worldZ);
      if (getBlockDefinition(below).replaceable && !isFluidBlock(below)) {
        if (
          this.#replaceFluid(
            worldX,
            worldY - 1,
            worldZ,
            fluid,
            Math.min(level + 1, maximumLevel),
          )
        ) {
          this.#rescheduleBlockTick(
            worldX,
            worldY - 1,
            worldZ,
            fluidDelay(fluid),
          );
          return 1;
        }
      }
    }

    if (level >= maximumLevel) return 0;
    const nextLevel = level + 1;
    let changed = 0;
    for (const [offsetX, offsetZ] of HORIZONTAL_NEIGHBORS) {
      const targetX = worldX + offsetX;
      const targetZ = worldZ + offsetZ;
      const target = this.#world.sampleBlock(targetX, worldY, targetZ);
      if (target === fluid) {
        const targetKey = coordinateKey(targetX, worldY, targetZ);
        const existingLevel = this.#fluidLevels.get(targetKey);
        if (existingLevel !== undefined && existingLevel > nextLevel) {
          this.#fluidLevels.set(targetKey, nextLevel);
          this.#rescheduleBlockTick(
            targetX,
            worldY,
            targetZ,
            fluidDelay(fluid),
          );
        }
        continue;
      }
      if (isFluidBlock(target) || !getBlockDefinition(target).replaceable) continue;
      if (this.#replaceFluid(targetX, worldY, targetZ, fluid, nextLevel)) {
        changed += 1;
        this.#rescheduleBlockTick(
          targetX,
          worldY,
          targetZ,
          fluidDelay(fluid),
        );
      }
    }
    return changed;
  }

  #replaceFluid(
    worldX: number,
    worldY: number,
    worldZ: number,
    fluid: BlockTypeValue,
    level: number,
  ): boolean {
    const key = coordinateKey(worldX, worldY, worldZ);
    const previous = this.#world.sampleBlock(worldX, worldY, worldZ);
    const changed = this.#world.setBlock(worldX, worldY, worldZ, fluid);
    this.#fluidLevels.set(key, level);
    if (!changed) return false;
    this.#onBlockChanged?.({
      worldX,
      worldY,
      worldZ,
      previous,
      next: fluid,
    });
    this.notifyBlockChanged(worldX, worldY, worldZ);
    return true;
  }

  #tickBlock(worldX: number, worldY: number, worldZ: number): boolean {
    const block = this.#world.sampleBlock(worldX, worldY, worldZ);
    switch (block) {
      case BlockType.Water:
      case BlockType.Lava:
        this.scheduleBlockTick(worldX, worldY, worldZ, fluidDelay(block));
        return false;
      case BlockType.OakLeaves:
        if (this.#hasNearbyLog(worldX, worldY, worldZ)) return false;
        return this.#replace(worldX, worldY, worldZ, BlockType.Air);
      case BlockType.OakSapling:
        if (!this.#isPlantSupported(worldX, worldY, worldZ)) {
          return this.#replace(worldX, worldY, worldZ, BlockType.Air);
        }
        if (this.#nextFloat() >= SAPLING_GROWTH_CHANCE) return false;
        return this.#growOak(worldX, worldY, worldZ);
      case BlockType.TallGrass:
      case BlockType.Dandelion:
        if (this.#isPlantSupported(worldX, worldY, worldZ)) return false;
        return this.#replace(worldX, worldY, worldZ, BlockType.Air);
      case BlockType.Ladder:
        if (this.#hasAdjacentSupport(worldX, worldY, worldZ)) return false;
        return this.#replace(worldX, worldY, worldZ, BlockType.Air);
      case BlockType.Grass:
        if (
          !isFullCubeBlock(
            this.#world.sampleBlock(worldX, worldY + 1, worldZ),
          )
        ) {
          return false;
        }
        return this.#replace(worldX, worldY, worldZ, BlockType.Dirt);
      case BlockType.Dirt:
        if (!this.#canReceiveGrass(worldX, worldY, worldZ)) return false;
        return this.#replace(worldX, worldY, worldZ, BlockType.Grass);
      default:
        return false;
    }
  }

  #canReceiveGrass(worldX: number, worldY: number, worldZ: number): boolean {
    if (isFullCubeBlock(this.#world.sampleBlock(worldX, worldY + 1, worldZ))) {
      return false;
    }
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetZ === 0) continue;
        if (
          this.#world.sampleBlock(
            worldX + offsetX,
            worldY,
            worldZ + offsetZ,
          ) === BlockType.Grass
        ) {
          return true;
        }
      }
    }
    return false;
  }

  #isPlantSupported(worldX: number, worldY: number, worldZ: number): boolean {
    const below = this.#world.sampleBlock(worldX, worldY - 1, worldZ);
    return below === BlockType.Grass || below === BlockType.Dirt;
  }

  #hasAdjacentSupport(worldX: number, worldY: number, worldZ: number): boolean {
    return (
      this.#world.isSolidAt(worldX - 1, worldY, worldZ) ||
      this.#world.isSolidAt(worldX + 1, worldY, worldZ) ||
      this.#world.isSolidAt(worldX, worldY, worldZ - 1) ||
      this.#world.isSolidAt(worldX, worldY, worldZ + 1)
    );
  }

  #hasNearbyLog(worldX: number, worldY: number, worldZ: number): boolean {
    for (let offsetY = -LEAF_LOG_RADIUS; offsetY <= LEAF_LOG_RADIUS; offsetY += 1) {
      for (let offsetZ = -LEAF_LOG_RADIUS; offsetZ <= LEAF_LOG_RADIUS; offsetZ += 1) {
        for (let offsetX = -LEAF_LOG_RADIUS; offsetX <= LEAF_LOG_RADIUS; offsetX += 1) {
          if (
            Math.abs(offsetX) + Math.abs(offsetY) + Math.abs(offsetZ) >
            LEAF_LOG_RADIUS + 2
          ) {
            continue;
          }
          if (
            this.#world.sampleBlock(
              worldX + offsetX,
              worldY + offsetY,
              worldZ + offsetZ,
            ) === BlockType.OakLog
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  #growOak(worldX: number, worldY: number, worldZ: number): boolean {
    const trunkHeight = 4 + this.#nextInteger(0, 1);
    for (let y = 0; y <= trunkHeight + 1; y += 1) {
      const radius = y >= trunkHeight - 2 ? 2 : 0;
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          const block = this.#world.sampleBlock(
            worldX + x,
            worldY + y,
            worldZ + z,
          );
          if (
            !getBlockDefinition(block).replaceable &&
            block !== BlockType.OakLeaves
          ) {
            return false;
          }
        }
      }
    }

    let changed = false;
    for (let y = 0; y < trunkHeight; y += 1) {
      changed =
        this.#replace(worldX, worldY + y, worldZ, BlockType.OakLog) || changed;
    }
    const trunkTop = worldY + trunkHeight - 1;
    for (let vertical = -2; vertical <= 1; vertical += 1) {
      const radius = vertical === -2 || vertical === 1 ? 1 : 2;
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (radius === 2 && Math.abs(x) === 2 && Math.abs(z) === 2) continue;
          const targetY = trunkTop + vertical;
          const current = this.#world.sampleBlock(
            worldX + x,
            targetY,
            worldZ + z,
          );
          if (getBlockDefinition(current).replaceable) {
            changed =
              this.#replace(
                worldX + x,
                targetY,
                worldZ + z,
                BlockType.OakLeaves,
              ) || changed;
          }
        }
      }
    }
    return changed;
  }

  #replace(
    worldX: number,
    worldY: number,
    worldZ: number,
    next: BlockTypeValue,
  ): boolean {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return false;
    const key = coordinateKey(worldX, worldY, worldZ);
    const previous = this.#world.sampleBlock(worldX, worldY, worldZ);
    if (!this.#world.setBlock(worldX, worldY, worldZ, next)) return false;
    if (!isFluidBlock(next)) this.#fluidLevels.delete(key);
    this.#onBlockChanged?.({
      worldX,
      worldY,
      worldZ,
      previous,
      next,
    });
    this.notifyBlockChanged(worldX, worldY, worldZ);
    return true;
  }

  #nextFloat(): number {
    let value = this.#state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#state = value >>> 0;
    return this.#state / 0xffff_ffff;
  }

  #nextInteger(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.#nextFloat() * (maximum - minimum + 1));
  }
}
