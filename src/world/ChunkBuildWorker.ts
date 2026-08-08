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
    const transfer: Transferable[] = [];
    for (const section of response.sections) {
      transfer.push(
        section.meshData.positions.buffer as ArrayBuffer,
        section.meshData.normals.buffer as ArrayBuffer,
        section.meshData.indices.buffer as ArrayBuffer,
        section.meshData.colors.buffer as ArrayBuffer,
        section.meshData.uvs.buffer as ArrayBuffer,
      );
    }
    workerScope.postMessage(response, transfer);
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
