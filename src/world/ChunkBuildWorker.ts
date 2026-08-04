import type {
  ChunkBuildRequest,
  ChunkBuildResponse,
} from './ChunkBuildProtocol';
import { executeChunkBuild } from './ChunkBuildTask';

interface WorkerScope {
  onmessage: ((event: MessageEvent<ChunkBuildRequest>) => void) | null;
  postMessage(message: ChunkBuildResponse, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event): void => {
  try {
    const response = executeChunkBuild(event.data);
    workerScope.postMessage(response, [
      response.meshData.positions.buffer as ArrayBuffer,
      response.meshData.normals.buffer as ArrayBuffer,
      response.meshData.indices.buffer as ArrayBuffer,
      response.meshData.colors.buffer as ArrayBuffer,
      response.meshData.uvs.buffer as ArrayBuffer,
    ]);
  } catch (error: unknown) {
    workerScope.postMessage(
      {
        type: 'chunk-failed',
        requestId: event.data.requestId,
        message: error instanceof Error ? error.message : String(error),
      },
      [],
    );
  }
};
