import {
  getBlockLightOpacity,
  getBlockLuminance,
} from './BlockRegistry';
import type { BlockType } from './BlockType';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './VoxelChunk';

export const MAXIMUM_LIGHT_LEVEL = 15;
export const LIGHT_PROPAGATION_RADIUS = MAXIMUM_LIGHT_LEVEL;

export type WorldLightEmitter = readonly [
  worldX: number,
  worldY: number,
  worldZ: number,
  level: number,
];

export type WorldBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockType;

export interface ChunkLightField {
  readonly sampleSky: (worldX: number, worldY: number, worldZ: number) => number;
  readonly sampleBlock: (worldX: number, worldY: number, worldZ: number) => number;
  readonly sampleCombined: (worldX: number, worldY: number, worldZ: number) => number;
}

class GrowingIntQueue {
  #values: Int32Array;
  #head = 0;
  #tail = 0;

  public constructor(initialCapacity: number) {
    this.#values = new Int32Array(Math.max(16, initialCapacity));
  }

  public push(value: number): void {
    if (this.#tail >= this.#values.length) this.#makeRoom();
    this.#values[this.#tail] = value;
    this.#tail += 1;
  }

  public shift(): number | null {
    if (this.#head >= this.#tail) return null;
    const value = this.#values[this.#head] ?? 0;
    this.#head += 1;
    return value;
  }

  #makeRoom(): void {
    if (this.#head > 0) {
      this.#values.copyWithin(0, this.#head, this.#tail);
      this.#tail -= this.#head;
      this.#head = 0;
      if (this.#tail < this.#values.length) return;
    }
    const expanded = new Int32Array(this.#values.length * 2);
    expanded.set(this.#values);
    this.#values = expanded;
  }
}

function clampLight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), MAXIMUM_LIGHT_LEVEL);
}

/**
 * Builds a bounded classic-style light field for one chunk. The extra
 * 15-block border is the maximum distance a level-15 source can influence,
 * so the owning chunk does not depend on an unbounded flood fill.
 */
export function buildChunkLightField(
  chunkX: number,
  chunkZ: number,
  sampleBlock: WorldBlockSampler,
  dynamicEmitters: readonly WorldLightEmitter[] = [],
): ChunkLightField {
  const margin = LIGHT_PROPAGATION_RADIUS;
  const minimumX = chunkX * CHUNK_SIZE - margin;
  const minimumZ = chunkZ * CHUNK_SIZE - margin;
  const sizeX = CHUNK_SIZE + margin * 2;
  const sizeZ = CHUNK_SIZE + margin * 2;
  const layerSize = sizeX * sizeZ;
  const volumeSize = layerSize * CHUNK_HEIGHT;
  const sky = new Uint8Array(volumeSize);
  const block = new Uint8Array(volumeSize);

  const contains = (worldX: number, worldY: number, worldZ: number): boolean =>
    worldX >= minimumX &&
    worldX < minimumX + sizeX &&
    worldZ >= minimumZ &&
    worldZ < minimumZ + sizeZ &&
    worldY >= 0 &&
    worldY < CHUNK_HEIGHT;

  const indexOf = (worldX: number, worldY: number, worldZ: number): number =>
    worldX - minimumX +
    (worldZ - minimumZ) * sizeX +
    worldY * layerSize;

  // Direct vertical skylight is solved in one column pass. Unlike the old
  // implementation, this does not enqueue every lit cell in the 67k-cell
  // volume. A second pass only seeds cells that can actually improve a
  // neighbor, which keeps the flood queue focused on cave mouths and shadow
  // boundaries instead of the entire open sky.
  for (let localZ = 0; localZ < sizeZ; localZ += 1) {
    const worldZ = minimumZ + localZ;
    for (let localX = 0; localX < sizeX; localX += 1) {
      const worldX = minimumX + localX;
      let level = MAXIMUM_LIGHT_LEVEL;
      for (let worldY = CHUNK_HEIGHT - 1; worldY >= 0; worldY -= 1) {
        const opacity = getBlockLightOpacity(
          sampleBlock(worldX, worldY, worldZ),
        );
        if (opacity >= MAXIMUM_LIGHT_LEVEL) {
          level = 0;
        } else if (opacity > 0) {
          level = Math.max(level - Math.max(opacity, 1), 0);
        }
        sky[indexOf(worldX, worldY, worldZ)] = level;
      }
    }
  }

  const neighborOffsets = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ] as const;

