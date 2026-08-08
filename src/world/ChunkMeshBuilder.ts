import {
  getBlockDefinition,
  isFullCubeBlock,
  isFluidBlock,
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
import {
  CHUNK_HEIGHT,
  CHUNK_SECTION_COUNT,
  CHUNK_SECTION_HEIGHT,
  CHUNK_SIZE,
} from './VoxelChunk';

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

const MAXIMUM_MASK_SIZE = CHUNK_SIZE * Math.max(CHUNK_HEIGHT, CHUNK_SIZE);
const FLUID_SURFACE_OFFSET = 0.38;

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
    if (positive) target.push(0, 0, 0, width, height, width, height, 0);
    else target.push(height, 0, height, width, 0, width, 0, 0);
    return;
  }
  if (positive) target.push(0, 0, width, 0, width, height, 0, height);
  else target.push(width, 0, 0, 0, 0, height, width, height);
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

function pushIndependentQuad(
  bucket: MaterialBucket,
  corners: readonly VectorTuple[],
  normal: VectorTuple,
  color: readonly [number, number, number],
  positive = true,
): void {
  const firstVertex = bucket.positions.length / 3;
  for (const corner of corners) {
    bucket.positions.push(corner[0], corner[1], corner[2]);
    bucket.normals.push(normal[0], normal[1], normal[2]);
    bucket.colors.push(color[0], color[1], color[2], 1);
  }
  bucket.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
  pushQuadIndices(bucket.indices, firstVertex, positive);
}

function getCrossDimensions(
  block: BlockTypeValue,
): readonly [radius: number, bottom: number, top: number] {
  if (block === BlockType.Torch) return [0.28, -0.48, 0.48];
  if (block === BlockType.Ladder) return [0.46, -0.5, 0.5];
  if (block === BlockType.OakSapling) return [0.38, -0.5, 0.42];
  if (block === BlockType.Dandelion) return [0.34, -0.5, 0.28];
  return [0.44, -0.5, 0.46];
}

function assertYRange(yStart: number, yEnd: number): void {
  if (
    !Number.isInteger(yStart) ||
    !Number.isInteger(yEnd) ||
    yStart < 0 ||
    yEnd > CHUNK_HEIGHT ||
    yStart >= yEnd
  ) {
    throw new RangeError('Chunk mesh Y range must be a valid non-empty chunk interval.');
  }
}

/** Builds only one vertical 16×8×16 section while sampling a one-cell halo. */
export function buildChunkSectionMeshData(
  chunkX: number,
  chunkZ: number,
  sectionIndex: number,
  sampleWorldBlock: WorldBlockSampler,
  sampleWorldLight: WorldLightSampler = () => MAXIMUM_LIGHT_LEVEL,
): ChunkMeshData {
  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= CHUNK_SECTION_COUNT
  ) {
    throw new RangeError(
      `sectionIndex must be between 0 and ${String(CHUNK_SECTION_COUNT - 1)}.`,
    );
  }
  const yStart = sectionIndex * CHUNK_SECTION_HEIGHT;
  return buildChunkMeshDataRange(
    chunkX,
    chunkZ,
    yStart,
    yStart + CHUNK_SECTION_HEIGHT,
    sampleWorldBlock,
    sampleWorldLight,
  );
}

/** Builds the legacy complete chunk mesh. */
export function buildChunkMeshData(
  chunkX: number,
  chunkZ: number,
  sampleWorldBlock: WorldBlockSampler,
  sampleWorldLight: WorldLightSampler = () => MAXIMUM_LIGHT_LEVEL,
): ChunkMeshData {
  return buildChunkMeshDataRange(
    chunkX,
    chunkZ,
    0,
    CHUNK_HEIGHT,
    sampleWorldBlock,
    sampleWorldLight,
  );
}

