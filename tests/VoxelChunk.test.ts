import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import {
  CHUNK_VOLUME,
  VoxelChunk,
  createChunkKey,
  worldToChunkCoordinate,
  worldToLocalCoordinate,
} from '../src/world/VoxelChunk';

describe('VoxelChunk', () => {
  it('stores blocks in compact fixed-size chunk data', () => {
    const chunk = new VoxelChunk(-2, 3);
    chunk.setBlock(4, 7, 9, BlockType.RuneStone);

    expect(chunk.key).toBe('-2,3');
    expect(chunk.getBlock(4, 7, 9)).toBe(BlockType.RuneStone);
    expect(chunk.copyBlocks()).toHaveLength(CHUNK_VOLUME);
    expect(chunk.countBlocks(BlockType.RuneStone)).toBe(1);
  });

  it('maps negative world coordinates to stable chunk and local coordinates', () => {
    expect(worldToChunkCoordinate(-1)).toBe(-1);
    expect(worldToLocalCoordinate(-1)).toBe(15);
    expect(worldToChunkCoordinate(-16)).toBe(-1);
    expect(worldToLocalCoordinate(-16)).toBe(0);
    expect(worldToChunkCoordinate(-17)).toBe(-2);
    expect(worldToLocalCoordinate(-17)).toBe(15);
    expect(createChunkKey(-2, 5)).toBe('-2,5');
  });

  it('rejects invalid local coordinates', () => {
    const chunk = new VoxelChunk(0, 0);
    expect(() => chunk.getBlock(16, 0, 0)).toThrow(RangeError);
    expect(() => chunk.setBlock(0, -1, 0, BlockType.Stone)).toThrow(
      RangeError,
    );
  });
});
