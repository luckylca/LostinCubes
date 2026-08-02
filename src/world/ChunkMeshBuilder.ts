import { BlockType, isSolidBlock } from './BlockType';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './VoxelChunk';
import type { BlockType as BlockTypeValue } from './BlockType';
import type { VoxelChunk } from './VoxelChunk';

type VectorTuple = readonly [number, number, number];

interface FaceDefinition {
  readonly neighborOffset: VectorTuple;
  readonly normal: VectorTuple;
  readonly vertices: readonly [VectorTuple, VectorTuple, VectorTuple, VectorTuple];
  readonly shade: number;
}

export interface ChunkMeshData {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
  readonly colors: number[];
  readonly faceCount: number;
}

export type WorldBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

const FACES: readonly FaceDefinition[] = [
  {
    neighborOffset: [1, 0, 0],
    normal: [1, 0, 0],
    vertices: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
    ],
    shade: 0.78,
  },
  {
    neighborOffset: [-1, 0, 0],
    normal: [-1, 0, 0],
    vertices: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ],
    shade: 0.72,
  },
  {
    neighborOffset: [0, 1, 0],
    normal: [0, 1, 0],
    vertices: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
    shade: 1,
  },
  {
    neighborOffset: [0, -1, 0],
    normal: [0, -1, 0],
    vertices: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
    shade: 0.55,
  },
  {
    neighborOffset: [0, 0, 1],
    normal: [0, 0, 1],
    vertices: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    shade: 0.84,
  },
  {
    neighborOffset: [0, 0, -1],
    normal: [0, 0, -1],
    vertices: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ],
    shade: 0.68,
  },
];

function getBlockColor(block: BlockTypeValue): VectorTuple {
  switch (block) {
    case BlockType.Grass:
      return [0.2, 0.52, 0.27];
    case BlockType.Dirt:
      return [0.42, 0.25, 0.12];
    case BlockType.RuneStone:
      return [0.12, 0.58, 0.34];
    case BlockType.Stone:
      return [0.4, 0.44, 0.42];
    case BlockType.Air:
      return [0, 0, 0];
  }
}

export function buildChunkMeshData(
  chunk: VoxelChunk,
  sampleWorldBlock: WorldBlockSampler,
): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let faceCount = 0;

  for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const block = chunk.getBlock(localX, localY, localZ);
        if (!isSolidBlock(block)) {
          continue;
        }

        const worldX = chunk.chunkX * CHUNK_SIZE + localX;
        const worldZ = chunk.chunkZ * CHUNK_SIZE + localZ;
        const [red, green, blue] = getBlockColor(block);

        for (const face of FACES) {
          const [offsetX, offsetY, offsetZ] = face.neighborOffset;
          if (
            isSolidBlock(
              sampleWorldBlock(
                worldX + offsetX,
                localY + offsetY,
                worldZ + offsetZ,
              ),
            )
          ) {
            continue;
          }

          const firstVertex = positions.length / 3;
          const [normalX, normalY, normalZ] = face.normal;

          for (const vertex of face.vertices) {
            const [vertexX, vertexY, vertexZ] = vertex;
            positions.push(
              localX + vertexX,
              localY + vertexY,
              localZ + vertexZ,
            );
            normals.push(normalX, normalY, normalZ);
            colors.push(
              red * face.shade,
              green * face.shade,
              blue * face.shade,
              1,
            );
          }

          // Babylon's default left-handed scene treats clockwise triangles as
          // front-facing. The face vertex tables are authored with outward
          // normals, so the index order is intentionally reversed here.
          indices.push(
            firstVertex,
            firstVertex + 2,
            firstVertex + 1,
            firstVertex,
            firstVertex + 3,
            firstVertex + 2,
          );
          faceCount += 1;
        }
      }
    }
  }

  return { positions, normals, indices, colors, faceCount };
}