function buildChunkMeshDataRange(
  chunkX: number,
  chunkZ: number,
  yStart: number,
  yEnd: number,
  sampleWorldBlock: WorldBlockSampler,
  sampleWorldLight: WorldLightSampler,
): ChunkMeshData {
  assertYRange(yStart, yEnd);
  const rangeHeight = yEnd - yStart;
  const dimensions: VectorTuple = [CHUNK_SIZE, rangeHeight, CHUNK_SIZE];
  const buckets = new Map<BlockTexture, MaterialBucket>();
  const mask = new Int16Array(MAXIMUM_MASK_SIZE);
  const coordinate: MutableVector = [0, 0, 0];
  const neighborOffset: MutableVector = [0, 0, 0];
  let quadCount = 0;
  let sourceFaceCount = 0;

  const sampleSectionBlock = (
    localX: number,
    sectionY: number,
    localZ: number,
  ): BlockTypeValue =>
    sampleWorldBlock(
      chunkX * CHUNK_SIZE + localX,
      yStart + sectionY,
      chunkZ * CHUNK_SIZE + localZ,
    );
  const sampleChunkBlock = (
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
    const dimensionAxis = getComponent(dimensions, axis);
    const dimensionU = getComponent(dimensions, axisU);
    const dimensionV = getComponent(dimensions, axisV);
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
          const blockNear = sampleSectionBlock(...coordinate);
          const blockFar = sampleSectionBlock(
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
                if (mask[nextRowStart + offset] !== encodedFace) break heightLoop;
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
          const sectionCorners: readonly VectorTuple[] = [
            base,
            cornerU,
            cornerUV,
            cornerV,
          ];
          const corners = sectionCorners.map(
            (corner) => [corner[0], corner[1] + yStart, corner[2]] as const,
          );
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
          const worldBlockY = yStart + blockCoordinate[1];
          const worldBlockZ = chunkZ * CHUNK_SIZE + blockCoordinate[2];
          const brightness = lightLevelToBrightness(
            sampleWorldLight(
              worldBlockX + normalX,
              worldBlockY + normalY,
              worldBlockZ + normalZ,
            ),
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

  const fluidDirections = [
    [-1, 0, 0, 0, false],
    [1, 0, 0, 0, true],
    [0, -1, 0, 1, false],
    [0, 1, 0, 1, true],
    [0, 0, -1, 2, false],
    [0, 0, 1, 2, true],
  ] as const;

  for (let localY = yStart; localY < yEnd; localY += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const block = sampleChunkBlock(localX, localY, localZ);
        const definition = getBlockDefinition(block);
        if (definition.renderShape === 'cross') {
          const worldX = chunkX * CHUNK_SIZE + localX;
          const worldZ = chunkZ * CHUNK_SIZE + localZ;
          const brightness = lightLevelToBrightness(
            sampleWorldLight(worldX, localY, worldZ),
          );
          const [red, green, blue] = getBlockFaceColor(
            block,
            1,
            true,
            worldX,
            localY,
            worldZ,
          );
          const color = [
            red * brightness,
            green * brightness,
            blue * brightness,
          ] as const;
          const [radius, bottomOffset, topOffset] = getCrossDimensions(block);
          const bottom = localY + bottomOffset;
          const top = localY + topOffset;
          const bucket = getBucket(
            buckets,
            getBlockFaceTexture(block, 1, true),
          );
          pushIndependentQuad(
            bucket,
            [
              [localX - radius, bottom, localZ - radius],
              [localX + radius, bottom, localZ + radius],
              [localX + radius, top, localZ + radius],
              [localX - radius, top, localZ - radius],
            ],
            [0.707, 0, -0.707],
            color,
          );
          pushIndependentQuad(
            bucket,
            [
              [localX + radius, bottom, localZ - radius],
              [localX - radius, bottom, localZ + radius],
              [localX - radius, top, localZ + radius],
              [localX + radius, top, localZ - radius],
            ],
            [-0.707, 0, -0.707],
            color,
          );
          quadCount += 2;
          sourceFaceCount += 2;
          continue;
        }

        if (!isFluidBlock(block)) continue;
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const aboveSame = sampleChunkBlock(localX, localY + 1, localZ) === block;
        const top = localY + (aboveSame ? 0.5 : FLUID_SURFACE_OFFSET);
        const bottom = localY - 0.5;
        const bucket = getBucket(
          buckets,
          getBlockFaceTexture(block, 1, true),
        );

        for (const [dx, dy, dz, axis, positive] of fluidDirections) {
          const neighbor = sampleChunkBlock(
            localX + dx,
            localY + dy,
            localZ + dz,
          );
          if (neighbor === block || isFullCubeBlock(neighbor)) continue;
          if (isFluidBlock(neighbor) && block > neighbor) continue;
          const brightness = lightLevelToBrightness(
            sampleWorldLight(worldX + dx, localY + dy, worldZ + dz),
          );
          const [red, green, blue] = getBlockFaceColor(
            block,
            axis,
            positive,
            worldX,
            localY,
            worldZ,
          );
          const color = [
            red * brightness,
            green * brightness,
            blue * brightness,
          ] as const;
          let corners: readonly VectorTuple[];
          let normal: VectorTuple;
          if (dy > 0) {
            corners = [
              [localX - 0.5, top, localZ - 0.5],
              [localX + 0.5, top, localZ - 0.5],
              [localX + 0.5, top, localZ + 0.5],
              [localX - 0.5, top, localZ + 0.5],
            ];
            normal = [0, 1, 0];
          } else if (dy < 0) {
            corners = [
              [localX - 0.5, bottom, localZ + 0.5],
              [localX + 0.5, bottom, localZ + 0.5],
              [localX + 0.5, bottom, localZ - 0.5],
              [localX - 0.5, bottom, localZ - 0.5],
            ];
            normal = [0, -1, 0];
          } else if (dx !== 0) {
            const x = localX + dx * 0.5;
            corners = dx > 0
              ? [
                  [x, bottom, localZ + 0.5],
                  [x, bottom, localZ - 0.5],
                  [x, top, localZ - 0.5],
                  [x, top, localZ + 0.5],
                ]
              : [
                  [x, bottom, localZ - 0.5],
                  [x, bottom, localZ + 0.5],
                  [x, top, localZ + 0.5],
                  [x, top, localZ - 0.5],
                ];
            normal = [dx, 0, 0];
          } else {
            const z = localZ + dz * 0.5;
            corners = dz > 0
              ? [
                  [localX - 0.5, bottom, z],
                  [localX + 0.5, bottom, z],
                  [localX + 0.5, top, z],
                  [localX - 0.5, top, z],
                ]
              : [
                  [localX + 0.5, bottom, z],
                  [localX - 0.5, bottom, z],
                  [localX - 0.5, top, z],
                  [localX + 0.5, top, z],
                ];
            normal = [0, 0, dz];
          }
          pushIndependentQuad(bucket, corners, normal, color, true);
          quadCount += 1;
          sourceFaceCount += 1;
        }
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
