import type {
  ChunkBuildRequest,
  ChunkBuildResponse,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { executeChunkBuild } from './ChunkBuildTask';

type ChunkBuildInput = Omit<ChunkBuildRequest, 'type' | 'requestId'>;

interface QueuedBuild {
  readonly request: ChunkBuildRequest;
  readonly resolve: (response: ChunkBuildSuccess) => void;
  readonly reject: (reason: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  current: QueuedBuild | null;
}

function getDefaultWorkerCount(): number {
  const hardwareThreads =
    typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.min(2, Math.max(1, Math.floor(hardwareThreads / 2)));
}

/** Small bounded pool so chunk work never creates an unbounded worker count. */
export class ChunkWorkerPool {
  readonly #slots: WorkerSlot[] = [];
  readonly #queue: QueuedBuild[] = [];
  #nextRequestId = 1;
  #disposed = false;
  #fallback = false;

  public constructor(workerCount = getDefaultWorkerCount()) {
    if (!Number.isInteger(workerCount) || workerCount < 1) {
      throw new RangeError('workerCount must be a positive integer.');
    }

    if (typeof Worker === 'undefined') {
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

  public buildChunk(input: ChunkBuildInput): Promise<ChunkBuildSuccess> {
    if (this.#disposed) {
      return Promise.reject(new Error('Chunk worker pool has been disposed.'));
    }

    const request: ChunkBuildRequest = {
      type: 'build-chunk',
      requestId: this.#nextRequestId,
      ...input,
    };
    this.#nextRequestId += 1;

    if (this.#fallback) {
      return Promise.resolve().then(() => executeChunkBuild(request));
    }

    return new Promise<ChunkBuildSuccess>((resolve, reject) => {
      this.#queue.push({ request, resolve, reject });
      this.#pump();
    });
  }

  public get queuedCount(): number {
    const active = this.#slots.reduce(
      (count, slot) => count + (slot.current === null ? 0 : 1),
      0,
    );
    return this.#queue.length + active;
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const error = new Error('Chunk worker pool was disposed.');
    for (const queued of this.#queue.splice(0)) {
      queued.reject(error);
    }
    for (const slot of this.#slots) {
      slot.current?.reject(error);
      slot.current = null;
      slot.worker.terminate();
    }
    this.#slots.length = 0;
  }

  #createSlot(): WorkerSlot {
    const worker = new Worker(new URL('./ChunkBuildWorker.ts', import.meta.url), {
      type: 'module',
    });
    const slot: WorkerSlot = { worker, current: null };
    worker.addEventListener('message', (event: MessageEvent<ChunkBuildResponse>) => {
      this.#handleMessage(slot, event.data);
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      this.#handleWorkerError(slot, new Error(event.message));
    });
    return slot;
  }

  #handleMessage(slot: WorkerSlot, response: ChunkBuildResponse): void {
    const current = slot.current;
    if (current === null || current.request.requestId !== response.requestId) {
      return;
    }
    slot.current = null;
    if (response.type === 'chunk-built') {
      current.resolve(response);
    } else {
      current.reject(new Error(response.message));
    }
    this.#pump();
  }

  #handleWorkerError(slot: WorkerSlot, error: Error): void {
    slot.current?.reject(error);
    slot.current = null;
    slot.worker.terminate();
    if (!this.#disposed) {
      const replacement = this.#createSlot();
      const index = this.#slots.indexOf(slot);
      if (index >= 0) {
        this.#slots[index] = replacement;
      }
    }
    this.#pump();
  }

  #pump(): void {
    if (this.#disposed) {
      return;
    }
    for (const slot of this.#slots) {
      if (slot.current !== null) {
        continue;
      }
      const next = this.#queue.shift();
      if (next === undefined) {
        return;
      }
      slot.current = next;
      slot.worker.postMessage(next.request);
    }
  }
}
