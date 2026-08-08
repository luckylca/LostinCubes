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

class RuntimeFailingWorker {
  readonly #listeners = new Map<string, EventListenerOrEventListenerObject[]>();

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  public postMessage(): void {
    queueMicrotask(() => {
      const event = {
        message: 'Error',
        preventDefault: () => undefined,
      } as ErrorEvent;
      for (const listener of this.#listeners.get('error') ?? []) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    });
  }

  public terminate(): void {
    // The fake worker has no external resources to release.
  }
}

class ControlledWorker {
  public static instances: ControlledWorker[] = [];
  public readonly posted: unknown[] = [];
  public terminated = false;

  public constructor() {
    ControlledWorker.instances.push(this);
  }

  public addEventListener(): void {
    // This fake only records scheduling; it never completes a build.
  }

  public postMessage(message: unknown): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }
}

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

  it('preempts an in-flight background build for an urgent edit', async () => {
    ControlledWorker.instances = [];
    const pool = new ChunkWorkerPool(
      1,
      () => new ControlledWorker() as unknown as Worker,
    );
    const background = pool
      .buildChunk(
        { ...BUILD_INPUT, chunkX: 7 },
        { jobKey: 'background', priority: 700 },
      )
      .catch(() => null);

    const firstWorker = ControlledWorker.instances[0];
    expect(firstWorker?.posted).toHaveLength(1);

    const urgent = pool
      .buildChunk(BUILD_INPUT, { jobKey: 'edited', priority: -10_000 })
      .catch(() => null);

    expect(firstWorker?.terminated).toBe(true);
    expect(ControlledWorker.instances).toHaveLength(2);
    expect(ControlledWorker.instances[1]?.posted[0]).toMatchObject({
      chunkX: 0,
      chunkZ: 0,
    });

    pool.dispose();
    await Promise.all([background, urgent]);
  });

  it('keeps a geometry worker alive and retains only the latest repeated edit', async () => {
    ControlledWorker.instances = [];
    const pool = new ChunkWorkerPool(
      1,
      () => new ControlledWorker() as unknown as Worker,
    );
    const geometryInput = {
      ...BUILD_INPUT,
      mode: 'geometry-only' as const,
    };
    const first = pool
      .buildChunk(geometryInput, { jobKey: 'edited', priority: -10_000 })
      .catch((error: unknown) => error);
    const worker = ControlledWorker.instances[0];

    // VoxelWorldRenderer calls cancel before rescheduling an edited chunk. A
    // running geometry job must survive that call so its worker-local terrain
    // cache is not destroyed.
    expect(pool.cancel('edited')).toBe(0);
    expect(worker?.terminated).toBe(false);

    const superseded = pool
      .buildChunk(geometryInput, { jobKey: 'edited', priority: -10_000 })
      .catch((error: unknown) => error);
    const latest = pool
      .buildChunk(geometryInput, { jobKey: 'edited', priority: -10_000 })
      .catch((error: unknown) => error);

    expect(await superseded).toBeInstanceOf(ChunkBuildCancelledError);
    expect(ControlledWorker.instances).toHaveLength(1);
    expect(worker?.terminated).toBe(false);
    expect(worker?.posted).toHaveLength(1);
    expect(pool.queuedCount).toBe(2);

    pool.dispose();
    await Promise.all([first, latest]);
  });

  it('continues synchronously when a runtime worker error occurs', async () => {
    const pool = new ChunkWorkerPool(
      1,
      () => new RuntimeFailingWorker() as unknown as Worker,
    );

    await expect(
      pool.buildChunk(BUILD_INPUT, { jobKey: 'runtime-failure', priority: 0 }),
    ).resolves.toMatchObject({
      type: 'chunk-built',
      chunkX: 0,
      chunkZ: 0,
    });
    expect(pool.usesSynchronousFallback).toBe(true);
    pool.dispose();
  });
});
