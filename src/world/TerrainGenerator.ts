import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  VoxelChunk,
} from './VoxelChunk';

const UINT32_MAX = 4_294_967_295;
const PLAYER_FOOT_OFFSET = 0.9;
const TREE_CELL_SIZE = 7;
const TREE_CHANCE = 0.52;
const TREE_STRUCTURE_HEIGHT = 8;

interface TreeAnchor {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly trunkHeight: number;
}

export function hashWorldSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function hashCoordinate(x: number, z: number, seed: number): number {
  let hash = seed;
  hash ^= Math.imul(x, 374_761_393);
  hash ^= Math.imul(z, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_MAX;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolate(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function sampleValueNoise(
  worldX: number,
  worldZ: number,
  scale: number,
  seed: number,
): number {
  const scaledX = worldX / scale;
  const scaledZ = worldZ / scale;
  const minimumX = Math.floor(scaledX);
  const minimumZ = Math.floor(scaledZ);
  const blendX = smoothStep(scaledX - minimumX);
  const blendZ = smoothStep(scaledZ - minimumZ);

  const near = interpolate(
    hashCoordinate(minimumX, minimumZ, seed),
    hashCoordinate(minimumX + 1, minimumZ, seed),
    blendX,
  );
  const far = interpolate(
    hashCoordinate(minimumX, minimumZ + 1, seed),
    hashCoordinate(minimumX + 1, minimumZ + 1, seed),
    blendX,
  );
  return interpolate(near, far, blendZ);
}

export class TerrainGenerator {
  readonly #seed: number;

  public constructor(worldSeed: string) {
    this.#seed = hashWorldSeed(worldSeed);
  }

  public sampleSurfaceHeight(worldX: number, worldZ: number): number {
    const continent = sampleValueNoise(worldX, worldZ, 48, this.#seed);
    const hills = sampleValueNoise(
      worldX,
      worldZ,
      18,
      this.#seed ^ 0x9e3779b9,
    );
    const detail = sampleValueNoise(
      worldX,
      worldZ,
      7,
      this.#seed ^ 0x85ebca6b,
    );
    const height = Math.floor(4 + continent * 5 + hills * 3 + detail * 1.5);
    return Math.min(Math.max(height, 2), CHUNK_HEIGHT - TREE_STRUCTURE_HEIGHT);
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return BlockType.Air;
    }

    const treeBlock = this.#sampleTreeBlock(worldX, worldY, worldZ);
    if (treeBlock !== BlockType.Air) {
      return treeBlock;
    }
    return this.#sampleTerrainBlock(worldX, worldY, worldZ);
  }

  public sampleStandingY(worldX: number, worldZ: number): number {
    const blockX = Math.floor(worldX);
    const blockZ = Math.floor(worldZ);
    return (
      this.sampleSurfaceHeight(blockX, blockZ) +
      0.5 +
      PLAYER_FOOT_OFFSET
    );
  }

  public generateChunk(chunkX: number, chunkZ: number): VoxelChunk {
    const chunk = new VoxelChunk(chunkX, chunkZ);

    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const surfaceHeight = this.sampleSurfaceHeight(worldX, worldZ);
        const maximumY = Math.min(
          CHUNK_HEIGHT - 1,
          surfaceHeight + TREE_STRUCTURE_HEIGHT,
        );

        for (let localY = 0; localY <= maximumY; localY += 1) {
          const block = this.sampleBlock(worldX, localY, worldZ);
          if (block !== BlockType.Air) {
            chunk.setBlock(localX, localY, localZ, block);
          }
        }
      }
    }

    return chunk;
  }

  #sampleTerrainBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    const surfaceHeight = this.sampleSurfaceHeight(worldX, worldZ);
    if (worldY > surfaceHeight) {
      return BlockType.Air;
    }
    if (worldY === surfaceHeight) {
      return BlockType.Grass;
    }
    if (worldY >= surfaceHeight - 2) {
      return BlockType.Dirt;
    }

    const runeChance = hashCoordinate(
      worldX,
      worldZ,
      this.#seed ^ Math.imul(worldY + 1, 2_246_822_519),
    );
    return runeChance > 0.997 ? BlockType.RuneStone : BlockType.Stone;
  }

  #sampleTreeBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    const cellX = Math.floor(worldX / TREE_CELL_SIZE);
    const cellZ = Math.floor(worldZ / TREE_CELL_SIZE);
    let leafCandidate = false;

    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const anchor = this.#getTreeAnchor(cellX + offsetX, cellZ + offsetZ);
        if (anchor === null) {
          continue;
        }
        const deltaX = worldX - anchor.x;
        const deltaZ = worldZ - anchor.z;
        const trunkTop = anchor.baseY + anchor.trunkHeight - 1;

        if (
          deltaX === 0 &&
          deltaZ === 0 &&
          worldY >= anchor.baseY &&
          worldY <= trunkTop
        ) {
          return BlockType.OakLog;
        }

        const vertical = worldY - trunkTop;
        if (vertical < -2 || vertical > 1) {
          continue;
        }
        const radius = vertical === 1 || vertical === -2 ? 1 : 2;
        if (
          Math.abs(deltaX) <= radius &&
          Math.abs(deltaZ) <= radius &&
          !(radius === 2 && Math.abs(deltaX) === 2 && Math.abs(deltaZ) === 2)
        ) {
          leafCandidate = true;
        }
      }
    }
    return leafCandidate ? BlockType.OakLeaves : BlockType.Air;
  }

  #getTreeAnchor(cellX: number, cellZ: number): TreeAnchor | null {
    const chance = hashCoordinate(cellX, cellZ, this.#seed ^ 0x1b873593);
    if (chance > TREE_CHANCE) {
      return null;
    }
    const xOffset = Math.floor(
      hashCoordinate(cellX, cellZ, this.#seed ^ 0x27d4eb2d) * TREE_CELL_SIZE,
    );
    const zOffset = Math.floor(
      hashCoordinate(cellX, cellZ, this.#seed ^ 0x165667b1) * TREE_CELL_SIZE,
    );
    const x = cellX * TREE_CELL_SIZE + xOffset;
    const z = cellZ * TREE_CELL_SIZE + zOffset;

    // Keep the initial spawn clearing readable and collision-safe.
    if (Math.hypot(x, z - 3.5) < 6.5) {
      return null;
    }

    const surfaceY = this.sampleSurfaceHeight(x, z);
    const trunkHeight =
      4 +
      Math.floor(hashCoordinate(cellX, cellZ, this.#seed ^ 0x85ebca77) * 2);
    return {
      x,
      z,
      baseY: surfaceY + 1,
      trunkHeight,
    };
  }
}
