import { BlockType, isSolidBlock } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './VoxelChunk';

type VectorTuple = readonly [number, number, number];
type MutableVector = [number, number, number];

export interface ChunkMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly colors: Float32Array;
  readonly quadCount: number;
  readonly sourceFaceCount: number;
}

export type WorldBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

const DIMENSIONS: VectorTuple = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];
const MAXIMUM_MASK_SIZE = Math.max(
  CHUNK_SIZE * CHUNK_HEIGHT,
  CHUNK_SIZE * CHUNK_SIZE,
);

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

function getFaceShade(axis: number, positive: boolean): number {
  if (axis === 0) {
    return positive ? 0.78 : 0.72;
  }
  if (axis === 1) {
    return positive ? 1 : 0.55;
  }
  return positive ? 0.84 : 0.68;
}

function getComponent(vector: VectorTuple | MutableVector, axis: number): number {
  if (axis === 0) {
    return vector[0];
  }
  if (axis === 1) {
    return vector[1];
  }
  return vector[2];
}

function setComponent(
  vector: MutableVector,
  axis: number,
  value: number,
): void {
  if (axis === 0) {
    vector[0] = value;
  } else if (axis === 1) {
    vector[1] = value;
  } else {
    vector[2] = value;
  }
}

function addVectors(
  first: VectorTuple | MutableVector,
  second: VectorTuple | MutableVector,
): MutableVector {
  return [
    first[0] + second[0],
    first[1] + second[1],
    first[2] + second[2],
  ];
}

/**
 * Builds a greedy-meshed chunk. Adjacent coplanar faces with the same block
 * material and normal are collapsed into one quad before data reaches Babylon.
 */
export function buildChunkMeshData(
  chunkX: number,
  chunkZ: number,
  sampleWorldBlock: WorldBlockSampler,
): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const mask = new Int16Array(MAXIMUM_MASK_SIZE);
  const coordinate: MutableVector = [0, 0, 0];
  const neighborOffset: MutableVector = [0, 0, 0];
  let quadCount = 0;
  let sourceFaceCount = 0;

  const sampleLocalBlock = (
    localX: number,
    localY: number,
    localZ: number,
  ): BlockTypeValue =>
    sampleWorldBlock(
      chunkX * CHUNK_SIZE + localX,
      localY,
      chunkZ * CHUNK_SIZE + localZ,
    );

  for (let axis = 0; axis < 3; axis += 1) {
    const axisU = (axis + 1) % 3;
    const axisV = (axis + 2) % 3;
    const dimensionAxis = getComponent(DIMENSIONS, axis);
    const dimensionU = getComponent(DIMENSIONS, axisU);
    const dimensionV = getComponent(DIMENSIONS, axisV);
    neighborOffset[0] = 0;
    neighborOffset[1] = 0;
    neighborOffset[2] = 0;
    setComponent(neighborOffset, axis, 1);

    for (let slice = -1; slice < dimensionAxis; slice += 1) {
      setComponent(coordinate, axis, slice);
      let maskIndex = 0;
      for (let row = 0; row < dimensionV; row += 1) {
        setComponent(coordinate, axisV, row);
        for (let column = 0; column < dimensionU; column += 1) {
          setComponent(coordinate, axisU, column);
          const blockNear = sampleLocalBlock(...coordinate);
          const blockFar = sampleLocalBlock(
            coordinate[0] + neighborOffset[0],
            coordinate[1] + neighborOffset[1],
            coordinate[2] + neighborOffset[2],
          );
          const nearSolid = isSolidBlock(blockNear);
          const farSolid = isSolidBlock(blockFar);

          let encodedFace = 0;
          if (nearSolid !== farSolid) {
            if (nearSolid && slice >= 0 && slice < dimensionAxis) {
              encodedFace = blockNear;
            } else if (
              farSolid &&
              slice + 1 >= 0 &&
              slice + 1 < dimensionAxis
            ) {
              encodedFace = -blockFar;
            }
          }
          mask[maskIndex] = encodedFace;
          maskIndex += 1;
        }
      }

      for (let row = 0; row < dimensionV; row += 1) {
        for (let column = 0; column < dimensionU; ) {
          const startIndex = column + row * dimensionU;
          const encodedFace = mask[startIndex] ?? 0;
          if (encodedFace === 0) {
            column += 1;
            continue;
          }

          let width = 1;
          while (
            column + width < dimensionU &&
            mask[startIndex + width] === encodedFace
          ) {
            width += 1;
          }

          let height = 1;
          heightLoop: while (row + height < dimensionV) {
            const nextRowStart = startIndex + height * dimensionU;
            for (let offset = 0; offset < width; offset += 1) {
              if (mask[nextRowStart + offset] !== encodedFace) {
                break heightLoop;
              }
            }
            height += 1;
          }

          for (let clearRow = 0; clearRow < height; clearRow += 1) {
            const clearStart = startIndex + clearRow * dimensionU;
            mask.fill(0, clearStart, clearStart + width);
          }

          const positive = encodedFace > 0;
          const block = Math.abs(encodedFace) as BlockTypeValue;
          const shade = getFaceShade(axis, positive);
          const [red, green, blue] = getBlockColor(block);
          const base: MutableVector = [0, 0, 0];
          const edgeU: MutableVector = [0, 0, 0];
          const edgeV: MutableVector = [0, 0, 0];
          setComponent(base, axis, slice + 0.5);
          setComponent(base, axisU, column - 0.5);
          setComponent(base, axisV, row - 0.5);
          setComponent(edgeU, axisU, width);
          setComponent(edgeV, axisV, height);

          const cornerU = addVectors(base, edgeU);
          const cornerV = addVectors(base, edgeV);
          const cornerUV = addVectors(cornerU, edgeV);
          const corners: readonly VectorTuple[] = [
            base,
            cornerU,
            cornerUV,
            cornerV,
          ];
          const firstVertex = positions.length / 3;
          const normalX = axis === 0 ? (positive ? 1 : -1) : 0;
          const normalY = axis === 1 ? (positive ? 1 : -1) : 0;
          const normalZ = axis === 2 ? (positive ? 1 : -1) : 0;

          for (const corner of corners) {
            positions.push(corner[0], corner[1], corner[2]);
            normals.push(normalX, normalY, normalZ);
            colors.push(red * shade, green * shade, blue * shade, 1);
          }

          // Babylon's default left-handed scene uses clockwise front faces.
          if (positive) {
            indices.push(
              firstVertex,
              firstVertex + 2,
              firstVertex + 1,
              firstVertex,
              firstVertex + 3,
              firstVertex + 2,
            );
          } else {
            indices.push(
              firstVertex,
              firstVertex + 1,
              firstVertex + 2,
              firstVertex,
              firstVertex + 2,
              firstVertex + 3,
            );
          }

          quadCount += 1;
          sourceFaceCount += width * height;
          column += width;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
    quadCount,
    sourceFaceCount,
  };
}
