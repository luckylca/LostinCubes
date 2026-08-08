import {
  BiomeType,
  getBiomeDefinition,
} from './BiomeDefinition';
import type { BiomeType as BiomeTypeValue } from './BiomeDefinition';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { CHUNK_HEIGHT, CHUNK_SIZE, VoxelChunk } from './VoxelChunk';
import {
  sampleCaveSpringBlock,
  sampleDungeonBlock,
} from './WorldPopulation';

const UINT32_MAX = 4_294_967_295;
const PLAYER_FOOT_OFFSET = 0.9;
const TREE_CELL_SIZE = 7;
const TREE_STRUCTURE_HEIGHT = 8;
const SPAWN_CLEAR_RADIUS = 7.5;
const MAXIMUM_CANOPY_RADIUS = 2;
const CAVE_SURFACE_BUFFER = 4;
const BEACH_DEPTH = 3;

export const SEA_LEVEL = 8;
export const LAVA_LEVEL = 4;

interface TreeAnchor {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly trunkHeight: number;
}

interface ClimateFields {
  readonly temperature: number;
  readonly moisture: number;
  readonly continentality: number;
  readonly uplift: number;
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

function hashCoordinate3d(x: number, y: number, z: number, seed: number): number {
  let hash = seed;
  hash ^= Math.imul(x, 374_761_393);
  hash ^= Math.imul(y, 1_274_126_177);
  hash ^= Math.imul(z, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 15), 2_246_822_519);
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_MAX;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothRange(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const normalized = Math.min(Math.max((value - minimum) / (maximum - minimum), 0), 1);
  return smoothStep(normalized);
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

function sampleRidgedNoise(
  worldX: number,
  worldZ: number,
  scale: number,
  seed: number,
): number {
  const value = sampleValueNoise(worldX, worldZ, scale, seed);
  return 1 - Math.abs(value * 2 - 1);
}

function sampleValueNoise3d(
  worldX: number,
  worldY: number,
  worldZ: number,
  scale: number,
  seed: number,
): number {
  const scaledX = worldX / scale;
  const scaledY = worldY / scale;
  const scaledZ = worldZ / scale;
  const x0 = Math.floor(scaledX);
  const y0 = Math.floor(scaledY);
  const z0 = Math.floor(scaledZ);
  const tx = smoothStep(scaledX - x0);
  const ty = smoothStep(scaledY - y0);
  const tz = smoothStep(scaledZ - z0);
  const layer = (y: number): number => {
    const near = interpolate(
      hashCoordinate3d(x0, y, z0, seed),
      hashCoordinate3d(x0 + 1, y, z0, seed),
      tx,
    );
    const far = interpolate(
      hashCoordinate3d(x0, y, z0 + 1, seed),
      hashCoordinate3d(x0 + 1, y, z0 + 1, seed),
      tx,
    );
    return interpolate(near, far, tz);
  };
  return interpolate(layer(y0), layer(y0 + 1), ty);
}

export class TerrainGenerator {
  readonly #seed: number;

  public constructor(worldSeed: string) {
    this.#seed = hashWorldSeed(worldSeed);
  }

  public sampleBiome(worldX: number, worldZ: number): BiomeTypeValue {
    if (Math.hypot(worldX, worldZ - 3.5) < SPAWN_CLEAR_RADIUS + 6) {
      return BiomeType.Plains;
    }

    const { temperature, moisture, continentality, uplift } =
      this.#sampleClimate(worldX, worldZ);

    if (uplift > 0.72 && continentality > 0.43) {
      return temperature < 0.4
        ? BiomeType.SnowyMountains
        : BiomeType.Mountains;
    }
    if (temperature < 0.3) return BiomeType.SnowyTundra;
    if (temperature > 0.62 && moisture < 0.44) return BiomeType.Desert;
    if (
      moisture > 0.68 &&
      temperature > 0.34 &&
      temperature < 0.72 &&
      continentality < 0.58
    ) {
      return BiomeType.Swamp;
    }
    if (moisture > 0.53) return BiomeType.Forest;
    return BiomeType.Plains;
  }

  /**
   * Height is intentionally independent from the categorical biome switch.
   * Biomes choose blocks/vegetation; continuous climate weights shape terrain.
   * This prevents a biome border (including the forced spawn plains ring) from
   * turning into an artificial cliff or suddenly perfectly flat plateau.
   */
  public sampleSurfaceHeight(worldX: number, worldZ: number): number {
    const climate = this.#sampleClimate(worldX, worldZ);
    const continent = sampleValueNoise(
      worldX,
      worldZ,
      168,
      this.#seed ^ 0x6d2b79f5,
    );
    const hills = sampleValueNoise(
      worldX,
      worldZ,
      48,
      this.#seed ^ 0x9e3779b9,
    );
    const detail = sampleValueNoise(
      worldX,
      worldZ,
      14,
      this.#seed ^ 0x85ebca6b,
    );
    const ridge = sampleRidgedNoise(
      worldX,
      worldZ,
      34,
      this.#seed ^ 0xc2b2ae35,
    );
    const dune = sampleValueNoise(
      worldX,
      worldZ,
      22,
      this.#seed ^ 0x27d4eb2d,
    );

    // A gently rolling base exists everywhere, including plains. Region types
    // add smooth influences instead of swapping the whole equation at a border.
    let rawHeight =
      9.4 +
      (continent - 0.5) * 5.2 +
      (hills - 0.5) * 3.2 +
      (detail - 0.5) * 1.25;

    const mountainWeight =
      smoothRange(climate.uplift, 0.6, 0.78) *
      smoothRange(climate.continentality, 0.36, 0.58);
    const mountainRelief =
      ridge * ridge * 12.5 +
      (hills - 0.5) * 4.2 +
      (detail - 0.5) * 2.1 -
      1.8;
    rawHeight += mountainWeight * mountainRelief;

    const desertWeight =
      smoothRange(climate.temperature, 0.56, 0.72) *
      (1 - smoothRange(climate.moisture, 0.36, 0.5));
    rawHeight +=
      desertWeight * ((dune - 0.5) * 3.6 + (detail - 0.5) * 1.2);

    const coldWeight = 1 - smoothRange(climate.temperature, 0.24, 0.37);
    rawHeight += coldWeight * (hills - 0.5) * 1.1;

    const swampWeight =
      smoothRange(climate.moisture, 0.62, 0.79) *
      smoothRange(climate.temperature, 0.3, 0.42) *
      (1 - smoothRange(climate.temperature, 0.68, 0.8)) *
      (1 - smoothRange(climate.continentality, 0.48, 0.66));
    const swampHeight =
      SEA_LEVEL - 0.25 +
      (continent - 0.5) * 1.2 +
      (detail - 0.5) * 1.45;
    rawHeight = interpolate(rawHeight, swampHeight, swampWeight * 0.88);

    // Keep a comfortable spawn region without introducing the old hard ring.
    // The blend extends well beyond the tree clearing and still retains a small
    // amount of relief so the start area never becomes a featureless plane.
    const spawnDistance = Math.hypot(worldX, worldZ - 3.5);
    const spawnBlend =
      1 - smoothRange(spawnDistance, SPAWN_CLEAR_RADIUS + 1, SPAWN_CLEAR_RADIUS + 11);
    const spawnHeight =
      SEA_LEVEL + 1.2 +
      (hills - 0.5) * 1.25 +
      (detail - 0.5) * 0.55;
    rawHeight = interpolate(rawHeight, spawnHeight, spawnBlend);

    const height = Math.floor(rawHeight);
    return Math.min(
      Math.max(height, 2),
      CHUNK_HEIGHT - TREE_STRUCTURE_HEIGHT,
    );
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.Air;

    const surfaceHeight = this.sampleSurfaceHeight(worldX, worldZ);
    const biome = this.sampleBiome(worldX, worldZ);
    const dungeon = sampleDungeonBlock(
      worldX,
      worldY,
      worldZ,
      surfaceHeight,
      this.#seed,
    );
    if (dungeon !== null) return dungeon;

    const terrain = this.#sampleTerrainBlock(
      worldX,
      worldY,
      worldZ,
      surfaceHeight,
      biome,
    );
    if (terrain !== BlockType.Air) return terrain;

    if (worldY <= SEA_LEVEL && worldY > surfaceHeight) {
      return BlockType.Water;
    }

    if (worldY <= surfaceHeight || surfaceHeight <= SEA_LEVEL) {
      return BlockType.Air;
    }

    const tree = this.#sampleTreeBlock(worldX, worldY, worldZ);
    if (tree !== BlockType.Air) return tree;
    return this.#samplePlantBlock(
      worldX,
      worldY,
      worldZ,
      surfaceHeight,
      biome,
    );
  }

