import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { executeChunkBuild } from '../src/world/ChunkBuildTask';
import {
  CHUNK_HEIGHT,
  CHUNK_SECTION_COUNT,
  CHUNK_SIZE,
} from '../src/world/VoxelChunk';

describe('executeChunkBuild', () => {
  it('returns transferable mesh buffers for every vertical section', () => {
    const response = executeChunkBuild({
      type: 'build-chunk',
      requestId: 1,
      worldSeed: 'worker-build-test',
      chunkX: 0,
      chunkZ: 0,
      modifications: [],
    });

    expect(response.type).toBe('chunk-built');
    expect(response.sections).toHaveLength(CHUNK_SECTION_COUNT);
    const mesh = response.sections[0]?.meshData;
    expect(mesh?.positions).toBeInstanceOf(Float32Array);
    expect(mesh?.normals).toBeInstanceOf(Float32Array);
    expect(mesh?.colors).toBeInstanceOf(Float32Array);
    expect(mesh?.indices).toBeInstanceOf(Uint32Array);
    expect(
      response.sections.reduce((sum, section) => sum + section.meshData.quadCount, 0),
    ).toBeGreaterThan(0);
    expect(response.buildMilliseconds).toBeGreaterThanOrEqual(0);
  });

  it('applies sparse modifications to the affected section', () => {
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

    const baselineTop = baseline.sections[3]?.meshData;
    const modifiedTop = modified.sections[3]?.meshData;
    expect(modifiedTop?.sourceFaceCount).toBeGreaterThan(
      baselineTop?.sourceFaceCount ?? 0,
    );
    expect(modifiedTop?.positions).not.toEqual(baselineTop?.positions);
  });

  it('keeps fast edit geometry identical to the same full-light section', () => {
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
      sectionIndices: [1],
    });

    const fullSection = full.sections[1]?.meshData;
    const fastSection = fast.sections[0]?.meshData;
    expect(fast.sections.map((section) => section.sectionIndex)).toEqual([1]);
    expect(fastSection?.positions).toEqual(fullSection?.positions);
    expect(fastSection?.normals).toEqual(fullSection?.normals);
    expect(fastSection?.indices).toEqual(fullSection?.indices);
    expect(fastSection?.uvs).toEqual(fullSection?.uvs);
    expect(fastSection?.quadCount).toBe(fullSection?.quadCount);
    expect(fastSection?.sourceFaceCount).toBe(fullSection?.sourceFaceCount);
  });

  it('reuses procedural terrain and meshes only one section on repeated edits', () => {
    const seed = 'worker-repeated-edit-cache-test';
    const cold = executeChunkBuild({
      type: 'build-chunk',
      requestId: 20,
      worldSeed: seed,
      chunkX: 3,
      chunkZ: -2,
      modifications: [[49, 10, -31, BlockType.Air]],
      mode: 'geometry-only',
      sectionIndices: [1],
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
      sectionIndices: [1],
    });

    const geometryWidth = CHUNK_SIZE + 2;
    expect(cold.geometryBaseCacheHit).toBe(false);
    expect(cold.proceduralTerrainSamples).toBe(
      geometryWidth * geometryWidth * CHUNK_HEIGHT,
    );
    expect(warm.geometryBaseCacheHit).toBe(true);
    expect(warm.proceduralTerrainSamples).toBe(0);
    expect(warm.sections).toHaveLength(1);
    expect(warm.sections[0]?.sectionIndex).toBe(1);
    console.info(
      `edit-section cold=${cold.buildMilliseconds.toFixed(2)}ms warm=${warm.buildMilliseconds.toFixed(2)}ms`,
    );
  });
});
