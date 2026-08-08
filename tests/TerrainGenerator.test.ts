import { describe, expect, it } from 'vitest';
import { BiomeType } from '../src/world/BiomeDefinition';
import { isSolidBlock } from '../src/world/BlockRegistry';
import { BlockType } from '../src/world/BlockType';
import {
  LAVA_LEVEL,
  SEA_LEVEL,
  TerrainGenerator,
  hashWorldSeed,
} from '../src/world/TerrainGenerator';

describe('TerrainGenerator', () => {
  it('produces identical chunks for the same world seed', () => {
    const first = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);
    const second = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);
    expect(first.copyBlocks()).toEqual(second.copyBlocks());
  });

  it('changes generated terrain, caves, and biome layout when the seed changes', () => {
    const first = new TerrainGenerator('fragment-seed-a').generateChunk(0, 0);
    const second = new TerrainGenerator('fragment-seed-b').generateChunk(0, 0);
    expect(first.copyBlocks()).not.toEqual(second.copyBlocks());
    expect(hashWorldSeed('fragment-seed-a')).not.toBe(
      hashWorldSeed('fragment-seed-b'),
    );
  });

  it('keeps a solid protected surface across land and seabed columns', () => {
    const terrain = new TerrainGenerator('surface-test');
    for (let worldX = -48; worldX <= 48; worldX += 3) {
      for (let worldZ = -48; worldZ <= 48; worldZ += 3) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        const surfaceBlock = terrain.sampleBlock(worldX, surface, worldZ);
        expect(isSolidBlock(surfaceBlock)).toBe(true);
        if (surface >= 3) {
          const protectedBlock = terrain.sampleBlock(
            worldX,
            surface - 3,
            worldZ,
          );
          expect(protectedBlock).not.toBe(BlockType.Air);
          expect(protectedBlock).not.toBe(BlockType.Lava);
        }
      }
    }
  });

  it('carves deterministic underground caves without opening the protected shell', () => {
    const terrain = new TerrainGenerator('cave-test');
    let caves = 0;
    for (let worldX = -36; worldX <= 36; worldX += 1) {
      for (let worldZ = -36; worldZ <= 36; worldZ += 1) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        for (let worldY = 2; worldY <= surface - 4; worldY += 1) {
          const block = terrain.sampleBlock(worldX, worldY, worldZ);
          caves +=
            block === BlockType.Air || block === BlockType.Lava ? 1 : 0;
        }
        if (surface >= 3) {
          const protectedBlock = terrain.sampleBlock(
            worldX,
            surface - 3,
            worldZ,
          );
          expect(protectedBlock).not.toBe(BlockType.Air);
          expect(protectedBlock).not.toBe(BlockType.Lava);
        }
      }
    }
    expect(caves).toBeGreaterThan(20);
  });

  it('places coal above and below iron while keeping both underground', () => {
    const terrain = new TerrainGenerator('ore-test');
    let coal = 0;
    let iron = 0;
    let highestIron = -1;
    let highestCoal = -1;
    for (let worldX = -40; worldX <= 40; worldX += 1) {
      for (let worldZ = -40; worldZ <= 40; worldZ += 1) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        for (let worldY = 2; worldY < surface - 3; worldY += 1) {
          const block = terrain.sampleBlock(worldX, worldY, worldZ);
          if (block === BlockType.CoalOre) {
            coal += 1;
            highestCoal = Math.max(highestCoal, worldY);
          } else if (block === BlockType.IronOre) {
            iron += 1;
            highestIron = Math.max(highestIron, worldY);
          }
        }
      }
    }
    expect(coal).toBeGreaterThan(20);
    expect(iron).toBeGreaterThan(10);
    expect(highestIron).toBeLessThanOrEqual(12);
    expect(highestCoal).toBeLessThanOrEqual(22);
    expect(highestCoal).toBeGreaterThanOrEqual(highestIron);
  });

  it('generates real log trunks and leaf canopies above forest terrain', () => {
    const terrain = new TerrainGenerator('forest-test');
    let logs = 0;
    let leaves = 0;
    for (let worldX = -64; worldX <= 64; worldX += 1) {
      for (let worldZ = -64; worldZ <= 64; worldZ += 1) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        for (let worldY = surface + 1; worldY <= surface + 8; worldY += 1) {
          const block = terrain.sampleBlock(worldX, worldY, worldZ);
          logs += block === BlockType.OakLog ? 1 : 0;
          leaves += block === BlockType.OakLeaves ? 1 : 0;
        }
      }
    }
    expect(logs).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(logs);
  });

  it('keeps the initial spawn clearing free of trunks and canopies', () => {
    const terrain = new TerrainGenerator('world-fragment-01');
    for (let worldX = -4; worldX <= 4; worldX += 1) {
      for (let worldZ = 0; worldZ <= 7; worldZ += 1) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        expect(surface).toBeGreaterThan(SEA_LEVEL);
        for (let worldY = surface + 1; worldY <= surface + 8; worldY += 1) {
          const block = terrain.sampleBlock(worldX, worldY, worldZ);
          expect(block).not.toBe(BlockType.OakLog);
          expect(block).not.toBe(BlockType.OakLeaves);
        }
      }
    }
  });

  it('samples a solid spawn surface and matching player standing height', () => {
    const terrain = new TerrainGenerator('standing-test');
    const surface = terrain.sampleSurfaceHeight(0, 3);
    const surfaceBlock = terrain.sampleBlock(0, surface, 3);
    expect(terrain.sampleBiome(0, 3)).toBe(BiomeType.Plains);
    expect(isSolidBlock(surfaceBlock)).toBe(true);
    expect(surface).toBeGreaterThan(SEA_LEVEL);
    expect(terrain.sampleStandingY(0.2, 3.8)).toBeCloseTo(
      terrain.sampleSurfaceHeight(0, 3) + 1.4,
    );
  });

  it('produces seven broad biomes with genuinely different relief profiles', () => {
    const terrain = new TerrainGenerator('biome-ocean-test');
    const biomes = new Set<string>();
    const heights = new Map<string, number[]>();
    let waterColumns = 0;

    for (let worldX = -2048; worldX <= 2048; worldX += 32) {
      for (let worldZ = -2048; worldZ <= 2048; worldZ += 32) {
        const biome = terrain.sampleBiome(worldX, worldZ);
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        biomes.add(biome);
        const values = heights.get(biome) ?? [];
        values.push(surface);
        heights.set(biome, values);
        if (surface < SEA_LEVEL) {
          expect(terrain.sampleBlock(worldX, SEA_LEVEL, worldZ)).toBe(
            BlockType.Water,
          );
          waterColumns += 1;
        }
      }
    }

    expect(biomes).toEqual(
      new Set([
        BiomeType.Plains,
        BiomeType.Forest,
        BiomeType.Desert,
        BiomeType.Swamp,
        BiomeType.Mountains,
        BiomeType.SnowyTundra,
        BiomeType.SnowyMountains,
      ]),
    );
    const mountainHeights = [
      ...(heights.get(BiomeType.Mountains) ?? []),
      ...(heights.get(BiomeType.SnowyMountains) ?? []),
    ];
    const swampHeights = heights.get(BiomeType.Swamp) ?? [];
    expect(Math.max(...mountainHeights)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...mountainHeights) - Math.min(...mountainHeights)).toBeGreaterThanOrEqual(8);
    expect(
      swampHeights.reduce((sum, value) => sum + value, 0) /
        Math.max(swampHeights.length, 1),
    ).toBeLessThanOrEqual(SEA_LEVEL + 1);
    expect(waterColumns).toBeGreaterThan(0);
  });

  it('places luminous lava only in deep carved cave space', () => {
    const terrain = new TerrainGenerator('deep-lava-test');
    let lava = 0;
    for (let worldX = -96; worldX <= 96; worldX += 1) {
      for (let worldZ = -96; worldZ <= 96; worldZ += 1) {
        for (let worldY = 2; worldY <= LAVA_LEVEL; worldY += 1) {
          if (
            terrain.sampleBlock(worldX, worldY, worldZ) === BlockType.Lava
          ) {
            lava += 1;
          }
        }
      }
    }
    expect(lava).toBeGreaterThan(0);
  });
});