  public sampleStandingY(worldX: number, worldZ: number): number {
    const blockX = Math.floor(worldX);
    const blockZ = Math.floor(worldZ);
    return this.sampleSurfaceHeight(blockX, blockZ) + 0.5 + PLAYER_FOOT_OFFSET;
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
          Math.max(SEA_LEVEL, surfaceHeight + TREE_STRUCTURE_HEIGHT),
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

  #sampleClimate(worldX: number, worldZ: number): ClimateFields {
    return {
      temperature: sampleValueNoise(
        worldX,
        worldZ,
        220,
        this.#seed ^ 0x27d4eb2d,
      ),
      moisture: sampleValueNoise(
        worldX,
        worldZ,
        190,
        this.#seed ^ 0x165667b1,
      ),
      continentality: sampleValueNoise(
        worldX,
        worldZ,
        260,
        this.#seed ^ 0x9e3779b9,
      ),
      uplift: sampleValueNoise(
        worldX,
        worldZ,
        132,
        this.#seed ^ 0x7f4a7c15,
      ),
    };
  }

  #sampleTerrainBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    surfaceHeight: number,
    biome: BiomeTypeValue,
  ): BlockTypeValue {
    if (worldY > surfaceHeight) return BlockType.Air;

    if (this.#isCave(worldX, worldY, worldZ, surfaceHeight)) {
      const spring = sampleCaveSpringBlock(
        worldX,
        worldY,
        worldZ,
        surfaceHeight,
        this.#seed,
        SEA_LEVEL,
        LAVA_LEVEL,
        (candidateY) =>
          this.#isCave(worldX, candidateY, worldZ, surfaceHeight),
      );
      if (spring !== null) return spring;
      if (
        worldY <= LAVA_LEVEL &&
        sampleValueNoise3d(
          worldX,
          worldY,
          worldZ,
          5.4,
          this.#seed ^ 0xc2b2ae35,
        ) > 0.52
      ) {
        return BlockType.Lava;
      }
      return BlockType.Air;
    }

    const definition = getBiomeDefinition(biome);
    const submerged = surfaceHeight < SEA_LEVEL;
    if (worldY === surfaceHeight) {
      if (submerged) return this.#sampleRiverbedBlock(worldX, worldZ);
      if (surfaceHeight <= SEA_LEVEL + 1 && !definition.freezesSurface) {
        return BlockType.Sand;
      }
      return definition.surfaceBlock;
    }
    if (worldY >= surfaceHeight - BEACH_DEPTH) {
      if (submerged || biome === BiomeType.Desert) return BlockType.Sand;
      return definition.fillerBlock;
    }

    const oreNoise = sampleValueNoise3d(
      worldX,
      worldY,
      worldZ,
      2.4,
      this.#seed ^ 0x52dce729,
    );
    const oreDetail = hashCoordinate3d(
      worldX,
      worldY,
      worldZ,
      this.#seed ^ 0x38495ab5,
    );
    if (worldY <= 12 && oreNoise > 0.69 && oreDetail > 0.34) {
      return BlockType.IronOre;
    }
    if (worldY <= 22 && oreNoise < 0.31 && oreDetail > 0.25) {
      return BlockType.CoalOre;
    }

    const gravelNoise = sampleValueNoise3d(
      worldX,
      worldY,
      worldZ,
      3.2,
      this.#seed ^ 0x6d2b79f5,
    );
    if (worldY < surfaceHeight - 3 && gravelNoise > 0.79) {
      return BlockType.Gravel;
    }

    const runeChance = hashCoordinate(
      worldX,
      worldZ,
      this.#seed ^ Math.imul(worldY + 1, 2_246_822_519),
    );
    return runeChance > 0.997 ? BlockType.RuneStone : BlockType.Stone;
  }

  #sampleRiverbedBlock(worldX: number, worldZ: number): BlockTypeValue {
    const patch = sampleValueNoise(
      worldX,
      worldZ,
      5.5,
      this.#seed ^ 0x94d049bb,
    );
    if (patch > 0.72) return BlockType.Clay;
    if (patch < 0.23) return BlockType.Gravel;
    return BlockType.Sand;
  }

  #isCave(
    worldX: number,
    worldY: number,
    worldZ: number,
    surfaceHeight: number,
  ): boolean {
    if (worldY <= 1 || worldY > surfaceHeight - CAVE_SURFACE_BUFFER) {
      return false;
    }
    const broad = sampleValueNoise3d(
      worldX,
      worldY * 1.35,
      worldZ,
      9,
      this.#seed ^ 0x7f4a7c15,
    );
    const detail = sampleValueNoise3d(
      worldX,
      worldY,
      worldZ,
      4.2,
      this.#seed ^ 0x94d049bb,
    );
    const depthBias =
      Math.min(Math.max((surfaceHeight - worldY) / 18, 0), 1) * 0.045;
    return broad * 0.72 + detail * 0.28 > 0.72 - depthBias;
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
        if (anchor === null) continue;
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
        if (vertical < -2 || vertical > 1) continue;
        const radius = vertical === 1 || vertical === -2 ? 1 : 2;
        if (
          Math.abs(deltaX) <= radius &&
          Math.abs(deltaZ) <= radius &&
          !(
            radius === 2 &&
            Math.abs(deltaX) === 2 &&
            Math.abs(deltaZ) === 2
          )
        ) {
          leafCandidate = true;
        }
      }
    }
    return leafCandidate ? BlockType.OakLeaves : BlockType.Air;
  }

  #samplePlantBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    surfaceHeight: number,
    biome: BiomeTypeValue,
  ): BlockTypeValue {
    if (worldY !== surfaceHeight + 1) return BlockType.Air;
    const definition = getBiomeDefinition(biome);
    const roll = hashCoordinate(
      worldX,
      worldZ,
      this.#seed ^ 0x51ed270b,
    );
    if (roll < definition.flowerChance) return BlockType.Dandelion;
    if (roll < definition.flowerChance + definition.tallGrassChance) {
      return BlockType.TallGrass;
    }
    return BlockType.Air;
  }

  #getTreeAnchor(cellX: number, cellZ: number): TreeAnchor | null {
    const xOffset = Math.floor(
      hashCoordinate(cellX, cellZ, this.#seed ^ 0x27d4eb2d) * TREE_CELL_SIZE,
    );
    const zOffset = Math.floor(
      hashCoordinate(cellX, cellZ, this.#seed ^ 0x165667b1) * TREE_CELL_SIZE,
    );
    const x = cellX * TREE_CELL_SIZE + xOffset;
    const z = cellZ * TREE_CELL_SIZE + zOffset;
    if (
      Math.hypot(x, z - 3.5) <
      SPAWN_CLEAR_RADIUS + MAXIMUM_CANOPY_RADIUS
    ) {
      return null;
    }
    const biome = this.sampleBiome(x, z);
    const definition = getBiomeDefinition(biome);
    if (definition.treeChance <= 0) return null;
    const chance = hashCoordinate(cellX, cellZ, this.#seed ^ 0x1b873593);
    if (chance > definition.treeChance) return null;
    const surfaceY = this.sampleSurfaceHeight(x, z);
    if (surfaceY <= SEA_LEVEL) return null;
    const trunkHeight =
      4 +
      Math.floor(
        hashCoordinate(cellX, cellZ, this.#seed ^ 0x85ebca77) * 2,
      );
    return { x, z, baseY: surfaceY + 1, trunkHeight };
  }
}
