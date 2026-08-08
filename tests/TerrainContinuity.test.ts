import { describe, expect, it } from 'vitest';
import { BiomeType } from '../src/world/BiomeDefinition';
import { TerrainGenerator } from '../src/world/TerrainGenerator';

describe('terrain continuity', () => {
  it('does not create artificial cliffs when the categorical biome changes', () => {
    const terrain = new TerrainGenerator('terrain-continuity-test');
    let biomeBoundaries = 0;
    let maximumBoundaryStep = 0;

    for (let worldX = -384; worldX <= 384; worldX += 2) {
      for (let worldZ = -384; worldZ <= 384; worldZ += 2) {
        const biome = terrain.sampleBiome(worldX, worldZ);
        const height = terrain.sampleSurfaceHeight(worldX, worldZ);
        for (const [nextX, nextZ] of [
          [worldX + 1, worldZ],
          [worldX, worldZ + 1],
        ] as const) {
          if (terrain.sampleBiome(nextX, nextZ) === biome) continue;
          biomeBoundaries += 1;
          maximumBoundaryStep = Math.max(
            maximumBoundaryStep,
            Math.abs(
              height - terrain.sampleSurfaceHeight(nextX, nextZ),
            ),
          );
        }
      }
    }

    expect(biomeBoundaries).toBeGreaterThan(20);
    expect(maximumBoundaryStep).toBeLessThanOrEqual(3);
  });

  it('keeps plains gently rolling instead of collapsing into a featureless plane', () => {
    const terrain = new TerrainGenerator('terrain-plains-relief-test');
    const heights: number[] = [];

    for (let worldX = -512; worldX <= 512; worldX += 8) {
      for (let worldZ = -512; worldZ <= 512; worldZ += 8) {
        if (Math.hypot(worldX, worldZ - 3.5) < 32) continue;
        if (terrain.sampleBiome(worldX, worldZ) !== BiomeType.Plains) continue;
        heights.push(terrain.sampleSurfaceHeight(worldX, worldZ));
      }
    }

    expect(heights.length).toBeGreaterThan(40);
    expect(new Set(heights).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(3);
  });
});
