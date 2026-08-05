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
  Sand = 19,
  Gravel = 20,
  Clay = 21,
  Snow = 22,
  Water = 23,
  Lava = 24,
  Ladder = 25,
  OakSapling = 26,
  TallGrass = 27,
  Dandelion = 28,
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
  BlockTexture.Sand,
  BlockTexture.Gravel,
  BlockTexture.Clay,
  BlockTexture.Snow,
  BlockTexture.Water,
  BlockTexture.Lava,
  BlockTexture.Ladder,
  BlockTexture.OakSapling,
  BlockTexture.TallGrass,
  BlockTexture.Dandelion,
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
  if (x < 0 || y < 0 || x >= 16 || y >= 16) return;
  const offset = (x + y * 16) * 4;
  pixels[offset] = clampByte(color[0]);
  pixels[offset + 1] = clampByte(color[1]);
  pixels[offset + 2] = clampByte(color[2]);
  pixels[offset + 3] = clampByte(color[3] ?? 255);
}

function tint(color: Rgba, scale: number, alpha = color[3] ?? 255): Rgba {
  return [color[0] * scale, color[1] * scale, color[2] * scale, alpha];
}

function clear(pixels: Uint8Array): void {
  pixels.fill(0);
}

function fillNoise(
  pixels: Uint8Array,
  color: Rgba,
  seed: number,
  variation = 0.12,
): void {
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const scale = 1 - variation + hash(x, y, seed) * variation * 2;
      setPixel(pixels, x, y, tint(color, scale));
    }
  }
}

function speckles(
  pixels: Uint8Array,
  seed: number,
  count: number,
  colors: readonly Rgba[],
): void {
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(hash(index, 2, seed) * 16);
    const y = Math.floor(hash(index, 7, seed) * 16);
    setPixel(pixels, x, y, colors[index % colors.length] ?? [255, 255, 255]);
  }
}

function stone(pixels: Uint8Array, seed: number, base: Rgba): void {
  fillNoise(pixels, base, seed, 0.1);
  speckles(pixels, seed + 1, 18, [tint(base, 0.7), tint(base, 1.18)]);
}

