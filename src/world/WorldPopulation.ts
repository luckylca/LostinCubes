import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

const UINT32_MAX = 4_294_967_295;
const DUNGEON_CELL_SIZE = 32;
const DUNGEON_HALF_SIZE = 3;
const DUNGEON_HEIGHT = 5;
const DUNGEON_MINIMUM_SPAWN_DISTANCE = 24;
const MAXIMUM_SPRING_COLUMN = 6;

function hashCoordinate(x: number, z: number, seed: number): number {
  let hash = seed;
  hash ^= Math.imul(x, 374_761_393);
  hash ^= Math.imul(z, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_MAX;
}

function hashCoordinate3d(x: number, y: number, z: number, seed: number): number {
  let hash = seed;
  hash ^= Math.imul(x, 374_761_393);
  hash ^= Math.imul(y, 1_274_126_177);
  hash ^= Math.imul(z, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 15), 2_246_822_519);
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_MAX;
}

interface DungeonAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function getDungeonAnchor(
  cellX: number,
  cellZ: number,
  seed: number,
): DungeonAnchor | null {
  const chance = hashCoordinate(cellX, cellZ, seed ^ 0x6d2b79f5);
  if (chance > 0.13) return null;

  const x =
    cellX * DUNGEON_CELL_SIZE +
    8 +
    Math.floor(hashCoordinate(cellX, cellZ, seed ^ 0x27d4eb2d) * 16);
  const z =
    cellZ * DUNGEON_CELL_SIZE +
    8 +
    Math.floor(hashCoordinate(cellX, cellZ, seed ^ 0x165667b1) * 16);
  if (Math.hypot(x, z - 3.5) < DUNGEON_MINIMUM_SPAWN_DISTANCE) {
    return null;
  }
  const y =
    4 + Math.floor(hashCoordinate(cellX, cellZ, seed ^ 0x85ebca77) * 6);
  return { x, y, z };
}

/**
 * Samples a small classic-style underground room. `null` means this coordinate
 * is not owned by a dungeon; `Air` deliberately carves the room interior.
 * The rune floor core is a dormant spawner marker for the entity batch.
 */
export function sampleDungeonBlock(
  worldX: number,
  worldY: number,
  worldZ: number,
  surfaceHeight: number,
  seed: number,
): BlockTypeValue | null {
  const cellX = Math.floor(worldX / DUNGEON_CELL_SIZE);
  const cellZ = Math.floor(worldZ / DUNGEON_CELL_SIZE);
  const anchor = getDungeonAnchor(cellX, cellZ, seed);
  if (anchor === null) return null;
  if (surfaceHeight < anchor.y + DUNGEON_HEIGHT + 2) return null;

  const deltaX = worldX - anchor.x;
  const deltaY = worldY - anchor.y;
  const deltaZ = worldZ - anchor.z;
  if (
    Math.abs(deltaX) > DUNGEON_HALF_SIZE ||
    Math.abs(deltaZ) > DUNGEON_HALF_SIZE ||
    deltaY < 0 ||
    deltaY >= DUNGEON_HEIGHT
  ) {
    return null;
  }

  const wall =
    Math.abs(deltaX) === DUNGEON_HALF_SIZE ||
    Math.abs(deltaZ) === DUNGEON_HALF_SIZE ||
    deltaY === 0 ||
    deltaY === DUNGEON_HEIGHT - 1;
  if (wall) {
    if (deltaY === 0 && deltaX === 0 && deltaZ === 0) {
      return BlockType.RuneStone;
    }
    const floorVariation = hashCoordinate3d(
      worldX,
      worldY,
      worldZ,
      seed ^ 0x94d049bb,
    );
    return floorVariation > 0.9 ? BlockType.RuneStone : BlockType.Cobblestone;
  }

  if (
    deltaY === 2 &&
    ((Math.abs(deltaX) === DUNGEON_HALF_SIZE - 1 && deltaZ === 0) ||
      (Math.abs(deltaZ) === DUNGEON_HALF_SIZE - 1 && deltaX === 0))
  ) {
    return BlockType.Torch;
  }
  return BlockType.Air;
}

/**
 * Creates deterministic water/lava springs from cave ceilings and extends the
 * source down through at most a few cave voxels. Runtime scheduled ticks take
 * over once player edits disturb the reservoir or open a ledge.
 */
export function sampleCaveSpringBlock(
  worldX: number,
  worldY: number,
  worldZ: number,
  surfaceHeight: number,
  seed: number,
  seaLevel: number,
  lavaLevel: number,
  isCaveAt: (worldY: number) => boolean,
): BlockTypeValue | null {
  if (!isCaveAt(worldY)) return null;
  const maximumY = Math.min(
    surfaceHeight - 1,
    worldY + MAXIMUM_SPRING_COLUMN - 1,
  );

  for (let sourceY = worldY; sourceY <= maximumY; sourceY += 1) {
    if (!isCaveAt(sourceY) || isCaveAt(sourceY + 1)) continue;

    const lavaRoll = hashCoordinate3d(
      worldX,
      sourceY,
      worldZ,
      seed ^ 0xc2b2ae35,
    );
    const waterRoll = hashCoordinate3d(
      worldX,
      sourceY,
      worldZ,
      seed ^ 0x51ed270b,
    );
    const fluid =
      sourceY <= lavaLevel + 2 && lavaRoll > 0.995
        ? BlockType.Lava
        : sourceY <= seaLevel + 4 && waterRoll > 0.992
          ? BlockType.Water
          : null;
    if (fluid === null) continue;

    let clearColumn = true;
    for (let y = worldY; y <= sourceY; y += 1) {
      if (!isCaveAt(y)) {
        clearColumn = false;
        break;
      }
    }
    if (clearColumn) return fluid;
  }
  return null;
}
