import type { BlockType } from './BlockType';
import { buildChunkMeshData } from './ChunkMeshBuilder';
import type {
  ChunkBuildRequest,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { TerrainGenerator } from './TerrainGenerator';
import { buildChunkLightField } from './VoxelLightEngine';

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

  const sampleWorldBlock = (
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockType => {
    const modified = modifications.get(
      createModificationKey(worldX, worldY, worldZ),
    );
    return modified ?? generator.sampleBlock(worldX, worldY, worldZ);
  };
  const lighting = buildChunkLightField(
    request.chunkX,
    request.chunkZ,
    sampleWorldBlock,
    request.lightEmitters ?? [],
  );
  const meshData = buildChunkMeshData(
    request.chunkX,
    request.chunkZ,
    sampleWorldBlock,
    lighting.sampleCombined,
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
