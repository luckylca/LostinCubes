import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { resolveRuntimeWorldId, resolveRuntimeWorldSeed } from './ActiveWorldRuntime';
import type { BiomeType } from './BiomeDefinition';
import {
  isClimbableBlock,
  isLavaBlock,
  isSolidBlock,
  isWaterBlock,
} from './BlockRegistry';
import { BlockType } from './BlockType';
import type {
  SerializedBlockModification,
  SerializedLightEmitter,
} from './ChunkBuildProtocol';
import type { BlockType as BlockTypeValue } from './BlockType';
import { notifySurvivalBlockChanged } from './SurvivalWorldRuntime';
import { TerrainGenerator } from './TerrainGenerator';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
} from './VoxelChunk';
import {
  LIGHT_PROPAGATION_RADIUS,
  MAXIMUM_LIGHT_LEVEL,
} from './VoxelLightEngine';

const PLAYER_FOOT_OFFSET = 0.9;
const DATABASE_NAME = 'lost-in-cubes-worlds';
const DATABASE_VERSION = 1;
const BLOCK_STORE = 'blocks';
const VALID_BLOCK_TYPES = new Set<number>(Object.values(BlockType));

interface PersistedBlockModification {
  readonly id: string;
  readonly worldSeed: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly block: BlockTypeValue;
}

interface WorldDatabase extends DBSchema {
  blocks: {
    key: string;
    value: PersistedBlockModification;
    indexes: { 'by-world': string };
  };
}

function createBlockKey(worldX: number, worldY: number, worldZ: number): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

function createPersistenceKey(
  worldId: string,
  worldX: number,
  worldY: number,
  worldZ: number,
): string {
  return `${worldId}:${createBlockKey(worldX, worldY, worldZ)}`;
}

function validateCoordinate(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPersistedBlockModification(
  value: unknown,
): value is PersistedBlockModification {
  if (!isRecord(value)) return false;
  const { id, worldSeed, worldX, worldY, worldZ, block } = value;
  return (
    typeof id === 'string' &&
    typeof worldSeed === 'string' &&
    isInteger(worldX) &&
    isInteger(worldY) &&
    isInteger(worldZ) &&
    typeof block === 'number' &&
    VALID_BLOCK_TYPES.has(block) &&
    worldY >= 0 &&
    worldY < CHUNK_HEIGHT
  );
}

async function openWorldDatabase(): Promise<IDBPDatabase<WorldDatabase>> {
  return openDB<WorldDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(BLOCK_STORE)) {
        const store = db.createObjectStore(BLOCK_STORE, { keyPath: 'id' });
        store.createIndex('by-world', 'worldSeed');
      }
    },
  });
}

/** Deletes only sparse voxel edits for one stable world id. */
export async function deleteVoxelWorldPersistence(worldId: string): Promise<void> {
  const database = await openWorldDatabase();
  try {
    const transaction = database.transaction(BLOCK_STORE, 'readwrite');
    const keys = await transaction.store.index('by-world').getAllKeys(worldId);
    for (const key of keys) await transaction.store.delete(key);
    await transaction.done;
  } finally {
    database.close();
  }
}

/**
 * Owns deterministic terrain plus sparse player-authored edits and transient
 * coordinate-scoped light emitters. `worldSeed` controls generation while the
 * stable persistence id keeps same-seed worlds completely isolated.
 */
export class VoxelWorldData {
  public readonly worldSeed: string;
  public readonly generator: TerrainGenerator;
  readonly #persistenceId: string;
  readonly #modifications = new Map<string, BlockTypeValue>();
  readonly #modificationsByChunk = new Map<
    string,
    Map<string, SerializedBlockModification>
  >();
  readonly #dynamicLights = new Map<string, SerializedLightEmitter>();
  #database: IDBPDatabase<WorldDatabase> | null = null;

