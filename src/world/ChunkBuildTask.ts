import type { BlockType } from './BlockType';
import type {
  ChunkBuildRequest,
  ChunkBuildSuccess,
  ChunkSectionMeshPayload,
} from './ChunkBuildProtocol';
import { buildChunkSectionMeshData } from './ChunkMeshBuilder';
import { ChunkVoxelCache } from './ChunkVoxelCache';
import { TerrainGenerator } from './TerrainGenerator';
import { CHUNK_SECTION_COUNT } from './VoxelChunk';
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

function resolveSectionIndices(request: ChunkBuildRequest): readonly number[] {
  if (request.mode !== 'geometry-only' || request.sectionIndices === undefined) {
    return Array.from({ length: CHUNK_SECTION_COUNT }, (_, index) => index);
  }
  const unique = [...new Set(request.sectionIndices)].sort((a, b) => a - b);
  for (const sectionIndex of unique) {
    if (
      !Number.isInteger(sectionIndex) ||
      sectionIndex < 0 ||
      sectionIndex >= CHUNK_SECTION_COUNT
    ) {
      throw new RangeError(`Invalid chunk section index: ${String(sectionIndex)}`);
    }
  }
  return unique;
}

export function executeChunkBuild(
  request: ChunkBuildRequest,
): ChunkBuildSuccess {
  const startedAt = performance.now();
  const modifications = new Map<string, BlockType>();
  for (const [worldX, worldY, worldZ, block] of request.modifications) {
    modifications.set(createModificationKey(worldX, worldY, worldZ), block);
  }

  const sectionIndices = resolveSectionIndices(request);
  let sections: ChunkSectionMeshPayload[];
  let geometryBaseCacheHit: boolean | undefined;
  let proceduralTerrainSamples: number | undefined;
  if (request.mode === 'geometry-only') {
    // Keep the immutable terrain cache hot across rapid edits, but mesh only the
    // vertical 16×8×16 sections touched by the voxel change. This is the key
    // difference from the old edit path, which rebuilt and re-uploaded all 32 Y
    // layers even when one block changed.
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
    sections = sectionIndices.map((sectionIndex) => ({
      sectionIndex,
      meshData: buildChunkSectionMeshData(
        request.chunkX,
        request.chunkZ,
        sectionIndex,
        editVoxels.sample,
      ),
    }));
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
    sections = sectionIndices.map((sectionIndex) => ({
      sectionIndex,
      meshData: buildChunkSectionMeshData(
        request.chunkX,
        request.chunkZ,
        sectionIndex,
        voxels.sample,
        lighting.sampleCombined,
      ),
    }));
  }

  return {
    type: 'chunk-built',
    requestId: request.requestId,
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    sections,
    buildMilliseconds: performance.now() - startedAt,
    geometryBaseCacheHit,
    proceduralTerrainSamples,
  };
}
