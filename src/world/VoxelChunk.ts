import type { BlockType } from './BlockType';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 32;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer.`);
  }
}

function assertLocalCoordinate(
  value: number,
  maximumExclusive: number,
  label: string,
): void {
  assertInteger(value, label);
  if (value < 0 || value >= maximumExclusive) {
    throw new RangeError(
      `${label} must be between 0 and ${String(maximumExclusive - 1)}.`,
    );
  }
}

export function worldToChunkCoordinate(worldCoordinate: number): number {
  assertInteger(worldCoordinate, 'worldCoordinate');
  return Math.floor(worldCoordinate / CHUNK_SIZE);
}

export function worldToLocalCoordinate(worldCoordinate: number): number {
  assertInteger(worldCoordinate, 'worldCoordinate');
  const remainder = worldCoordinate % CHUNK_SIZE;
  if (Object.is(remainder, -0) || remainder === 0) {
    return 0;
  }
  return remainder < 0 ? remainder + CHUNK_SIZE : remainder;
}

export function createChunkKey(chunkX: number, chunkZ: number): string {
  assertInteger(chunkX, 'chunkX');
  assertInteger(chunkZ, 'chunkZ');
  return `${String(chunkX)},${String(chunkZ)}`;
}

export class VoxelChunk {
  public readonly chunkX: number;
  public readonly chunkZ: number;
  readonly #blocks: Uint8Array;

  public constructor(
    chunkX: number,
    chunkZ: number,
    blocks: Uint8Array = new Uint8Array(CHUNK_VOLUME),
  ) {
    assertInteger(chunkX, 'chunkX');
    assertInteger(chunkZ, 'chunkZ');
    if (blocks.length !== CHUNK_VOLUME) {
      throw new RangeError(
        `Chunk data must contain ${String(CHUNK_VOLUME)} block entries.`,
      );
    }

    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.#blocks = blocks.slice();
  }

  public get key(): string {
    return createChunkKey(this.chunkX, this.chunkZ);
  }

  public getBlock(localX: number, localY: number, localZ: number): BlockType {
    const index = this.#getIndex(localX, localY, localZ);
    const block = this.#blocks[index];
    if (block === undefined) {
      throw new RangeError('Resolved block index is outside the chunk storage.');
    }
    return block as BlockType;
  }

  public setBlock(
    localX: number,
    localY: number,
    localZ: number,
    block: BlockType,
  ): void {
    this.#blocks[this.#getIndex(localX, localY, localZ)] = block;
  }

  public copyBlocks(): Uint8Array {
    return this.#blocks.slice();
  }

  public countBlocks(block: BlockType): number {
    let count = 0;
    for (const storedBlock of this.#blocks) {
      if (storedBlock === block) {
        count += 1;
      }
    }
    return count;
  }

  #getIndex(localX: number, localY: number, localZ: number): number {
    assertLocalCoordinate(localX, CHUNK_SIZE, 'localX');
    assertLocalCoordinate(localY, CHUNK_HEIGHT, 'localY');
    assertLocalCoordinate(localZ, CHUNK_SIZE, 'localZ');
    return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * localY);
  }
}