  public constructor(persistenceId: string, terrainSeed = persistenceId) {
    const resolvedId = resolveRuntimeWorldId(persistenceId);
    const resolvedSeed =
      terrainSeed === persistenceId
        ? resolveRuntimeWorldSeed(terrainSeed)
        : terrainSeed;
    this.#persistenceId = resolvedId;
    this.worldSeed = resolvedSeed;
    this.generator = new TerrainGenerator(resolvedSeed);
  }

  public async initialize(): Promise<void> {
    try {
      const database = await openWorldDatabase();
      this.#database = database;
      const records: unknown[] = await database.getAllFromIndex(
        BLOCK_STORE,
        'by-world',
        this.#persistenceId,
      );
      let ignoredRecords = 0;
      for (const record of records) {
        if (
          !isPersistedBlockModification(record) ||
          record.worldSeed !== this.#persistenceId
        ) {
          ignoredRecords += 1;
          continue;
        }
        this.#setMemoryModification(
          record.worldX,
          record.worldY,
          record.worldZ,
          record.block,
        );
      }
      if (ignoredRecords > 0) {
        console.warn(
          `Ignored ${String(ignoredRecords)} invalid persisted voxel record(s).`,
        );
      }
    } catch (error: unknown) {
      console.warn(
        'Voxel persistence is unavailable; using memory-only edits.',
        error,
      );
      this.#database = null;
    }
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.Air;
    const modified = this.#modifications.get(
      createBlockKey(worldX, worldY, worldZ),
    );
    return modified ?? this.generator.sampleBlock(worldX, worldY, worldZ);
  }

  public sampleBiome(worldX: number, worldZ: number): BiomeType {
    return this.generator.sampleBiome(Math.floor(worldX), Math.floor(worldZ));
  }

  public isSolidAt(worldX: number, worldY: number, worldZ: number): boolean {
    return isSolidBlock(this.sampleBlock(worldX, worldY, worldZ));
  }

  public isWaterAt(worldX: number, worldY: number, worldZ: number): boolean {
    return isWaterBlock(this.sampleBlock(worldX, worldY, worldZ));
  }

  public isLavaAt(worldX: number, worldY: number, worldZ: number): boolean {
    return isLavaBlock(this.sampleBlock(worldX, worldY, worldZ));
  }

  public isClimbableAt(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): boolean {
    return isClimbableBlock(this.sampleBlock(worldX, worldY, worldZ));
  }

  public sampleStandingY(worldX: number, worldZ: number): number {
    const blockX = Math.floor(worldX);
    const blockZ = Math.floor(worldZ);
    for (let worldY = CHUNK_HEIGHT - 1; worldY >= 0; worldY -= 1) {
      if (this.isSolidAt(blockX, worldY, blockZ)) {
        return worldY + 0.5 + PLAYER_FOOT_OFFSET;
      }
    }
    return PLAYER_FOOT_OFFSET;
  }

  public setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): boolean {
    validateCoordinate(worldX, 'worldX');
    validateCoordinate(worldY, 'worldY');
    validateCoordinate(worldZ, 'worldZ');
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return false;

    const current = this.sampleBlock(worldX, worldY, worldZ);
    if (current === block) return false;

    const generated = this.generator.sampleBlock(worldX, worldY, worldZ);
    if (block === generated) {
      this.#deleteMemoryModification(worldX, worldY, worldZ);
    } else {
      this.#setMemoryModification(worldX, worldY, worldZ, block);
    }

    void this.#persistBlock(worldX, worldY, worldZ, block, generated).catch(
      (error: unknown) => {
        console.warn('Failed to persist voxel edit.', error);
      },
    );
    notifySurvivalBlockChanged(worldX, worldY, worldZ);
    return true;
  }

  public setDynamicLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    rawLevel: number,
  ): boolean {
    validateCoordinate(worldX, 'worldX');
    validateCoordinate(worldY, 'worldY');
    validateCoordinate(worldZ, 'worldZ');
    const level = Number.isFinite(rawLevel)
      ? Math.min(Math.max(Math.floor(rawLevel), 0), MAXIMUM_LIGHT_LEVEL)
      : 0;
    const key = createBlockKey(worldX, worldY, worldZ);
    const previous = this.#dynamicLights.get(key)?.[3] ?? 0;
    if (previous === level) return false;
    if (level <= 0 || worldY < 0 || worldY >= CHUNK_HEIGHT) {
      this.#dynamicLights.delete(key);
    } else {
      this.#dynamicLights.set(key, [worldX, worldY, worldZ, level]);
    }
    return true;
  }

  public getBuildModifications(
    chunkX: number,
    chunkZ: number,
  ): SerializedBlockModification[] {
    const result: SerializedBlockModification[] = [];
    for (let neighborZ = chunkZ - 1; neighborZ <= chunkZ + 1; neighborZ += 1) {
      for (let neighborX = chunkX - 1; neighborX <= chunkX + 1; neighborX += 1) {
        const modifications = this.#modificationsByChunk.get(
          createChunkKey(neighborX, neighborZ),
        );
        if (modifications !== undefined) result.push(...modifications.values());
      }
    }
    return result;
  }

  public getBuildLightEmitters(
    chunkX: number,
    chunkZ: number,
  ): SerializedLightEmitter[] {
    const minimumX = chunkX * CHUNK_SIZE - LIGHT_PROPAGATION_RADIUS;
    const minimumZ = chunkZ * CHUNK_SIZE - LIGHT_PROPAGATION_RADIUS;
    const maximumX =
      (chunkX + 1) * CHUNK_SIZE - 1 + LIGHT_PROPAGATION_RADIUS;
    const maximumZ =
      (chunkZ + 1) * CHUNK_SIZE - 1 + LIGHT_PROPAGATION_RADIUS;
    const result: SerializedLightEmitter[] = [];
    for (const emitter of this.#dynamicLights.values()) {
      if (
        emitter[0] >= minimumX &&
        emitter[0] <= maximumX &&
        emitter[2] >= minimumZ &&
        emitter[2] <= maximumZ
      ) {
        result.push(emitter);
      }
    }
    return result;
  }

  public get persistenceId(): string {
    return this.#persistenceId;
  }

  public get modificationCount(): number {
    return this.#modifications.size;
  }

  public get dynamicLightCount(): number {
    return this.#dynamicLights.size;
  }

  public dispose(): void {
    this.#database?.close();
    this.#database = null;
    this.#dynamicLights.clear();
  }

  #setMemoryModification(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): void {
    const blockKey = createBlockKey(worldX, worldY, worldZ);
    const modification: SerializedBlockModification = [
      worldX,
      worldY,
      worldZ,
      block,
    ];
    this.#modifications.set(blockKey, block);

    const chunkKey = createChunkKey(
      worldToChunkCoordinate(worldX),
      worldToChunkCoordinate(worldZ),
    );
    let chunkModifications = this.#modificationsByChunk.get(chunkKey);
    if (chunkModifications === undefined) {
      chunkModifications = new Map<string, SerializedBlockModification>();
      this.#modificationsByChunk.set(chunkKey, chunkModifications);
    }
    chunkModifications.set(blockKey, modification);
  }

  #deleteMemoryModification(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    const blockKey = createBlockKey(worldX, worldY, worldZ);
    this.#modifications.delete(blockKey);
    const chunkKey = createChunkKey(
      worldToChunkCoordinate(worldX),
      worldToChunkCoordinate(worldZ),
    );
    const chunkModifications = this.#modificationsByChunk.get(chunkKey);
    chunkModifications?.delete(blockKey);
    if (chunkModifications?.size === 0) {
      this.#modificationsByChunk.delete(chunkKey);
    }
  }

  async #persistBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
    generated: BlockTypeValue,
  ): Promise<void> {
    if (this.#database === null) return;
    const id = createPersistenceKey(
      this.#persistenceId,
      worldX,
      worldY,
      worldZ,
    );
    if (block === generated) {
      await this.#database.delete(BLOCK_STORE, id);
      return;
    }
    await this.#database.put(BLOCK_STORE, {
      id,
      worldSeed: this.#persistenceId,
      worldX,
      worldY,
      worldZ,
      block,
    });
  }
}
