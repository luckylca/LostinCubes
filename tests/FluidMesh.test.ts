import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import { buildChunkMeshData } from '../src/world/ChunkMeshBuilder';
import { BlockTexture } from '../src/world/BlockTextureLibrary';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  VoxelChunk,
} from '../src/world/VoxelChunk';

function build(chunk: VoxelChunk) {
  return buildChunkMeshData(
    chunk.chunkX,
    chunk.chunkZ,
    (worldX, worldY, worldZ) => {
      const localX = worldX - chunk.chunkX * CHUNK_SIZE;
      const localZ = worldZ - chunk.chunkZ * CHUNK_SIZE;
      if (
        localX < 0 ||
        localX >= CHUNK_SIZE ||
        localZ < 0 ||
        localZ >= CHUNK_SIZE ||
        worldY < 0 ||
        worldY >= CHUNK_HEIGHT
      ) {
        return BlockType.Air;
      }
      return chunk.getBlock(localX, worldY, localZ);
    },
  );
}

describe('fluid chunk meshing', () => {
  it('renders one isolated water voxel with a lowered exposed surface', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(3, 5, 4, BlockType.Water);

    const mesh = build(chunk);

    expect(mesh.quadCount).toBe(6);
    expect(mesh.sourceFaceCount).toBe(6);
    expect(mesh.materialRanges).toEqual([
      {
        texture: BlockTexture.Water,
        indexStart: 0,
        indexCount: 36,
      },
    ]);
    const yCoordinates = Array.from(mesh.positions).filter(
      (_value, index) => index % 3 === 1,
    );
    expect(Math.max(...yCoordinates)).toBeCloseTo(5.38, 5);
  });

  it('culls the internal face between adjacent water voxels', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(3, 5, 4, BlockType.Water);
    chunk.setBlock(4, 5, 4, BlockType.Water);

    const mesh = build(chunk);

    expect(mesh.quadCount).toBe(10);
    expect(mesh.sourceFaceCount).toBe(10);
    expect(mesh.indices).toHaveLength(60);
  });

  it('keeps lava separate from neighboring water and uses its own material', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(3, 5, 4, BlockType.Water);
    chunk.setBlock(4, 5, 4, BlockType.Lava);

    const mesh = build(chunk);
    const textures = mesh.materialRanges.map((range) => range.texture);

    expect(textures).toContain(BlockTexture.Water);
    expect(textures).toContain(BlockTexture.Lava);
    expect(mesh.quadCount).toBeGreaterThanOrEqual(11);
  });

  it('renders plants and ladders as two crossed quads without collision cubes', () => {
    const chunk = new VoxelChunk(0, 0);
    chunk.setBlock(3, 5, 4, BlockType.TallGrass);
    chunk.setBlock(6, 5, 4, BlockType.Ladder);

    const mesh = build(chunk);

    expect(mesh.quadCount).toBe(4);
    expect(mesh.sourceFaceCount).toBe(4);
    expect(mesh.materialRanges.map((range) => range.texture)).toEqual([
      BlockTexture.Ladder,
      BlockTexture.TallGrass,
    ]);
  });
});