  const skyQueue = new GrowingIntQueue(layerSize);
  for (let worldY = 0; worldY < CHUNK_HEIGHT; worldY += 1) {
    for (let localZ = 0; localZ < sizeZ; localZ += 1) {
      const worldZ = minimumZ + localZ;
      for (let localX = 0; localX < sizeX; localX += 1) {
        const worldX = minimumX + localX;
        const sourceIndex = indexOf(worldX, worldY, worldZ);
        const sourceLevel = sky[sourceIndex] ?? 0;
        if (sourceLevel <= 1) continue;

        let canImproveNeighbor = false;
        for (const [offsetX, offsetY, offsetZ] of neighborOffsets) {
          const targetX = worldX + offsetX;
          const targetY = worldY + offsetY;
          const targetZ = worldZ + offsetZ;
          if (!contains(targetX, targetY, targetZ)) continue;
          const opacity = getBlockLightOpacity(
            sampleBlock(targetX, targetY, targetZ),
          );
          if (opacity >= MAXIMUM_LIGHT_LEVEL) continue;
          const propagated = sourceLevel - Math.max(opacity, 1);
          if (
            propagated >
            (sky[indexOf(targetX, targetY, targetZ)] ?? 0)
          ) {
            canImproveNeighbor = true;
            break;
          }
        }
        if (canImproveNeighbor) skyQueue.push(sourceIndex);
      }
    }
  }

  const blockQueue = new GrowingIntQueue(128);
  for (let worldY = 0; worldY < CHUNK_HEIGHT; worldY += 1) {
    for (let localZ = 0; localZ < sizeZ; localZ += 1) {
      const worldZ = minimumZ + localZ;
      for (let localX = 0; localX < sizeX; localX += 1) {
        const worldX = minimumX + localX;
        const level = getBlockLuminance(
          sampleBlock(worldX, worldY, worldZ),
        );
        if (level <= 0) continue;
        const index = indexOf(worldX, worldY, worldZ);
        block[index] = level;
        blockQueue.push(index);
      }
    }
  }

  for (const [worldX, worldY, worldZ, rawLevel] of dynamicEmitters) {
    if (!contains(worldX, worldY, worldZ)) continue;
    const level = clampLight(rawLevel);
    if (level <= 0) continue;
    const index = indexOf(worldX, worldY, worldZ);
    if (level > (block[index] ?? 0)) {
      block[index] = level;
      blockQueue.push(index);
    }
  }

  const propagate = (levels: Uint8Array, queue: GrowingIntQueue): void => {
    let sourceIndex = queue.shift();
    while (sourceIndex !== null) {
      const sourceLevel = levels[sourceIndex] ?? 0;
      if (sourceLevel > 1) {
        const sourceY = Math.floor(sourceIndex / layerSize);
        const inLayer = sourceIndex - sourceY * layerSize;
        const localZ = Math.floor(inLayer / sizeX);
        const localX = inLayer - localZ * sizeX;
        const sourceX = minimumX + localX;
        const sourceZ = minimumZ + localZ;

        for (const [offsetX, offsetY, offsetZ] of neighborOffsets) {
          const targetX = sourceX + offsetX;
          const targetY = sourceY + offsetY;
          const targetZ = sourceZ + offsetZ;
          if (!contains(targetX, targetY, targetZ)) continue;
          const opacity = getBlockLightOpacity(
            sampleBlock(targetX, targetY, targetZ),
          );
          if (opacity >= MAXIMUM_LIGHT_LEVEL) continue;
          const propagated = sourceLevel - Math.max(opacity, 1);
          if (propagated <= 0) continue;
          const targetIndex = indexOf(targetX, targetY, targetZ);
          if (propagated <= (levels[targetIndex] ?? 0)) continue;
          levels[targetIndex] = propagated;
          queue.push(targetIndex);
        }
      }
      sourceIndex = queue.shift();
    }
  };

  propagate(sky, skyQueue);
  propagate(block, blockQueue);

  const sample = (
    levels: Uint8Array,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): number => {
    if (worldY >= CHUNK_HEIGHT) {
      return levels === sky ? MAXIMUM_LIGHT_LEVEL : 0;
    }
    if (!contains(worldX, worldY, worldZ)) return 0;
    return levels[indexOf(worldX, worldY, worldZ)] ?? 0;
  };

  return {
    sampleSky: (worldX, worldY, worldZ) =>
      sample(sky, worldX, worldY, worldZ),
    sampleBlock: (worldX, worldY, worldZ) =>
      sample(block, worldX, worldY, worldZ),
    sampleCombined: (worldX, worldY, worldZ) =>
      Math.max(
        sample(sky, worldX, worldY, worldZ),
        sample(block, worldX, worldY, worldZ),
      ),
  };
}

export function lightLevelToBrightness(level: number): number {
  const normalized = clampLight(level) / MAXIMUM_LIGHT_LEVEL;
  return 0.18 + normalized * 0.82;
}
