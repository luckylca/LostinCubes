import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { BlockType, isSolidBlock } from './BlockType';
import type { SerializedBlockModification } from './ChunkBuildProtocol';
import type { BlockType as BlockTypeValue } from './BlockType';
import { TerrainGenerator } from './TerrainGenerator';
import {
  CHUNK_HEIGHT,
  createChunkKey,
  worldToChunkCoordinate,
} from './VoxelChunk';

const PLAYER_FOOT_OFFSET = 0.9;
const DATABASE_NAME = 'lost-in-cubes-worlds';
const DATABASE_VERSION = 1;
const BLOCK_STORE = 'blocks';

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
  worldSeed: string,
  worldX: number,
  worldY: number,
  worldZ: number,
): string {
  return `${worldSeed}:${createBlockKey(worldX, worldY, worldZ)}`;
}

function validateCoordinate(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer.`);
  }
}

/**
 * Owns deterministic terrain plus the sparse player-authored delta layer.
 * Generated terrain is never copied into memory; only changed blocks are kept.
 */
export class VoxelWorldData {
  public readonly worldSeed: string;
  public readonly generator: TerrainGenerator;
  readonly #modifications = new Map<string, BlockTypeValue>();
  readonly #modificationsByChunk = new Map<
    string,
    Map<string, SerializedBlockModification>
  >();
  #database: IDBPDatabase<WorldDatabase> | null = null;

  public constructor(worldSeed: string) {
    this.worldSeed = worldSeed;
    this.generator = new TerrainGenerator(worldSeed);
  }

  public async initialize(): Promise<void> {
    try {
      const database = await openDB<WorldDatabase>(
        DATABASE_NAME,
        DATABASE_VERSION,
        {
          upgrade(db) {
            if (!db.objectStoreNames.contains(BLOCK_STORE)) {
              const store = db.createObjectStore(BLOCK_STORE, { keyPath: 'id' });
              store.createIndex('by-world', 'worldSeed');
            }
          },
        },
      );
      this.#database = database;
      const records = await database.getAllFromIndex(
        BLOCK_STORE,
        'by-world',
        this.worldSeed,
      );
      for (const record of records) {
        this.#setMemoryModification(
          record.worldX,
          record.worldY,
          record.worldZ,
          record.block,
        );
      }
    } catch (error: unknown) {
      console.warn('Voxel persistence is unavailable; using memory-only edits.', error);
      this.#database = null;
    }
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return BlockType.Air;
    }

    const modified = this.#modifications.get(
      createBlockKey(worldX, worldY, worldZ),
    );
    return modified ?? this.generator.sampleBlock(worldX, worldY, worldZ);
  }

  public isSolidAt(worldX: number, worldY: number, worldZ: number): boolean {
    return isSolidBlock(this.sampleBlock(worldX, worldY, worldZ));
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
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return false;
    }

    const current = this.sampleBlock(worldX, worldY, worldZ);
    if (current === block) {
      return false;
    }

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
        if (modifications !== undefined) {
          result.push(...modifications.values());
        }
      }
    }
    return result;
  }

  public get modificationCount(): number {
    return this.#modifications.size;
  }

  public dispose(): void {
    this.#database?.close();
    this.#database = null;
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
    if (this.#database === null) {
      return;
    }

    const id = createPersistenceKey(
      this.worldSeed,
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
      worldSeed: this.worldSeed,
      worldX,
      worldY,
      worldZ,
      block,
    });
  }
}
