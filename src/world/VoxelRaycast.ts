import { isSolidBlock } from './BlockType';
import type { WorldBlockSampler } from './ChunkMeshBuilder';

export interface RayVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelRaycastHit {
  readonly block: VoxelCoordinate;
  readonly adjacent: VoxelCoordinate;
  readonly normal: VoxelCoordinate;
  readonly distance: number;
}

function getInitialDistance(
  origin: number,
  cell: number,
  direction: number,
): number {
  if (direction > 0) {
    return (cell + 0.5 - origin) / direction;
  }
  if (direction < 0) {
    return (cell - 0.5 - origin) / direction;
  }
  return Number.POSITIVE_INFINITY;
}

export function raycastVoxels(
  origin: RayVector,
  direction: RayVector,
  maximumDistance: number,
  sampleBlock: WorldBlockSampler,
): VoxelRaycastHit | null {
  if (!Number.isFinite(maximumDistance) || maximumDistance <= 0) {
    throw new RangeError('maximumDistance must be positive and finite.');
  }

  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length <= 1e-8) {
    return null;
  }

  const directionX = direction.x / length;
  const directionY = direction.y / length;
  const directionZ = direction.z / length;
  let cellX = Math.floor(origin.x + 0.5);
  let cellY = Math.floor(origin.y + 0.5);
  let cellZ = Math.floor(origin.z + 0.5);
  const stepX = Math.sign(directionX);
  const stepY = Math.sign(directionY);
  const stepZ = Math.sign(directionZ);
  const deltaX =
    directionX === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(directionX);
  const deltaY =
    directionY === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(directionY);
  const deltaZ =
    directionZ === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(directionZ);
  let nextX = getInitialDistance(origin.x, cellX, directionX);
  let nextY = getInitialDistance(origin.y, cellY, directionY);
  let nextZ = getInitialDistance(origin.z, cellZ, directionZ);
  let distance = 0;

  while (distance <= maximumDistance) {
    const previousX = cellX;
    const previousY = cellY;
    const previousZ = cellZ;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;

    if (nextX <= nextY && nextX <= nextZ) {
      cellX += stepX;
      distance = nextX;
      nextX += deltaX;
      normalX = -stepX;
    } else if (nextY <= nextZ) {
      cellY += stepY;
      distance = nextY;
      nextY += deltaY;
      normalY = -stepY;
    } else {
      cellZ += stepZ;
      distance = nextZ;
      nextZ += deltaZ;
      normalZ = -stepZ;
    }

    if (distance > maximumDistance) {
      break;
    }

    if (isSolidBlock(sampleBlock(cellX, cellY, cellZ))) {
      return {
        block: { x: cellX, y: cellY, z: cellZ },
        adjacent: { x: previousX, y: previousY, z: previousZ },
        normal: { x: normalX, y: normalY, z: normalZ },
        distance,
      };
    }
  }

  return null;
}
