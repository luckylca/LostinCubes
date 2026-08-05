import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import {
  buildChunkLightField,
  lightLevelToBrightness,
} from '../src/world/VoxelLightEngine';

describe('VoxelLightEngine', () => {
  it('keeps unobstructed columns at full sky light', () => {
    const field = buildChunkLightField(0, 0, () => BlockType.Air);
    expect(field.sampleSky(0, 31, 0)).toBe(15);
    expect(field.sampleSky(0, 0, 0)).toBe(15);
    expect(field.sampleBlock(0, 10, 0)).toBe(0);
  });

  it('blocks direct sky below opaque roofs but lets adjacent entrances spread light', () => {
    const field = buildChunkLightField(0, 0, (x, y, z) => {
      if (x === 0 && z === 0 && y === 20) return BlockType.Stone;
      return BlockType.Air;
    });
    expect(field.sampleSky(0, 19, 0)).toBe(14);
    expect(field.sampleSky(0, 18, 0)).toBe(14);
  });

  it('propagates torch and dynamic furnace light one level per open voxel', () => {
    const field = buildChunkLightField(
      0,
      0,
      (x, y, z) =>
        x === 0 && y === 8 && z === 0 ? BlockType.Torch : BlockType.Air,
      [[6, 8, 0, 13]],
    );
    expect(field.sampleBlock(0, 8, 0)).toBe(14);
    expect(field.sampleBlock(1, 8, 0)).toBe(13);
    expect(field.sampleBlock(2, 8, 0)).toBe(12);
    expect(field.sampleBlock(6, 8, 0)).toBe(13);
    expect(field.sampleBlock(7, 8, 0)).toBe(12);
  });

  it('converts level zero to a readable minimum and level fifteen to full brightness', () => {
    expect(lightLevelToBrightness(0)).toBeCloseTo(0.18);
    expect(lightLevelToBrightness(15)).toBe(1);
  });
});
