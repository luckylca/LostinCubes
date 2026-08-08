import { BiomeType } from './BiomeDefinition';
import type { BiomeType as BiomeTypeValue } from './BiomeDefinition';
import { TerrainGenerator } from './TerrainGenerator';
import { CHUNK_HEIGHT } from './VoxelChunk';

const UINT32_MAX = 4_294_967_295;
const INSTANCE_SEED = new WeakMap<TerrainGenerator, number>();
let installed = false;

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

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sz = z / scale;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const tx = smoothStep(sx - x0);
  const tz = smoothStep(sz - z0);
  const near = mix(
    hashCoordinate(x0, z0, seed),
    hashCoordinate(x0 + 1, z0, seed),
    tx,
  );
  const far = mix(
    hashCoordinate(x0, z0 + 1, seed),
    hashCoordinate(x0 + 1, z0 + 1, seed),
    tx,
  );
  return mix(near, far, tz);
}

function instanceSeed(
  generator: TerrainGenerator,
  originalHeight: (this: TerrainGenerator, x: number, z: number) => number,
): number {
  const existing = INSTANCE_SEED.get(generator);
  if (existing !== undefined) return existing;
  // The original generator already depends on the world's private seed. Sample
  // a few distant points to derive a stable fingerprint without exposing it.
  const a = originalHeight.call(generator, 511, -347);
  const b = originalHeight.call(generator, -283, 619);
  const c = originalHeight.call(generator, 887, 271);
  let seed = 2_166_136_261;
  seed ^= Math.imul(Math.round(a * 101), 16_777_619);
  seed ^= Math.imul(Math.round(b * 211), 668_265_263);
  seed ^= Math.imul(Math.round(c * 307), 374_761_393);
  seed >>>= 0;
  INSTANCE_SEED.set(generator, seed);
  return seed;
}

/**
 * Makes broad plains shorter and adds rolling relief without replacing the
 * continuous v0.4.2 terrain equation. It deliberately patches public sampling
 * methods, so sampleBlock() and generateChunk() still use one consistent height
 * function and biome boundary heights remain continuous.
 */
export function installTerrainVarietyRuntime(): void {
  if (installed) return;
  installed = true;

  const originalHeight = TerrainGenerator.prototype.sampleSurfaceHeight;
  const originalBiome = TerrainGenerator.prototype.sampleBiome;

  TerrainGenerator.prototype.sampleSurfaceHeight = function variedHeight(
    worldX: number,
    worldZ: number,
  ): number {
    const base = originalHeight.call(this, worldX, worldZ);
    const seed = instanceSeed(this, originalHeight);
    const regional = valueNoise(worldX, worldZ, 84, seed ^ 0x7f4a7c15);
    const rolling = valueNoise(worldX, worldZ, 34, seed ^ 0x9e3779b9);
    const detail = valueNoise(worldX, worldZ, 13, seed ^ 0x85ebca6b);
    const ridge = 1 - Math.abs(valueNoise(worldX, worldZ, 27, seed ^ 0xc2b2ae35) * 2 - 1);

    const spawnDistance = Math.hypot(worldX, worldZ - 3.5);
    const spawnBlend = Math.min(Math.max((spawnDistance - 14) / 22, 0), 1);
    const hillWeight = smoothStep(Math.min(Math.max((regional - 0.5) / 0.36, 0), 1));
    const relief =
      (rolling - 0.5) * 3.4 +
      (detail - 0.5) * 1.35 +
      hillWeight * (ridge * ridge * 3.6 - 0.8);
    const height = Math.round(base + relief * spawnBlend);
    return Math.min(Math.max(height, 2), CHUNK_HEIGHT - 8);
  };

  TerrainGenerator.prototype.sampleBiome = function variedBiome(
    worldX: number,
    worldZ: number,
  ): BiomeTypeValue {
    const base = originalBiome.call(this, worldX, worldZ);
    if (base !== BiomeType.Plains) return base;
    if (Math.hypot(worldX, worldZ - 3.5) < 20) return base;

    const seed = instanceSeed(this, originalHeight);
    const region = valueNoise(worldX, worldZ, 92, seed ^ 0x27d4eb2d);
    const moisture = valueNoise(worldX, worldZ, 76, seed ^ 0x165667b1);
    const temperature = valueNoise(worldX, worldZ, 118, seed ^ 0x6d2b79f5);

    if (region > 0.76) {
      return temperature < 0.34
        ? BiomeType.SnowyMountains
        : BiomeType.Mountains;
    }
    if (temperature < 0.24 && region < 0.62) return BiomeType.SnowyTundra;
    if (temperature > 0.68 && moisture < 0.4) return BiomeType.Desert;
    if (moisture > 0.65 && region < 0.7) return BiomeType.Forest;
    if (moisture > 0.78 && temperature > 0.38 && temperature < 0.7) {
      return BiomeType.Swamp;
    }
    return base;
  };
}
