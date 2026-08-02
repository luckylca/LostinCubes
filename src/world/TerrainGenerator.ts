import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  VoxelChunk,
} from './VoxelChunk';

const UINT32_MAX = 4_294_967_295;
const PLAYER_FOOT_OFFSET = 0.9;

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
    return Math.min(Math.max(height, 2), CHUNK_HEIGHT - 2);
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return BlockType.Air;
    }

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

        for (let localY = 0; localY <= surfaceHeight; localY += 1) {
          chunk.setBlock(
            localX,
            localY,
            localZ,
            this.sampleBlock(worldX, localY, worldZ),
          );
        }
      }
    }

    return chunk;
  }
}
