import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export const BLOCK_TEXTURE_SIZE = 16;

export enum BlockTexture {
  GrassTop = 0,
  GrassSide = 1,
  Dirt = 2,
  Stone = 3,
  RuneStone = 4,
  OakLogTop = 5,
  OakLogSide = 6,
  OakLeaves = 7,
  OakPlanks = 8,
  CraftingTableTop = 9,
  CraftingTableSide = 10,
  CraftingTableFront = 11,
  CoalOre = 12,
  IronOre = 13,
  FurnaceTop = 14,
  FurnaceSide = 15,
  FurnaceFront = 16,
  Cobblestone = 17,
  Torch = 18,
}

export const BLOCK_TEXTURE_KINDS: readonly BlockTexture[] = [
  BlockTexture.GrassTop,
  BlockTexture.GrassSide,
  BlockTexture.Dirt,
  BlockTexture.Stone,
  BlockTexture.RuneStone,
  BlockTexture.OakLogTop,
  BlockTexture.OakLogSide,
  BlockTexture.OakLeaves,
  BlockTexture.OakPlanks,
  BlockTexture.CraftingTableTop,
  BlockTexture.CraftingTableSide,
  BlockTexture.CraftingTableFront,
  BlockTexture.CoalOre,
  BlockTexture.IronOre,
  BlockTexture.FurnaceTop,
  BlockTexture.FurnaceSide,
  BlockTexture.FurnaceFront,
  BlockTexture.Cobblestone,
  BlockTexture.Torch,
];

export const BLOCK_TEXTURE_COUNT = BLOCK_TEXTURE_KINDS.length;

export interface BlockTexturePixels {
  readonly pixels: Uint8Array;
  readonly hasAlpha: boolean;
}

type Rgba = readonly [number, number, number, number?];

function clampByte(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 19, 73_856_093);
  value ^= Math.imul(y + 31, 19_349_663);
  value ^= Math.imul(seed + 43, 83_492_791);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff;
}

function setPixel(
  pixels: Uint8Array,
  x: number,
  y: number,
  color: Rgba,
): void {
  if (x < 0 || y < 0 || x >= BLOCK_TEXTURE_SIZE || y >= BLOCK_TEXTURE_SIZE) {
    return;
  }
  const offset = (x + y * BLOCK_TEXTURE_SIZE) * 4;
  pixels[offset] = clampByte(color[0]);
  pixels[offset + 1] = clampByte(color[1]);
  pixels[offset + 2] = clampByte(color[2]);
  pixels[offset + 3] = clampByte(color[3] ?? 255);
}

function tint(color: Rgba, multiplier: number, alpha = color[3] ?? 255): Rgba {
  return [
    color[0] * multiplier,
    color[1] * multiplier,
    color[2] * multiplier,
    alpha,
  ];
}

function fillNoise(
  pixels: Uint8Array,
  color: Rgba,
  seed: number,
  variation = 0.12,
): void {
  for (let y = 0; y < BLOCK_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
      const multiplier = 1 - variation + hash(x, y, seed) * variation * 2;
      setPixel(pixels, x, y, tint(color, multiplier));
    }
  }
}

function drawSpeckles(
  pixels: Uint8Array,
  seed: number,
  count: number,
  colors: readonly Rgba[],
): void {
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(hash(index, 2, seed) * BLOCK_TEXTURE_SIZE);
    const y = Math.floor(hash(index, 7, seed) * BLOCK_TEXTURE_SIZE);
    const color = colors[index % colors.length] ?? [255, 255, 255];
    setPixel(pixels, x, y, color);
    if (hash(index, 11, seed) > 0.62) {
      setPixel(pixels, x + 1, y, tint(color, 0.88));
    }
  }
}

function drawPlanks(pixels: Uint8Array): void {
  const seam: Rgba = [72, 42, 21];
  for (const y of [0, 7, 15]) {
    for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, seam);
  }
  for (const [x, start] of [[5, 0], [12, 0], [2, 8], [9, 8]] as const) {
    for (let y = start; y < Math.min(start + 7, 16); y += 1) {
      setPixel(pixels, x, y, seam);
    }
  }
}

function drawStone(pixels: Uint8Array, seed: number, base: Rgba): void {
  fillNoise(pixels, base, seed, 0.1);
  drawSpeckles(pixels, seed + 1, 16, [tint(base, 0.72), tint(base, 1.18)]);
}

