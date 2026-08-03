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
  return 0.94 + normalized * 0.12;
}

function getFaceBaseColor(
  block: BlockTypeValue,
  axis: number,
  positive: boolean,
): BlockRgb {
  switch (block) {
    case BlockType.Grass:
      if (axis === 1 && positive) return [0.38, 0.64, 0.24];
      if (axis === 1) return [0.34, 0.23, 0.14];
      return [0.39, 0.38, 0.18];
    case BlockType.Dirt:
      return axis === 1 && positive ? [0.5, 0.34, 0.21] : [0.43, 0.28, 0.17];
    case BlockType.Stone:
      return axis === 1 && positive ? [0.57, 0.59, 0.58] : [0.47, 0.5, 0.49];
    case BlockType.RuneStone:
      return axis === 1 && positive ? [0.2, 0.5, 0.34] : [0.14, 0.32, 0.25];
    case BlockType.OakLog:
      return axis === 1 ? [0.61, 0.42, 0.22] : [0.39, 0.24, 0.11];
    case BlockType.OakLeaves:
      return axis === 1 && positive ? [0.25, 0.52, 0.2] : [0.19, 0.42, 0.16];
    case BlockType.OakPlanks:
      return axis === 1 && positive ? [0.7, 0.52, 0.29] : [0.62, 0.43, 0.22];
    case BlockType.CraftingTable:
      return axis === 1 && positive ? [0.55, 0.37, 0.19] : [0.45, 0.28, 0.14];
    case BlockType.CoalOre:
      return axis === 1 && positive ? [0.34, 0.35, 0.35] : [0.24, 0.25, 0.25];
    case BlockType.IronOre:
      return axis === 1 && positive ? [0.62, 0.49, 0.39] : [0.48, 0.38, 0.32];
    case BlockType.Furnace:
      return axis === 2 && positive ? [0.3, 0.31, 0.3] : [0.41, 0.43, 0.42];
    case BlockType.Air:
      return [0, 0, 0];
  }
}

function getDirectionalShade(axis: number, positive: boolean): number {
  if (axis === 1) return positive ? 1 : 0.66;
  if (axis === 0) return positive ? 0.88 : 0.78;
  return positive ? 0.92 : 0.74;
}

export function getBlockFaceColor(
  block: BlockTypeValue,
  axis: number,
  positive: boolean,
  worldX: number,
  worldY: number,
  worldZ: number,
): BlockRgb {
  const base = getFaceBaseColor(block, axis, positive);
  const multiplier = getDirectionalShade(axis, positive) * coordinateVariation(worldX, worldY, worldZ, block);
  return [
    clampChannel(base[0] * multiplier),
    clampChannel(base[1] * multiplier),
    clampChannel(base[2] * multiplier),
  ];
}

export function getBlockItemColor(block: BlockTypeValue): BlockRgb {
  switch (block) {
    case BlockType.Grass: return [0.38, 0.61, 0.24];
    case BlockType.Dirt: return [0.48, 0.32, 0.2];
    case BlockType.Stone: return [0.53, 0.55, 0.54];
    case BlockType.RuneStone: return [0.16, 0.43, 0.3];
    case BlockType.OakLog: return [0.43, 0.28, 0.13];
    case BlockType.OakLeaves: return [0.23, 0.49, 0.19];
    case BlockType.OakPlanks: return [0.67, 0.48, 0.26];
    case BlockType.CraftingTable: return [0.5, 0.32, 0.16];
    case BlockType.CoalOre: return [0.25, 0.26, 0.26];
    case BlockType.IronOre: return [0.58, 0.43, 0.33];
    case BlockType.Furnace: return [0.38, 0.4, 0.39];
    case BlockType.Air: return [0, 0, 0];
  }
}
