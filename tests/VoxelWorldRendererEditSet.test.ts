import { describe, expect, it } from 'vitest';
import {
  getBlockEditGeometryChunks,
  getNearFieldChunkKeys,
} from '../src/world/VoxelWorldRenderer';

describe('getBlockEditGeometryChunks', () => {
  it('rebuilds only the edited chunk for an interior voxel', () => {
    expect(getBlockEditGeometryChunks(5, 7)).toEqual([[0, 0]]);
  });

  it('includes cardinal neighbors for positive chunk boundaries', () => {
    expect(getBlockEditGeometryChunks(15, 15)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(getBlockEditGeometryChunks(16, 16)).toEqual([
      [1, 1],
      [0, 1],
      [1, 0],
    ]);
  });

  it('handles negative coordinates without missing shared faces', () => {
    expect(getBlockEditGeometryChunks(-1, -1)).toEqual([
      [-1, -1],
      [0, -1],
      [-1, 0],
    ]);
    expect(getBlockEditGeometryChunks(-16, -16)).toEqual([
      [-1, -1],
      [-2, -1],
      [-1, -2],
    ]);
  });
});

describe('getNearFieldChunkKeys', () => {
  it('always protects a complete 3x3 window around the player chunk', () => {
    expect(getNearFieldChunkKeys(4, -2)).toEqual([
      '3,-3',
      '4,-3',
      '5,-3',
      '3,-2',
      '4,-2',
      '5,-2',
      '3,-1',
      '4,-1',
      '5,-1',
    ]);
  });
});