export interface CollisionVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelBodyShape {
  readonly radius: number;
  readonly halfHeight: number;
}

export type VoxelSolidProvider = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => boolean;

const COLLISION_EPSILON = 1e-6;

function firstBlockCoordinate(minimum: number): number {
  return Math.floor(minimum + 0.5 + COLLISION_EPSILON);
}

function lastBlockCoordinate(maximum: number): number {
  return Math.floor(maximum + 0.5 - COLLISION_EPSILON);
}

/**
 * Tests the player's axis-aligned body against integer-centered unit voxels.
 * Touching a face is allowed; only positive-volume overlap counts as collision.
 */
export function voxelBodyCollides(
  isSolidAt: VoxelSolidProvider,
  position: CollisionVector,
  shape: VoxelBodyShape,
): boolean {
  const minimumX = position.x - shape.radius;
  const maximumX = position.x + shape.radius;
  const minimumY = position.y - shape.halfHeight;
  const maximumY = position.y + shape.halfHeight;
  const minimumZ = position.z - shape.radius;
  const maximumZ = position.z + shape.radius;

  const firstX = firstBlockCoordinate(minimumX);
  const lastX = lastBlockCoordinate(maximumX);
  const firstY = firstBlockCoordinate(minimumY);
  const lastY = lastBlockCoordinate(maximumY);
  const firstZ = firstBlockCoordinate(minimumZ);
  const lastZ = lastBlockCoordinate(maximumZ);

  for (let worldY = firstY; worldY <= lastY; worldY += 1) {
    for (let worldZ = firstZ; worldZ <= lastZ; worldZ += 1) {
      for (let worldX = firstX; worldX <= lastX; worldX += 1) {
        if (isSolidAt(worldX, worldY, worldZ)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function voxelBodyIsSupported(
  isSolidAt: VoxelSolidProvider,
  position: CollisionVector,
  shape: VoxelBodyShape,
  probeDistance = 0.06,
): boolean {
  return voxelBodyCollides(
    isSolidAt,
    { x: position.x, y: position.y - probeDistance, z: position.z },
    shape,
  );
}

/** Raises an embedded spawn/body until it reaches the first collision-free pose. */
export function depenetrateVoxelBodyUpward(
  isSolidAt: VoxelSolidProvider,
  position: CollisionVector,
  shape: VoxelBodyShape,
  maximumLift = 8,
): CollisionVector {
  if (!voxelBodyCollides(isSolidAt, position, shape)) {
    return { ...position };
  }

  const increment = 0.05;
  for (let lift = increment; lift <= maximumLift + COLLISION_EPSILON; lift += increment) {
    const candidate = {
      x: position.x,
      y: position.y + lift,
      z: position.z,
    };
    if (!voxelBodyCollides(isSolidAt, candidate, shape)) {
      return candidate;
    }
  }

  throw new RangeError('Unable to depenetrate the player from solid voxels.');
}
