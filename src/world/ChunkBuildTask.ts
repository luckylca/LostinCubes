import type { BlockType } from './BlockType';
import type {
  ChunkBuildRequest,
  ChunkBuildSuccess,
} from './ChunkBuildProtocol';
import { buildChunkMeshData } from './ChunkMeshBuilder';
import { ChunkVoxelCache } from './ChunkVoxelCache';
import { TerrainGenerator } from './TerrainGenerator';
import { buildChunkLightField } from './VoxelLightEngine';

const GEOMETRY_CACHE_MARGIN = 1;
const GEOMETRY_BASE_CACHE_LIMIT = 24;
const geometryBaseCaches = new Map<string, ChunkVoxelCache>();

interface GeometryBaseCacheResult {
  readonly voxels: ChunkVoxelCache;
  readonly cacheHit: boolean;
  readonly proceduralTerrainSamples: number;
}

function createModificationKey(
  worldX: number,
  worldY: number,
  worldZ: number,
): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

function createGeometryCacheKey(
  worldSeed: string,
  chunkX: number,
  chunkZ: number,
): string {
  return `${worldSeed}:${String(chunkX)},${String(chunkZ)}`;
}

function getGeometryBaseCache(
  worldSeed: string,
  chunkX: number,
  chunkZ: number,
): GeometryBaseCacheResult {
  const key = createGeometryCacheKey(worldSeed, chunkX, chunkZ);
  const cached = geometryBaseCaches.get(key);
  if (cached !== undefined) {
    geometryBaseCaches.delete(key);
    geometryBaseCaches.set(key, cached);
    return {
      voxels: cached,
      cacheHit: true,
      proceduralTerrainSamples: 0,
    };
  }

  const generator = new TerrainGenerator(worldSeed);
  const created = new ChunkVoxelCache(
    chunkX,
    chunkZ,
    (worldX, worldY, worldZ) =>
      generator.sampleBlock(worldX, worldY, worldZ),
    GEOMETRY_CACHE_MARGIN,
  );
  geometryBaseCaches.set(key, created);

  while (geometryBaseCaches.size > GEOMETRY_BASE_CACHE_LIMIT) {
    const oldestKey = geometryBaseCaches.keys().next().value;
    if (oldestKey === undefined) break;
    geometryBaseCaches.delete(oldestKey);
  }
  return {
    voxels: created,
    cacheHit: false,
    proceduralTerrainSamples: created.cachedCellCount,
  };
}

export function executeChunkBuild(
  request: ChunkBuildRequest,
): ChunkBuildSuccess {
  const startedAt = performance.now();
  const modifications = new Map<string, BlockType>();
  for (const [worldX, worldY, worldZ, block] of request.modifications) {
    modifications.set(createModificationKey(worldX, worldY, worldZ), block);
  }

  let meshData;
  let geometryBaseCacheHit: boolean | undefined;
  let proceduralTerrainSamples: number | undefined;
  if (request.mode === 'geometry-only') {
    // The old "fast" edit path still called TerrainGenerator repeatedly for
    // every greedy-mesh probe, which meant tens of thousands of procedural
    // samples for one broken block. Cache the immutable procedural terrain once
    // with the one-block halo meshing actually needs, then materialize the
    // current sparse edits into another tiny 18×32×18 byte cache. Repeated edits
    // in the same chunk therefore avoid procedural generation entirely.
    const base = getGeometryBaseCache(
      request.worldSeed,
      request.chunkX,
      request.chunkZ,
    );
    geometryBaseCacheHit = base.cacheHit;
    proceduralTerrainSamples = base.proceduralTerrainSamples;
    const editVoxels = new ChunkVoxelCache(
      request.chunkX,
      request.chunkZ,
      (worldX, worldY, worldZ) =>
        modifications.get(createModificationKey(worldX, worldY, worldZ)) ??
        base.voxels.sample(worldX, worldY, worldZ),
      GEOMETRY_CACHE_MARGIN,
    );
    meshData = buildChunkMeshData(
      request.chunkX,
      request.chunkZ,
      editVoxels.sample,
    );
  } else {
    const generator = new TerrainGenerator(request.worldSeed);
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
    meshData = buildChunkMeshData(
      request.chunkX,
      request.chunkZ,
      voxels.sample,
      lighting.sampleCombined,
    );
  }

  return {
    type: 'chunk-built',
    requestId: request.requestId,
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    meshData,
    buildMilliseconds: performance.now() - startedAt,
    geometryBaseCacheHit,
    proceduralTerrainSamples,
  };
}
