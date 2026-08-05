import { afterEach, describe, expect, it } from 'vitest';
import { BiomeType } from '../src/world/BiomeDefinition';
import { BlockType } from '../src/world/BlockType';
import {
  registerFurnaceLightRuntime,
  syncBurningFurnaceLights,
  unregisterFurnaceLightRuntime,
} from '../src/world/FurnaceLightRuntime';

interface LightCall {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly level: number;
}

describe('FurnaceLightRuntime', () => {
  const calls: LightCall[] = [];
  const invalidations: string[] = [];
  const world = {
    worldSeed: 'furnace-light-test',
    sampleBlock: () => BlockType.Air,
    sampleBiome: () => BiomeType.Plains,
    isSolidAt: () => false,
    isWaterAt: () => false,
    isLavaAt: () => false,
    isClimbableAt: () => false,
    setBlock: () => false,
    setDynamicLight(x: number, y: number, z: number, level: number): boolean {
      calls.push({ x, y, z, level });
      return true;
    },
  };
  const renderer = {
    invalidateBlock: () => undefined,
    invalidateLightEmitter(x: number, z: number): void {
      invalidations.push(`${String(x)},${String(z)}`);
    },
  };

  afterEach(() => {
    unregisterFurnaceLightRuntime(renderer);
    calls.length = 0;
    invalidations.length = 0;
  });

  it('adds, preserves, and removes coordinate light only on source transitions', () => {
    registerFurnaceLightRuntime(world, renderer);
    syncBurningFurnaceLights([{ x: 3, y: 7, z: -2 }], 13);
    expect(calls).toEqual([{ x: 3, y: 7, z: -2, level: 13 }]);
    expect(invalidations).toEqual(['3,-2']);

    syncBurningFurnaceLights([{ x: 3, y: 7, z: -2 }], 13);
    expect(calls).toHaveLength(1);
    expect(invalidations).toHaveLength(1);

    syncBurningFurnaceLights([], 13);
    expect(calls.at(-1)).toEqual({ x: 3, y: 7, z: -2, level: 0 });
    expect(invalidations).toEqual(['3,-2', '3,-2']);
  });

  it('retains restored desired sources until the renderer registers', () => {
    syncBurningFurnaceLights([{ x: 8, y: 4, z: 9 }], 13);
    expect(calls).toEqual([]);

    registerFurnaceLightRuntime(world, renderer);
    expect(calls).toEqual([{ x: 8, y: 4, z: 9, level: 13 }]);
    expect(invalidations).toEqual(['8,9']);
  });
});
