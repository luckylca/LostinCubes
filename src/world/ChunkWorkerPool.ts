import type {
  ChunkBuildRequest,
  ChunkBuildResponse,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { executeChunkBuild } from './ChunkBuildTask';

type ChunkBuildInput = Omit<ChunkBuildRequest, 'type' | 'requestId'>;
type WorkerFactory = () => Worker;

export interface ChunkBuildOptions {
  readonly jobKey: string;
  readonly priority: number;
}

interface QueuedBuild {
  readonly request: ChunkBuildRequest;
  readonly jobKey: string;
  readonly priority: number;
  readonly sequence: number;
  readonly resolve: (response: ChunkBuildSuccess) => void;
  readonly reject: (reason: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  current: QueuedBuild | null;
}

export class ChunkBuildCancelledError extends Error {
  public override readonly name = 'ChunkBuildCancelledError';

  public constructor(jobKey: string) {
    super(`Chunk build was cancelled: ${jobKey}`);
  }
}

function getDefaultWorkerCount(): number {
  const hardwareThreads =
    typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.min(2, Math.max(1, Math.floor(hardwareThreads / 2)));
}

function createChunkWorker(): Worker {
  return new Worker(new URL('./ChunkBuildWorker.ts', import.meta.url), {
    type: 'module',
  });
}

function compareBuilds(left: QueuedBuild, right: QueuedBuild): number {
  return left.priority - right.priority || left.sequence - right.sequence;
}

/** Bounded worker pool with keyed replacement, priority, and hard cancellation. */
export class ChunkWorkerPool {
  readonly #slots: WorkerSlot[] = [];
  readonly #queue: QueuedBuild[] = [];
  readonly #fallbackQueue: QueuedBuild[] = [];
  readonly #fallbackPending = new Map<string, QueuedBuild>();
  readonly #workerFactory: WorkerFactory;
  #nextRequestId = 1;
  #nextSequence = 1;
  #disposed = false;
  #fallback = false;
  #fallbackScheduled = false;
  #cancelledCount = 0;

  public constructor(
    workerCount = getDefaultWorkerCount(),
    workerFactory: WorkerFactory = createChunkWorker,
  ) {
    if (!Number.isInteger(workerCount) || workerCount < 1) {
      throw new RangeError('workerCount must be a positive integer.');
    }
    this.#workerFactory = workerFactory;

    if (typeof Worker === 'undefined' && workerFactory === createChunkWorker) {
      this.#fallback = true;
      return;
    }

    try {
      for (let index = 0; index < workerCount; index += 1) {
        this.#slots.push(this.#createSlot());
      }
    } catch (error: unknown) {
      console.warn('Chunk workers are unavailable; using synchronous fallback.', error);
      this.#fallback = true;
      for (const slot of this.#slots) {
        slot.worker.terminate();
      }
      this.#slots.length = 0;
    }
  }

  public buildChunk(
    input: ChunkBuildInput,
    options: ChunkBuildOptions,
  ): Promise<ChunkBuildSuccess> {
    if (this.#disposed) {
      return Promise.reject(new Error('Chunk worker pool has been disposed.'));
    }
    if (options.jobKey.length === 0) {
      return Promise.reject(new RangeError('jobKey must not be empty.'));
    }
    if (!Number.isFinite(options.priority)) {
      return Promise.reject(new RangeError('priority must be finite.'));
    }

    this.cancel(options.jobKey);
    const request: ChunkBuildRequest = {
      type: 'build-chunk',
      requestId: this.#nextRequestId,
      ...input,
    };
    this.#nextRequestId += 1;

    return new Promise<ChunkBuildSuccess>((resolve, reject) => {
      const build: QueuedBuild = {
        request,
        jobKey: options.jobKey,
        priority: options.priority,
        sequence: this.#nextSequence,
        resolve,
        reject,
      };
      this.#nextSequence += 1;

      if (this.#fallback) {
        this.#enqueueFallback(build);
        return;
      }

      this.#queue.push(build);
      this.#queue.sort(compareBuilds);
      this.#pump();
    });
  }

  public cancel(jobKey: string): number {
    let cancelled = 0;
    const cancellation = new ChunkBuildCancelledError(jobKey);

    const fallback = this.#fallbackPending.get(jobKey);
    if (fallback !== undefined) {
      this.#fallbackPending.delete(jobKey);
      fallback.reject(cancellation);
      cancelled += 1;
    }

    for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
      const queued = this.#queue[index];
      if (queued?.jobKey !== jobKey) continue;
      this.#queue.splice(index, 1);
      queued.reject(cancellation);
      cancelled += 1;
    }

    for (let index = 0; index < this.#slots.length; index += 1) {
      const slot = this.#slots[index];
      if (slot?.current?.jobKey !== jobKey) continue;
      const current = slot.current;
      slot.current = null;
      current.reject(cancellation);
      slot.worker.terminate();
      try {
        this.#slots[index] = this.#createSlot();
      } catch (error: unknown) {
        this.#activateFallback(error);
      }
      cancelled += 1;
    }

    this.#cancelledCount += cancelled;
    if (cancelled > 0) this.#pump();
    return cancelled;
  }

  public cancelExcept(jobKeys: ReadonlySet<string>): number {
    const keysToCancel = new Set<string>();
    for (const queued of this.#queue) {
      if (!jobKeys.has(queued.jobKey)) keysToCancel.add(queued.jobKey);
    }
    for (const slot of this.#slots) {
      if (slot.current !== null && !jobKeys.has(slot.current.jobKey)) {
        keysToCancel.add(slot.current.jobKey);
      }
    }
    for (const key of this.#fallbackPending.keys()) {
      if (!jobKeys.has(key)) keysToCancel.add(key);
    }

    let cancelled = 0;
    for (const key of keysToCancel) cancelled += this.cancel(key);
    return cancelled;
  }

  public get queuedCount(): number {
    const active = this.#slots.reduce(
      (count, slot) => count + (slot.current === null ? 0 : 1),
      0,
    );
    return this.#queue.length + active + this.#fallbackPending.size;
  }

  public get cancelledCount(): number {
    return this.#cancelledCount;
  }

  public get usesSynchronousFallback(): boolean {
    return this.#fallback;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const error = new Error('Chunk worker pool was disposed.');
    for (const queued of this.#queue.splice(0)) queued.reject(error);
    for (const queued of this.#fallbackPending.values()) queued.reject(error);
    this.#fallbackPending.clear();
    this.#fallbackQueue.length = 0;
    for (const slot of this.#slots) {
      slot.current?.reject(error);
      slot.current = null;
      slot.worker.terminate();
    }
    this.#slots.length = 0;
  }

  #createSlot(): WorkerSlot {
    const worker = this.#workerFactory();
    const slot: WorkerSlot = { worker, current: null };
    worker.addEventListener('message', (event: MessageEvent<ChunkBuildResponse>) => {
      this.#handleMessage(slot, event.data);
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      const message = event.message.trim();
      this.#handleWorkerError(
        slot,
        new Error(
          message.length > 0
            ? message
            : 'Chunk worker failed without an error message.',
        ),
      );
    });
    worker.addEventListener('messageerror', () => {
      this.#handleWorkerError(
        slot,
        new Error('Chunk worker returned an unreadable message.'),
      );
    });
    return slot;
  }

  #enqueueFallback(build: QueuedBuild): void {
    this.#fallbackPending.set(build.jobKey, build);
    this.#fallbackQueue.push(build);
    this.#fallbackQueue.sort(compareBuilds);
    this.#scheduleFallback();
  }

  #scheduleFallback(): void {
    if (this.#fallbackScheduled || this.#disposed) return;
    this.#fallbackScheduled = true;

    // Microtasks run before the browser can paint. The old fallback queued all
    // chunk builds as microtasks, so a failed Worker could freeze the page while
    // the entire render window generated back-to-back. One macrotask performs
    // one chunk and then yields, allowing input, animation, and rendering
    // between expensive synchronous builds.
    setTimeout(() => {
      this.#fallbackScheduled = false;
      this.#runNextFallback();
    }, 0);
  }

  #runNextFallback(): void {
    if (this.#disposed) return;

    let build: QueuedBuild | undefined;
    while (this.#fallbackQueue.length > 0) {
      const candidate = this.#fallbackQueue.shift();
      if (
        candidate !== undefined &&
        this.#fallbackPending.get(candidate.jobKey) === candidate
      ) {
        build = candidate;
        break;
      }
    }

    if (build !== undefined) {
      this.#fallbackPending.delete(build.jobKey);
      try {
        build.resolve(executeChunkBuild(build.request));
      } catch (error: unknown) {
        build.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.#fallbackPending.size > 0) this.#scheduleFallback();
  }

  #handleMessage(slot: WorkerSlot, response: ChunkBuildResponse): void {
    const current = slot.current;
    if (current?.request.requestId !== response.requestId) return;
    slot.current = null;
    if (response.type === 'chunk-built') {
      current.resolve(response);
    } else {
      current.reject(new Error(response.message));
    }
    this.#pump();
  }

  #handleWorkerError(slot: WorkerSlot, error: Error): void {
    if (!this.#slots.includes(slot) || this.#disposed) return;
    this.#activateFallback(error);
  }

  #activateFallback(error: unknown): void {
    if (this.#fallback || this.#disposed) return;
    console.warn(
      'Chunk worker failed at runtime; continuing with synchronous generation.',
      error,
    );
    this.#fallback = true;

    const pending: QueuedBuild[] = [];
    for (const slot of this.#slots) {
      if (slot.current !== null) {
        pending.push(slot.current);
        slot.current = null;
      }
      slot.worker.terminate();
    }
    this.#slots.length = 0;
    pending.push(...this.#queue.splice(0));
    pending.sort(compareBuilds);

    for (const build of pending) this.#enqueueFallback(build);
  }

  #pump(): void {
    if (this.#disposed || this.#fallback) return;
    for (const slot of this.#slots) {
      if (slot.current !== null) continue;
      const next = this.#queue.shift();
      if (next === undefined) return;
      slot.current = next;
      slot.worker.postMessage(next.request);
    }
  }
}
