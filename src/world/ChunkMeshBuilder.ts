import {
  isFullCubeBlock,
  shouldMergeBlockFaces,
} from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { getBlockFaceColor } from './BlockVisuals';
import {
  getBlockFaceTexture,
  type BlockTexture,
} from './BlockTextureLibrary';
import { lightLevelToBrightness, MAXIMUM_LIGHT_LEVEL } from './VoxelLightEngine';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './VoxelChunk';

type VectorTuple = readonly [number, number, number];
type MutableVector = [number, number, number];

export interface ChunkMaterialRange {
  readonly texture: BlockTexture;
  readonly indexStart: number;
  readonly indexCount: number;
}

export interface ChunkMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly colors: Float32Array;
  readonly uvs: Float32Array;
  readonly materialRanges: readonly ChunkMaterialRange[];
  readonly quadCount: number;
  readonly sourceFaceCount: number;
}

export type WorldBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

export type WorldLightSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => number;

interface MaterialBucket {
  readonly texture: BlockTexture;
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
  readonly colors: number[];
  readonly uvs: number[];
}

const DIMENSIONS: VectorTuple = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];
const MAXIMUM_MASK_SIZE = Math.max(
  CHUNK_SIZE * CHUNK_HEIGHT,
  CHUNK_SIZE * CHUNK_SIZE,
);

function getComponent(vector: VectorTuple | MutableVector, axis: number): number {
  if (axis === 0) return vector[0];
  if (axis === 1) return vector[1];
  return vector[2];
}

