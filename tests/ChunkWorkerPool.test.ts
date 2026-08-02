import { describe, expect, it } from 'vitest';
import {
  ChunkBuildCancelledError,
  ChunkWorkerPool,
} from '../src/world/ChunkWorkerPool';

const BUILD_INPUT = {
  worldSeed: 'worker-pool-test',
  chunkX: 0,
  chunkZ: 0,
  modifications: [],
} as const;

describe('ChunkWorkerPool', () => {
  it('replaces an older build with the same stable job key', async () => {
    const pool = new ChunkWorkerPool(1);
    const firstResult = pool
      .buildChunk(BUILD_INPUT, { jobKey: '0,0', priority: 5 })
      .catch((error: unknown) => error);
    const second = pool.buildChunk(BUILD_INPUT, {
      jobKey: '0,0',
      priority: 0,
    });

    expect(await firstResult).toBeInstanceOf(ChunkBuildCancelledError);
    await expect(second).resolves.toMatchObject({
      type: 'chunk-built',
      chunkX: 0,
      chunkZ: 0,
    });
    expect(pool.cancelledCount).toBe(1);
    pool.dispose();
  });

  it('cancels queued work outside the desired key set', async () => {
    const pool = new ChunkWorkerPool(1);
    const removedResult = pool
      .buildChunk(BUILD_INPUT, { jobKey: 'old', priority: 4 })
      .catch((error: unknown) => error);
    const retained = pool.buildChunk(
      { ...BUILD_INPUT, chunkX: 1 },
      { jobKey: 'keep', priority: 0 },
    );

    expect(pool.cancelExcept(new Set(['keep']))).toBe(1);
    expect(await removedResult).toBeInstanceOf(ChunkBuildCancelledError);
    await expect(retained).resolves.toMatchObject({ chunkX: 1 });
    pool.dispose();
  });
});