function planks(pixels: Uint8Array, base: Rgba, seed: number): void {
  fillNoise(pixels, base, seed, 0.1);
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

function plantStem(
  pixels: Uint8Array,
  leaf: Rgba,
  flower: Rgba | null,
): void {
  clear(pixels);
  for (let y = 4; y < 16; y += 1) {
    setPixel(pixels, 7, y, [47, 111, 36, 255]);
    setPixel(pixels, 8, y, [55, 132, 42, 255]);
  }
  for (let step = 0; step < 5; step += 1) {
    setPixel(pixels, 7 - step, 10 + Math.floor(step / 2), leaf);
    setPixel(pixels, 8 + step, 8 + Math.floor(step / 2), leaf);
  }
  if (flower !== null) {
    for (const [x, y] of [[7, 2], [8, 2], [6, 3], [7, 3], [8, 3], [9, 3], [7, 4], [8, 4]] as const) {
      setPixel(pixels, x, y, flower);
    }
  }
}

function createPixels(texture: BlockTexture): BlockTexturePixels {
  const pixels = new Uint8Array(16 * 16 * 4);
  let hasAlpha = false;

  switch (texture) {
    case BlockTexture.GrassTop:
      fillNoise(pixels, [91, 151, 54], 11, 0.16);
      speckles(pixels, 12, 24, [[52, 108, 41], [132, 179, 70]]);
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
      speckles(pixels, 18, 14, [[82, 50, 29], [148, 101, 58]]);
      break;
    case BlockTexture.Stone:
      stone(pixels, 19, [132, 136, 133]);
      break;
    case BlockTexture.RuneStone:
      stone(pixels, 23, [48, 73, 63]);
      for (let step = 2; step < 14; step += 1) setPixel(pixels, step, 8, [55, 215, 140]);
      for (let step = 4; step < 12; step += 1) setPixel(pixels, 8, step, [55, 215, 140]);
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
          }
        }
      }
      break;
    case BlockTexture.OakPlanks:
      planks(pixels, [168, 117, 61], 41);
      break;
    case BlockTexture.CraftingTableTop:
      planks(pixels, [151, 99, 47], 43);
      for (let line = 1; line < 16; line += 5) {
        for (let value = 0; value < 16; value += 1) {
          setPixel(pixels, line, value, [73, 43, 22]);
          setPixel(pixels, value, line, [73, 43, 22]);
        }
      }
      break;
    case BlockTexture.CraftingTableSide:
      planks(pixels, [132, 83, 39], 47);
      break;
    case BlockTexture.CraftingTableFront:
      fillNoise(pixels, [129, 78, 35], 53, 0.08);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          setPixel(pixels, 4 + column * 4, 4 + row * 4, [207, 158, 83]);
        }
      }
      break;
    case BlockTexture.CoalOre:
      stone(pixels, 59, [126, 130, 128]);
      speckles(pixels, 61, 18, [[26, 28, 29], [52, 55, 56]]);
      break;
    case BlockTexture.IronOre:
      stone(pixels, 67, [126, 130, 128]);
      speckles(pixels, 71, 18, [[176, 116, 79], [211, 155, 105]]);
      break;
    case BlockTexture.FurnaceTop:
      stone(pixels, 73, [112, 117, 114]);
      break;
    case BlockTexture.FurnaceSide:
      stone(pixels, 79, [111, 116, 113]);
      for (const y of [0, 5, 10, 15]) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [68, 72, 70]);
      }
      break;
    case BlockTexture.FurnaceFront:
      stone(pixels, 83, [105, 110, 107]);
      for (let x = 3; x < 13; x += 1) {
        for (let y = 7; y < 14; y += 1) {
          const border = x === 3 || x === 12 || y === 7 || y === 13;
          setPixel(pixels, x, y, border ? [49, 52, 51] : [20, 23, 22]);
        }
      }
      break;
    case BlockTexture.Cobblestone:
      stone(pixels, 89, [119, 123, 121]);
      for (const y of [0, 5, 10, 15]) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [67, 70, 69]);
      }
      break;
    case BlockTexture.Torch:
      hasAlpha = true;
      clear(pixels);
      for (let y = 3; y < 16; y += 1) {
        const color: Rgba = y < 6 ? [255, 199, 55, 255] : [126, 79, 31, 255];
        for (let x = 6; x <= 9; x += 1) setPixel(pixels, x, y, color);
      }
      setPixel(pixels, 7, 1, [255, 234, 119, 255]);
      setPixel(pixels, 8, 1, [255, 234, 119, 255]);
      break;
    case BlockTexture.Sand:
      fillNoise(pixels, [218, 205, 147], 97, 0.08);
      speckles(pixels, 101, 18, [[194, 177, 119], [235, 224, 169]]);
      break;
    case BlockTexture.Gravel:
      fillNoise(pixels, [126, 120, 119], 103, 0.2);
      speckles(pixels, 107, 28, [[82, 79, 80], [166, 158, 154], [105, 100, 98]]);
      break;
    case BlockTexture.Clay:
      fillNoise(pixels, [157, 169, 174], 109, 0.08);
      speckles(pixels, 113, 12, [[130, 145, 151], [181, 190, 193]]);
      break;
    case BlockTexture.Snow:
      fillNoise(pixels, [239, 246, 248], 127, 0.035);
      speckles(pixels, 131, 8, [[207, 222, 229], [255, 255, 255]]);
      break;
    case BlockTexture.Water:
      hasAlpha = true;
      fillNoise(pixels, [48, 112, 214, 172], 137, 0.08);
      for (let y = 2; y < 16; y += 5) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [92, 154, 235, 185]);
      }
      break;
    case BlockTexture.Lava:
      hasAlpha = true;
      fillNoise(pixels, [242, 91, 18, 236], 139, 0.12);
      for (let y = 1; y < 16; y += 4) {
        for (let x = 0; x < 16; x += 1) {
          if ((x + y) % 3 !== 0) setPixel(pixels, x, y, [255, 191, 38, 246]);
        }
      }
      break;
    case BlockTexture.Ladder:
      hasAlpha = true;
      clear(pixels);
      for (let y = 1; y < 16; y += 5) {
        for (let x = 2; x < 14; x += 1) setPixel(pixels, x, y, [151, 101, 48, 255]);
      }
      for (const x of [2, 13]) {
        for (let y = 0; y < 16; y += 1) setPixel(pixels, x, y, [111, 70, 32, 255]);
      }
      break;
    case BlockTexture.OakSapling:
      hasAlpha = true;
      plantStem(pixels, [64, 139, 49, 255], null);
      break;
    case BlockTexture.TallGrass:
      hasAlpha = true;
      clear(pixels);
      for (let blade = 0; blade < 7; blade += 1) {
        const baseX = 2 + blade * 2;
        const height = 7 + Math.floor(hash(blade, 1, 149) * 8);
        for (let step = 0; step < height; step += 1) {
          setPixel(pixels, baseX + Math.floor(step / 5), 15 - step, [67, 145, 51, 255]);
        }
      }
      break;
    case BlockTexture.Dandelion:
      hasAlpha = true;
      plantStem(pixels, [64, 139, 49, 255], [247, 211, 45, 255]);
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
    case BlockType.Sand:
      return BlockTexture.Sand;
    case BlockType.Gravel:
      return BlockTexture.Gravel;
    case BlockType.Clay:
      return BlockTexture.Clay;
    case BlockType.Snow:
      return BlockTexture.Snow;
    case BlockType.Water:
      return BlockTexture.Water;
    case BlockType.Lava:
      return BlockTexture.Lava;
    case BlockType.Ladder:
      return BlockTexture.Ladder;
    case BlockType.OakSapling:
      return BlockTexture.OakSapling;
    case BlockType.TallGrass:
      return BlockTexture.TallGrass;
    case BlockType.Dandelion:
      return BlockTexture.Dandelion;
    case BlockType.Air:
      return BlockTexture.Stone;
  }
}
