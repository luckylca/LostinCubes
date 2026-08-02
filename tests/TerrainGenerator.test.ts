import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { TerrainGenerator, hashWorldSeed } from '../src/world/TerrainGenerator';
import { CHUNK_SIZE } from '../src/world/VoxelChunk';

describe('TerrainGenerator', () => {
  it('produces identical chunks for the same world seed', () => {
    const first = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);
    const second = new TerrainGenerator('fragment-seed').generateChunk(-1, 2);

    expect(first.copyBlocks()).toEqual(second.copyBlocks());
  });

  it('changes generated terrain and forest layout when the seed changes', () => {
    const first = new TerrainGenerator('fragment-seed-a').generateChunk(0, 0);
    const second = new TerrainGenerator('fragment-seed-b').generateChunk(0, 0);

    expect(first.copyBlocks()).not.toEqual(second.copyBlocks());
    expect(hashWorldSeed('fragment-seed-a')).not.toBe(
      hashWorldSeed('fragment-seed-b'),
    );
  });

  it('keeps one grass terrain surface for every horizontal column', () => {
    const chunk = new TerrainGenerator('surface-test').generateChunk(1, -3);

    expect(chunk.countBlocks(BlockType.Grass)).toBe(CHUNK_SIZE * CHUNK_SIZE);
    expect(chunk.countBlocks(BlockType.Stone)).toBeGreaterThan(0);
    expect(chunk.countBlocks(BlockType.Dirt)).toBeGreaterThan(0);
  });

  it('generates real log trunks and leaf canopies above terrain', () => {
    const terrain = new TerrainGenerator('forest-test');
    let logs = 0;
    let leaves = 0;

    for (let worldX = -32; worldX <= 32; worldX += 1) {
      for (let worldZ = -32; worldZ <= 32; worldZ += 1) {
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

  it('keeps the initial spawn clearing free of trees', () => {
    const terrain = new TerrainGenerator('world-fragment-01');
    for (let worldX = -4; worldX <= 4; worldX += 1) {
      for (let worldZ = 0; worldZ <= 7; worldZ += 1) {
        const surface = terrain.sampleSurfaceHeight(worldX, worldZ);
        for (let worldY = surface + 1; worldY <= surface + 8; worldY += 1) {
          expect(terrain.sampleBlock(worldX, worldY, worldZ)).toBe(BlockType.Air);
        }
      }
    }
  });

  it('samples matching surface blocks and player standing heights', () => {
    const terrain = new TerrainGenerator('standing-test');
    const surface = terrain.sampleSurfaceHeight(0, 3);

    expect(terrain.sampleBlock(0, surface, 3)).toBe(BlockType.Grass);
    expect(terrain.sampleBlock(0, surface - 1, 3)).toBe(BlockType.Dirt);
    expect(terrain.sampleStandingY(0.2, 3.8)).toBeCloseTo(
      terrain.sampleSurfaceHeight(0, 3) + 1.4,
    );
  });
});
