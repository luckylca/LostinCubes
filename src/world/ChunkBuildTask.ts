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
const TERRAIN_COLUMN_CACHE_LIMIT = 64;
const geometryBaseCaches = new Map<string, ChunkVoxelCache>();

interface GeometryBaseCacheResult {
  readonly voxels: ChunkVoxelCache;
  readonly cacheHit: boolean;
  readonly proceduralTerrainSamples: number;
}

type BiomeSample = ReturnType<TerrainGenerator['sampleBiome']>;

/**
 * Chunk generation asks sampleBlock() for every Y in a column, while surface
 * height and biome depend only on X/Z. The base TerrainGenerator intentionally
 * stays stateless for general world queries; worker builds use this tiny LRU so
 * repeated Y samples do not rerun the same 2D noise dozens of times.
 */
class ChunkTerrainGenerator extends TerrainGenerator {
  readonly #surfaceHeights = new Map<string, number>();
  readonly #biomes = new Map<string, BiomeSample>();

  public override sampleSurfaceHeight(worldX: number, worldZ: number): number {
    const key = createColumnKey(worldX, worldZ);
    const cached = this.#surfaceHeights.get(key);
    if (cached !== undefined) {
      this.#refresh(this.#surfaceHeights, key, cached);
      return cached;
    }
    const created = super.sampleSurfaceHeight(worldX, worldZ);
    this.#remember(this.#surfaceHeights, key, created);
    return created;
  }

  public override sampleBiome(worldX: number, worldZ: number): BiomeSample {
    const key = createColumnKey(worldX, worldZ);
    const cached = this.#biomes.get(key);
    if (cached !== undefined) {
      this.#refresh(this.#biomes, key, cached);
      return cached;
    }
    const created = super.sampleBiome(worldX, worldZ);
    this.#remember(this.#biomes, key, created);
    return created;
  }

  #refresh<T>(cache: Map<string, T>, key: string, value: T): void {
    cache.delete(key);
    cache.set(key, value);
  }

  #remember<T>(cache: Map<string, T>, key: string, value: T): void {
    cache.set(key, value);
    while (cache.size > TERRAIN_COLUMN_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
}

function createColumnKey(worldX: number, worldZ: number): string {
  return `${String(worldX)},${String(worldZ)}`;
}

function createModificationKey(
  worldX: number,
  worldY: number,
  worldZ: number,
): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

function getModification(
  modifications: ReadonlyMap<string, BlockType>,
  worldX: number,
  worldY: number,
  worldZ: number,
): BlockType | undefined {
  if (modifications.size === 0) return undefined;
  return modifications.get(createModificationKey(worldX, worldY, worldZ));
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

  const generator = new ChunkTerrainGenerator(worldSeed);
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
        getModification(modifications, worldX, worldY, worldZ) ??
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
    const generator = new ChunkTerrainGenerator(request.worldSeed);
    const sampleProceduralBlock = (
      worldX: number,
      worldY: number,
      worldZ: number,
    ): BlockType => {
      const modified = getModification(
        modifications,
        worldX,
        worldY,
        worldZ,
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
