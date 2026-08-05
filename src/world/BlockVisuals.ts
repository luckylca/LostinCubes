import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export type BlockRgb = readonly [red: number, green: number, blue: number];

function clampChannel(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function coordinateVariation(
  worldX: number,
  worldY: number,
  worldZ: number,
  block: BlockTypeValue,
): number {
  let hash = Math.imul(worldX, 73_856_093);
  hash ^= Math.imul(worldY, 19_349_663);
  hash ^= Math.imul(worldZ, 83_492_791);
  hash ^= Math.imul(block, 2_654_435_761);
  hash ^= hash >>> 13;
  const normalized = (hash >>> 0) / 0xffff_ffff;
  return 0.97 + normalized * 0.06;
}

function getDirectionalShade(axis: number, positive: boolean): number {
  if (axis === 1) return positive ? 1 : 0.68;
  if (axis === 0) return positive ? 0.9 : 0.8;
  return positive ? 0.94 : 0.76;
}

/** Vertex colors provide stable directional tint over pixel textures. */
export function getBlockFaceColor(
  block: BlockTypeValue,
  axis: number,
  positive: boolean,
  worldX: number,
  worldY: number,
  worldZ: number,
): BlockRgb {
  const multiplier =
    getDirectionalShade(axis, positive) *
    coordinateVariation(worldX, worldY, worldZ, block);
  const emissionBoost =
    block === BlockType.RuneStone || block === BlockType.Torch ? 1.035 : 1;
  const value = clampChannel(multiplier * emissionBoost);
  return [value, value, value];
}

export function getBlockItemColor(block: BlockTypeValue): BlockRgb {
  switch (block) {
    case BlockType.Grass:
      return [0.38, 0.61, 0.24];
    case BlockType.Dirt:
      return [0.48, 0.32, 0.2];
    case BlockType.Stone:
      return [0.53, 0.55, 0.54];
    case BlockType.Cobblestone:
      return [0.45, 0.47, 0.46];
    case BlockType.RuneStone:
      return [0.16, 0.43, 0.3];
    case BlockType.OakLog:
      return [0.43, 0.28, 0.13];
    case BlockType.OakLeaves:
      return [0.23, 0.49, 0.19];
    case BlockType.OakPlanks:
      return [0.67, 0.48, 0.26];
    case BlockType.CraftingTable:
      return [0.5, 0.32, 0.16];
    case BlockType.CoalOre:
      return [0.25, 0.26, 0.26];
    case BlockType.IronOre:
      return [0.58, 0.43, 0.33];
    case BlockType.Furnace:
      return [0.38, 0.4, 0.39];
    case BlockType.Torch:
      return [0.93, 0.66, 0.23];
    case BlockType.Air:
      return [0, 0, 0];
  }
}