function setComponent(
  vector: MutableVector,
  axis: number,
  value: number,
): void {
  if (axis === 0) vector[0] = value;
  else if (axis === 1) vector[1] = value;
  else vector[2] = value;
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

function createBucket(texture: BlockTexture): MaterialBucket {
  return {
    texture,
    positions: [],
    normals: [],
    indices: [],
    colors: [],
    uvs: [],
  };
}

function getBucket(
  buckets: Map<BlockTexture, MaterialBucket>,
  texture: BlockTexture,
): MaterialBucket {
  const existing = buckets.get(texture);
  if (existing !== undefined) return existing;
  const created = createBucket(texture);
  buckets.set(texture, created);
  return created;
}

function pushQuadUvs(
  target: number[],
  axis: number,
  width: number,
  height: number,
  positive: boolean,
): void {
  if (axis === 0) {
    if (positive) {
      target.push(0, 0, 0, width, height, width, height, 0);
    } else {
      target.push(height, 0, height, width, 0, width, 0, 0);
    }
    return;
  }

  if (positive) {
    target.push(0, 0, width, 0, width, height, 0, height);
  } else {
    target.push(width, 0, 0, 0, 0, height, width, height);
  }
}

function pushQuadIndices(
  target: number[],
  firstVertex: number,
  positive: boolean,
): void {
  if (positive) {
    target.push(
      firstVertex,
      firstVertex + 2,
      firstVertex + 1,
      firstVertex,
      firstVertex + 3,
      firstVertex + 2,
    );
  } else {
    target.push(
      firstVertex,
      firstVertex + 1,
      firstVertex + 2,
      firstVertex,
      firstVertex + 2,
      firstVertex + 3,
    );
  }
}

function pushTorchQuad(
  bucket: MaterialBucket,
  corners: readonly VectorTuple[],
  brightness: number,
): void {
  const firstVertex = bucket.positions.length / 3;
  for (const corner of corners) {
    bucket.positions.push(corner[0], corner[1], corner[2]);
    bucket.normals.push(0, 1, 0);
    bucket.colors.push(brightness, brightness, brightness, 1);
  }
  bucket.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
  pushQuadIndices(bucket.indices, firstVertex, true);
}

/**
 * Builds one chunk mesh. Full cubes use greedy meshing; registered cross-shape
 * blocks are appended as bounded two-sided quads. Vertex color includes the
 * chunk's classic 0-15 sky/block light field.
 */
export function buildChunkMeshData(
  chunkX: number,
  chunkZ: number,
  sampleWorldBlock: WorldBlockSampler,
  sampleWorldLight: WorldLightSampler = () => MAXIMUM_LIGHT_LEVEL,
): ChunkMeshData {
  const buckets = new Map<BlockTexture, MaterialBucket>();
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
          const nearCube = isFullCubeBlock(blockNear);
          const farCube = isFullCubeBlock(blockFar);

          let encodedFace = 0;
          if (nearCube !== farCube) {
            if (nearCube && slice >= 0 && slice < dimensionAxis) {
              encodedFace = blockNear;
            } else if (
              farCube &&
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

          const block = Math.abs(encodedFace) as BlockTypeValue;
          const mergeFace = shouldMergeBlockFaces(block);
          let width = 1;
          if (mergeFace) {
            while (
              column + width < dimensionU &&
              mask[startIndex + width] === encodedFace
            ) {
              width += 1;
            }
          }

          let height = 1;
          if (mergeFace) {
            heightLoop: while (row + height < dimensionV) {
              const nextRowStart = startIndex + height * dimensionU;
              for (let offset = 0; offset < width; offset += 1) {
                if (mask[nextRowStart + offset] !== encodedFace) {
                  break heightLoop;
                }
              }
              height += 1;
            }
          }

          for (let clearRow = 0; clearRow < height; clearRow += 1) {
            const clearStart = startIndex + clearRow * dimensionU;
            mask.fill(0, clearStart, clearStart + width);
          }

          const positive = encodedFace > 0;
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
          const texture = getBlockFaceTexture(block, axis, positive);
          const bucket = getBucket(buckets, texture);
          const firstVertex = bucket.positions.length / 3;
          const normalX = axis === 0 ? (positive ? 1 : -1) : 0;
          const normalY = axis === 1 ? (positive ? 1 : -1) : 0;
          const normalZ = axis === 2 ? (positive ? 1 : -1) : 0;

          const blockCoordinate: MutableVector = [0, 0, 0];
          setComponent(blockCoordinate, axis, positive ? slice : slice + 1);
          setComponent(blockCoordinate, axisU, column);
          setComponent(blockCoordinate, axisV, row);
          const worldBlockX = chunkX * CHUNK_SIZE + blockCoordinate[0];
          const worldBlockY = blockCoordinate[1];
          const worldBlockZ = chunkZ * CHUNK_SIZE + blockCoordinate[2];
          const outsideX = worldBlockX + normalX;
          const outsideY = worldBlockY + normalY;
          const outsideZ = worldBlockZ + normalZ;
          const brightness = lightLevelToBrightness(
            sampleWorldLight(outsideX, outsideY, outsideZ),
          );
          const [red, green, blue] = getBlockFaceColor(
            block,
            axis,
            positive,
            worldBlockX,
            worldBlockY,
            worldBlockZ,
          );

          for (const corner of corners) {
            bucket.positions.push(corner[0], corner[1], corner[2]);
            bucket.normals.push(normalX, normalY, normalZ);
            bucket.colors.push(
              red * brightness,
              green * brightness,
              blue * brightness,
              1,
            );
          }
          pushQuadUvs(bucket.uvs, axis, width, height, positive);
          pushQuadIndices(bucket.indices, firstVertex, positive);

          quadCount += 1;
          sourceFaceCount += width * height;
          column += width;
        }
      }
    }
  }

  const torchBucket = getBucket(
    buckets,
    getBlockFaceTexture(BlockType.Torch, 1, true),
  );
  for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        if (sampleLocalBlock(localX, localY, localZ) !== BlockType.Torch) continue;
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const brightness = lightLevelToBrightness(
          sampleWorldLight(worldX, localY, worldZ),
        );
        const bottom = localY - 0.48;
        const top = localY + 0.48;
        const radius = 0.28;
        pushTorchQuad(torchBucket, [
          [localX - radius, bottom, localZ - radius],
          [localX + radius, bottom, localZ + radius],
          [localX + radius, top, localZ + radius],
          [localX - radius, top, localZ - radius],
        ], brightness);
        pushTorchQuad(torchBucket, [
          [localX + radius, bottom, localZ - radius],
          [localX - radius, bottom, localZ + radius],
          [localX - radius, top, localZ + radius],
          [localX + radius, top, localZ - radius],
        ], brightness);
        quadCount += 2;
        sourceFaceCount += 2;
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const materialRanges: ChunkMaterialRange[] = [];
  const orderedBuckets = [...buckets.values()]
    .filter((bucket) => bucket.indices.length > 0)
    .sort((left, right) => left.texture - right.texture);

  for (const bucket of orderedBuckets) {
    const vertexOffset = positions.length / 3;
    const indexStart = indices.length;
    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
    colors.push(...bucket.colors);
    uvs.push(...bucket.uvs);
    for (const index of bucket.indices) indices.push(index + vertexOffset);
    materialRanges.push({
      texture: bucket.texture,
      indexStart,
      indexCount: bucket.indices.length,
    });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    materialRanges,
    quadCount,
    sourceFaceCount,
  };
}
