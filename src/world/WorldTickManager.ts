import { getBlockDefinition, isFullCubeBlock } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { CHUNK_HEIGHT } from './VoxelChunk';

const RANDOM_TICK_INTERVAL_SECONDS = 0.25;
const RANDOM_SAMPLES_PER_BATCH = 4;
const HORIZONTAL_RADIUS = 12;
const VERTICAL_RADIUS = 9;
const LEAF_LOG_RADIUS = 4;
const SAPLING_GROWTH_CHANCE = 1 / 28;

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

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Fixed tiny random-tick budget around the player; never scans the world. */
export class WorldTickManager {
  readonly #world: RandomTickWorld;
  readonly #onBlockChanged: ((change: WorldTickChange) => void) | undefined;
  #state: number;
  #elapsed = 0;

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
    this.#elapsed += stepSeconds;
    let changed = 0;
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

  #tickBlock(worldX: number, worldY: number, worldZ: number): boolean {
    const block = this.#world.sampleBlock(worldX, worldY, worldZ);
    switch (block) {
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
        this.#replace(worldX, worldY + y, worldZ, BlockType.OakLog) ||
        changed;
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
    const previous = this.#world.sampleBlock(worldX, worldY, worldZ);
    if (!this.#world.setBlock(worldX, worldY, worldZ, next)) return false;
    this.#onBlockChanged?.({
      worldX,
      worldY,
      worldZ,
      previous,
      next,
    });
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
