import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { executeChunkBuild } from '../src/world/ChunkBuildTask';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../src/world/VoxelChunk';

describe('executeChunkBuild', () => {
  it('returns transferable greedy mesh buffers', () => {
    const response = executeChunkBuild({
      type: 'build-chunk',
      requestId: 1,
      worldSeed: 'worker-build-test',
      chunkX: 0,
      chunkZ: 0,
      modifications: [],
    });

    expect(response.type).toBe('chunk-built');
    expect(response.meshData.positions).toBeInstanceOf(Float32Array);
    expect(response.meshData.normals).toBeInstanceOf(Float32Array);
    expect(response.meshData.colors).toBeInstanceOf(Float32Array);
    expect(response.meshData.indices).toBeInstanceOf(Uint32Array);
    expect(response.meshData.quadCount).toBeGreaterThan(0);
    expect(response.meshData.sourceFaceCount).toBeGreaterThan(
      response.meshData.quadCount,
    );
    expect(response.buildMilliseconds).toBeGreaterThanOrEqual(0);
  });

  it('applies sparse modifications before meshing', () => {
    const baseline = executeChunkBuild({
      type: 'build-chunk',
      requestId: 1,
      worldSeed: 'worker-modification-test',
      chunkX: 0,
      chunkZ: 0,
      modifications: [],
    });
    const modified = executeChunkBuild({
      type: 'build-chunk',
      requestId: 2,
      worldSeed: 'worker-modification-test',
      chunkX: 0,
      chunkZ: 0,
      modifications: [[0, 31, 0, BlockType.Stone]],
    });

    expect(modified.meshData.sourceFaceCount).toBeGreaterThan(
      baseline.meshData.sourceFaceCount,
    );
    expect(modified.meshData.positions).not.toEqual(
      baseline.meshData.positions,
    );
  });

  it('keeps fast edit geometry identical to a full-light build', () => {
    const request = {
      type: 'build-chunk' as const,
      worldSeed: 'worker-fast-edit-test',
      chunkX: 0,
      chunkZ: 0,
      modifications: [
        [15, 10, 4, BlockType.Air],
        [16, 10, 4, BlockType.Stone],
      ] as const,
    };
    const full = executeChunkBuild({
      ...request,
      requestId: 10,
      mode: 'full',
    });
    const fast = executeChunkBuild({
      ...request,
      requestId: 11,
      mode: 'geometry-only',
    });

    expect(fast.meshData.positions).toEqual(full.meshData.positions);
    expect(fast.meshData.normals).toEqual(full.meshData.normals);
    expect(fast.meshData.indices).toEqual(full.meshData.indices);
    expect(fast.meshData.uvs).toEqual(full.meshData.uvs);
    expect(fast.meshData.quadCount).toBe(full.meshData.quadCount);
    expect(fast.meshData.sourceFaceCount).toBe(full.meshData.sourceFaceCount);
  });

  it('reuses procedural terrain across repeated edits in one chunk', () => {
    const seed = 'worker-repeated-edit-cache-test';
    const cold = executeChunkBuild({
      type: 'build-chunk',
      requestId: 20,
      worldSeed: seed,
      chunkX: 3,
      chunkZ: -2,
      modifications: [[49, 10, -31, BlockType.Air]],
      mode: 'geometry-only',
    });
    const warm = executeChunkBuild({
      type: 'build-chunk',
      requestId: 21,
      worldSeed: seed,
      chunkX: 3,
      chunkZ: -2,
      modifications: [
        [49, 10, -31, BlockType.Air],
        [50, 10, -31, BlockType.Air],
      ],
      mode: 'geometry-only',
    });

    const geometryWidth = CHUNK_SIZE + 2;
    expect(cold.geometryBaseCacheHit).toBe(false);
    expect(cold.proceduralTerrainSamples).toBe(
      geometryWidth * geometryWidth * CHUNK_HEIGHT,
    );
    expect(warm.geometryBaseCacheHit).toBe(true);
    expect(warm.proceduralTerrainSamples).toBe(0);
    console.info(
      `edit-geometry cold=${cold.buildMilliseconds.toFixed(2)}ms warm=${warm.buildMilliseconds.toFixed(2)}ms`,
    );
  });
});