function drawCobblestone(pixels: Uint8Array): void {
  drawStone(pixels, 89, [119, 123, 121]);
  const mortar: Rgba = [67, 70, 69];
  for (const y of [0, 5, 10, 15]) {
    for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, mortar);
  }
  for (let row = 0; row < 3; row += 1) {
    const yStart = row * 5;
    const offsets = row % 2 === 0 ? [0, 7, 14] : [3, 10];
    for (const x of offsets) {
      for (let y = yStart; y < Math.min(yStart + 5, 16); y += 1) {
        setPixel(pixels, x, y, mortar);
      }
    }
  }
}

function createPixels(texture: BlockTexture): BlockTexturePixels {
  const pixels = new Uint8Array(BLOCK_TEXTURE_SIZE * BLOCK_TEXTURE_SIZE * 4);
  let hasAlpha = false;

  switch (texture) {
    case BlockTexture.GrassTop:
      fillNoise(pixels, [91, 151, 54], 11, 0.16);
      drawSpeckles(pixels, 12, 24, [[52, 108, 41], [132, 179, 70]]);
      break;
    case BlockTexture.GrassSide:
      fillNoise(pixels, [116, 77, 43], 13, 0.14);
      for (let x = 0; x < 16; x += 1) {
        const depth = 3 + Math.floor(hash(x, 2, 13) * 3);
        for (let y = 0; y < depth; y += 1) {
          setPixel(pixels, x, y, y === 0 ? [102, 161, 58] : [71, 127, 46]);
        }
      }
      break;
    case BlockTexture.Dirt:
      fillNoise(pixels, [116, 76, 43], 17, 0.18);
      drawSpeckles(pixels, 18, 14, [[82, 50, 29], [148, 101, 58]]);
      break;
    case BlockTexture.Stone:
      drawStone(pixels, 19, [132, 136, 133]);
      break;
    case BlockTexture.Cobblestone:
      drawCobblestone(pixels);
      break;
    case BlockTexture.RuneStone:
      drawStone(pixels, 23, [48, 73, 63]);
      for (let step = 2; step < 14; step += 1) {
        setPixel(pixels, step, 8, [55, 215, 140]);
      }
      for (let step = 4; step < 12; step += 1) {
        setPixel(pixels, 8, step, [55, 215, 140]);
      }
      break;
    case BlockTexture.OakLogTop:
      fillNoise(pixels, [167, 121, 67], 29, 0.1);
      for (let edge = 0; edge < 16; edge += 1) {
        setPixel(pixels, edge, 0, [87, 51, 24]);
        setPixel(pixels, edge, 15, [87, 51, 24]);
        setPixel(pixels, 0, edge, [87, 51, 24]);
        setPixel(pixels, 15, edge, [87, 51, 24]);
      }
      for (const inset of [3, 6]) {
        for (let value = inset; value < 16 - inset; value += 1) {
          setPixel(pixels, value, inset, [119, 78, 38]);
          setPixel(pixels, value, 15 - inset, [119, 78, 38]);
          setPixel(pixels, inset, value, [119, 78, 38]);
          setPixel(pixels, 15 - inset, value, [119, 78, 38]);
        }
      }
      break;
    case BlockTexture.OakLogSide:
      fillNoise(pixels, [94, 59, 28], 31, 0.12);
      for (let x = 1; x < 16; x += 4) {
        for (let y = 0; y < 16; y += 1) {
          setPixel(pixels, x, y, y % 5 === 0 ? [61, 35, 17] : [120, 76, 34]);
        }
      }
      break;
    case BlockTexture.OakLeaves:
      hasAlpha = true;
      fillNoise(pixels, [59, 128, 48, 255], 37, 0.22);
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          if (hash(x, y, 37) > 0.82 || (x + y * 3) % 17 === 0) {
            setPixel(pixels, x, y, [0, 0, 0, 0]);
          } else if ((x + y) % 7 === 0) {
            setPixel(pixels, x, y, [91, 157, 62, 255]);
          }
        }
      }
      break;
    case BlockTexture.OakPlanks:
      fillNoise(pixels, [168, 117, 61], 41, 0.1);
      drawPlanks(pixels);
      break;
    case BlockTexture.CraftingTableTop:
      fillNoise(pixels, [151, 99, 47], 43, 0.08);
      for (let line = 1; line < 16; line += 5) {
        for (let value = 0; value < 16; value += 1) {
          setPixel(pixels, line, value, [73, 43, 22]);
          setPixel(pixels, value, line, [73, 43, 22]);
        }
      }
      break;
    case BlockTexture.CraftingTableSide:
      fillNoise(pixels, [132, 83, 39], 47, 0.1);
      drawPlanks(pixels);
      for (let y = 3; y < 13; y += 1) {
        setPixel(pixels, 3, y, [67, 42, 23]);
        setPixel(pixels, 12, y, [67, 42, 23]);
      }
      break;
    case BlockTexture.CraftingTableFront:
      fillNoise(pixels, [129, 78, 35], 53, 0.08);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const x = 4 + column * 4;
          const y = 4 + row * 4;
          setPixel(pixels, x, y, [207, 158, 83]);
          setPixel(pixels, x + 1, y, [88, 54, 27]);
          setPixel(pixels, x, y + 1, [88, 54, 27]);
        }
      }
      break;
    case BlockTexture.CoalOre:
      drawStone(pixels, 59, [126, 130, 128]);
      drawSpeckles(pixels, 61, 18, [[26, 28, 29], [52, 55, 56]]);
      break;
    case BlockTexture.IronOre:
      drawStone(pixels, 67, [126, 130, 128]);
      drawSpeckles(pixels, 71, 18, [[176, 116, 79], [211, 155, 105], [123, 79, 58]]);
      break;
    case BlockTexture.FurnaceTop:
      drawStone(pixels, 73, [112, 117, 114]);
      for (let edge = 4; edge < 12; edge += 1) {
        setPixel(pixels, edge, 4, [56, 59, 58]);
        setPixel(pixels, edge, 11, [56, 59, 58]);
        setPixel(pixels, 4, edge, [56, 59, 58]);
        setPixel(pixels, 11, edge, [56, 59, 58]);
      }
      break;
    case BlockTexture.FurnaceSide:
      drawStone(pixels, 79, [111, 116, 113]);
      for (const y of [0, 5, 10, 15]) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [68, 72, 70]);
      }
      break;
    case BlockTexture.FurnaceFront:
      drawStone(pixels, 83, [105, 110, 107]);
      for (let x = 3; x < 13; x += 1) {
        for (let y = 7; y < 14; y += 1) {
          const border = x === 3 || x === 12 || y === 7 || y === 13;
          setPixel(pixels, x, y, border ? [49, 52, 51] : [20, 23, 22]);
        }
      }
      break;
    case BlockTexture.Torch:
      hasAlpha = true;
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [0, 0, 0, 0]);
      }
      for (let y = 3; y < 16; y += 1) {
        const color: Rgba = y < 6 ? [255, 199, 55, 255] : [126, 79, 31, 255];
        for (let x = 6; x <= 9; x += 1) setPixel(pixels, x, y, color);
      }
      setPixel(pixels, 5, 2, [255, 126, 28, 220]);
      setPixel(pixels, 10, 2, [255, 126, 28, 220]);
      setPixel(pixels, 7, 1, [255, 234, 119, 255]);
      setPixel(pixels, 8, 1, [255, 234, 119, 255]);
      break;
  }

  return { pixels, hasAlpha };
}

