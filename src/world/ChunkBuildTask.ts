import type { BlockType } from './BlockType';
import { buildChunkMeshData } from './ChunkMeshBuilder';
import type {
  ChunkBuildRequest,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { TerrainGenerator } from './TerrainGenerator';

function createModificationKey(
  worldX: number,
  worldY: number,
  worldZ: number,
): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

export function executeChunkBuild(
  request: ChunkBuildRequest,
): ChunkBuildSuccess {
  const startedAt = performance.now();
  const generator = new TerrainGenerator(request.worldSeed);
  const modifications = new Map<string, BlockType>();
  for (const [worldX, worldY, worldZ, block] of request.modifications) {
    modifications.set(createModificationKey(worldX, worldY, worldZ), block);
  }

  const meshData = buildChunkMeshData(
    request.chunkX,
    request.chunkZ,
    (worldX, worldY, worldZ) => {
      const modified = modifications.get(
        createModificationKey(worldX, worldY, worldZ),
      );
      return modified ?? generator.sampleBlock(worldX, worldY, worldZ);
    },
  );

  return {
    type: 'chunk-built',
    requestId: request.requestId,
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    meshData,
    buildMilliseconds: performance.now() - startedAt,
  };
}
