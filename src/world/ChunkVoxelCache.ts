import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './VoxelChunk';
import { LIGHT_PROPAGATION_RADIUS } from './VoxelLightEngine';

export type WorldBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

/**
 * Materializes the complete bounded volume needed by one chunk build.
 *
 * Lighting and meshing previously called the procedural terrain sampler many
 * times for the same coordinates. The light volume already includes the full
 * 15-block propagation margin, so one compact byte cache can serve sky light,
 * block light, flood propagation, and the final mesh without recomputing
 * terrain noise or tree placement.
 */
export class ChunkVoxelCache {
  readonly #source: WorldBlockSampler;
  readonly #blocks: Uint8Array;
  readonly #minimumX: number;
  readonly #minimumZ: number;
  readonly #sizeX: number;
  readonly #sizeZ: number;
  readonly #layerSize: number;

  public constructor(
    chunkX: number,
    chunkZ: number,
    source: WorldBlockSampler,
  ) {
    const margin = LIGHT_PROPAGATION_RADIUS;
    this.#source = source;
    this.#minimumX = chunkX * CHUNK_SIZE - margin;
    this.#minimumZ = chunkZ * CHUNK_SIZE - margin;
    this.#sizeX = CHUNK_SIZE + margin * 2;
    this.#sizeZ = CHUNK_SIZE + margin * 2;
    this.#layerSize = this.#sizeX * this.#sizeZ;
    this.#blocks = new Uint8Array(this.#layerSize * CHUNK_HEIGHT);

    for (let worldY = 0; worldY < CHUNK_HEIGHT; worldY += 1) {
      const layerOffset = worldY * this.#layerSize;
      for (let localZ = 0; localZ < this.#sizeZ; localZ += 1) {
        const worldZ = this.#minimumZ + localZ;
        const rowOffset = layerOffset + localZ * this.#sizeX;
        for (let localX = 0; localX < this.#sizeX; localX += 1) {
          const worldX = this.#minimumX + localX;
          this.#blocks[rowOffset + localX] = source(
            worldX,
            worldY,
            worldZ,
          );
        }
      }
    }
  }

  public sample = (
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue => {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) return BlockType.Air;
    const localX = worldX - this.#minimumX;
    const localZ = worldZ - this.#minimumZ;
    if (
      localX < 0 ||
      localX >= this.#sizeX ||
      localZ < 0 ||
      localZ >= this.#sizeZ
    ) {
      return this.#source(worldX, worldY, worldZ);
    }
    return this.#blocks[
      localX + localZ * this.#sizeX + worldY * this.#layerSize
    ] as BlockTypeValue;
  };

  public get cachedCellCount(): number {
    return this.#blocks.length;
  }
}