const TEXTURE_CACHE = new Map<BlockTexture, BlockTexturePixels>(
  BLOCK_TEXTURE_KINDS.map((texture) => [texture, createPixels(texture)]),
);
const FALLBACK_TEXTURE = createPixels(BlockTexture.Stone);

export function getBlockTexturePixels(texture: BlockTexture): BlockTexturePixels {
  return TEXTURE_CACHE.get(texture) ?? FALLBACK_TEXTURE;
}

export function getBlockFaceTexture(
  block: BlockTypeValue,
  axis: number,
  positive: boolean,
): BlockTexture {
  switch (block) {
    case BlockType.Grass:
      if (axis === 1 && positive) return BlockTexture.GrassTop;
      if (axis === 1) return BlockTexture.Dirt;
      return BlockTexture.GrassSide;
    case BlockType.Dirt:
      return BlockTexture.Dirt;
    case BlockType.Stone:
      return BlockTexture.Stone;
    case BlockType.Cobblestone:
      return BlockTexture.Cobblestone;
    case BlockType.RuneStone:
      return BlockTexture.RuneStone;
    case BlockType.OakLog:
      return axis === 1 ? BlockTexture.OakLogTop : BlockTexture.OakLogSide;
    case BlockType.OakLeaves:
      return BlockTexture.OakLeaves;
    case BlockType.OakPlanks:
      return BlockTexture.OakPlanks;
    case BlockType.CraftingTable:
      if (axis === 1 && positive) return BlockTexture.CraftingTableTop;
      if (axis === 2 && positive) return BlockTexture.CraftingTableFront;
      return BlockTexture.CraftingTableSide;
    case BlockType.CoalOre:
      return BlockTexture.CoalOre;
    case BlockType.IronOre:
      return BlockTexture.IronOre;
    case BlockType.Furnace:
      if (axis === 1) return BlockTexture.FurnaceTop;
      if (axis === 2 && positive) return BlockTexture.FurnaceFront;
      return BlockTexture.FurnaceSide;
    case BlockType.Torch:
      return BlockTexture.Torch;
    case BlockType.Air:
      return BlockTexture.Stone;
  }
}
