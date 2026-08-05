import type { BlockType } from './BlockType';
import type {
  ChunkBuildRequest,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { buildChunkMeshData } from './ChunkMeshBuilder';
import { ChunkVoxelCache } from './ChunkVoxelCache';
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

  const sampleProceduralBlock = (
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockType => {
    const modified = modifications.get(
      createModificationKey(worldX, worldY, worldZ),
    );
    return modified ?? generator.sampleBlock(worldX, worldY, worldZ);
  };

  // One chunk light field spans 46×32×46 cells. Materializing that bounded
  // volume once avoids repeatedly evaluating terrain noise, caves, ores, and
  // tree placement during the sky pass, block-light pass, propagation, and
  // greedy mesh pass.
  const voxels = new ChunkVoxelCache(
    request.chunkX,
    request.chunkZ,
    sampleProceduralBlock,
  );
  const lighting = buildChunkLightField(
    request.chunkX,
    request.chunkZ,
    voxels.sample,
    request.lightEmitters ?? [],
  );
  const meshData = buildChunkMeshData(
    request.chunkX,
    request.chunkZ,
    voxels.sample,
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
