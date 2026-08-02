import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { executeChunkBuild } from '../src/world/ChunkBuildTask';

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
});
