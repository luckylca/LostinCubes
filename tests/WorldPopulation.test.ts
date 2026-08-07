import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import {
  sampleCaveSpringBlock,
  sampleDungeonBlock,
} from '../src/world/WorldPopulation';

const TEST_SEED = 0x5f37_59df;

function findDungeonSample(): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} | null {
  for (let cellZ = -4; cellZ <= 4; cellZ += 1) {
    for (let cellX = -4; cellX <= 4; cellX += 1) {
      const originX = cellX * 32;
      const originZ = cellZ * 32;
      for (let z = originZ + 5; z < originZ + 27; z += 1) {
        for (let x = originX + 5; x < originX + 27; x += 1) {
          for (let y = 4; y <= 13; y += 1) {
            if (sampleDungeonBlock(x, y, z, 28, TEST_SEED) !== null) {
              return { x, y, z };
            }
          }
        }
      }
    }
  }
  return null;
}

describe('world population', () => {
  it('creates a deterministic carved dungeon with masonry and interior air', () => {
    const sample = findDungeonSample();
    expect(sample).not.toBeNull();
    if (sample === null) return;

    const cellX = Math.floor(sample.x / 32);
    const cellZ = Math.floor(sample.z / 32);
    const blocks = new Set<number>();
    for (let z = cellZ * 32; z < (cellZ + 1) * 32; z += 1) {
      for (let x = cellX * 32; x < (cellX + 1) * 32; x += 1) {
        for (let y = 4; y <= 14; y += 1) {
          const block = sampleDungeonBlock(x, y, z, 28, TEST_SEED);
          if (block !== null) blocks.add(block);
        }
      }
    }

    expect(blocks.has(BlockType.Cobblestone)).toBe(true);
    expect(blocks.has(BlockType.RuneStone)).toBe(true);
    expect(blocks.has(BlockType.Air)).toBe(true);
    expect(blocks.has(BlockType.Torch)).toBe(true);
  });

  it('places deterministic cave-ceiling springs into a clear cave column', () => {
    let spring: number | null = null;
    for (let z = -32; z <= 32 && spring === null; z += 1) {
      for (let x = -32; x <= 32 && spring === null; x += 1) {
        spring = sampleCaveSpringBlock(
          x,
          4,
          z,
          20,
          TEST_SEED,
          8,
          4,
          (worldY) => worldY >= 4 && worldY <= 9,
        );
      }
    }

    expect(spring === BlockType.Water || spring === BlockType.Lava).toBe(true);
  });
});
