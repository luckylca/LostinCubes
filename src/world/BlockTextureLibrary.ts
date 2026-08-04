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
}

export const BLOCK_TEXTURE_COUNT = 17;

export interface BlockTexturePixels {
  readonly pixels: Uint8Array;
  readonly hasAlpha: boolean;
}

type Rgba = readonly [red: number, green: number, blue: number, alpha?: number];

function clampByte(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

function noise(x: number, y: number, seed: number): number {
  let hash = Math.imul(x + 17, 374_761_393);
  hash ^= Math.imul(y + 31, 668_265_263);
  hash ^= Math.imul(seed + 47, 1_274_126_177);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffff_ffff;
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

function shade(color: Rgba, multiplier: number, alpha = color[3] ?? 255): Rgba {
  return [
    color[0] * multiplier,
    color[1] * multiplier,
    color[2] * multiplier,
    alpha,
  ];
}

function fillNoisy(
  pixels: Uint8Array,
  base: Rgba,
  seed: number,
  variation: number,
): void {
  for (let y = 0; y < BLOCK_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
      const multiplier = 1 - variation + noise(x, y, seed) * variation * 2;
      setPixel(pixels, x, y, shade(base, multiplier));
    }
  }
}

function drawStoneBase(pixels: Uint8Array, seed: number, base: Rgba): void {
  fillNoisy(pixels, base, seed, 0.11);
  for (let index = 0; index < 13; index += 1) {
    const x = Math.floor(noise(index, 2, seed) * BLOCK_TEXTURE_SIZE);
    const y = Math.floor(noise(index, 7, seed) * BLOCK_TEXTURE_SIZE);
    const dark = noise(index, 11, seed) > 0.45;
    setPixel(pixels, x, y, dark ? shade(base, 0.72) : shade(base, 1.2));
    if (noise(index, 13, seed) > 0.65) {
      setPixel(pixels, x + 1, y, dark ? shade(base, 0.8) : shade(base, 1.1));
    }
  }
}

function drawOreClusters(
  pixels: Uint8Array,
  seed: number,
  oreColors: readonly Rgba[],
): void {
  const centers = [
    [3, 4],
    [10, 3],
    [7, 9],
    [12, 12],
    [2, 13],
  ] as const;
  centers.forEach(([centerX, centerY], cluster) => {
    const color = oreColors[cluster % oreColors.length] ?? oreColors[0] ?? [255, 255, 255];
    const offsets = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 1],
      [1, -1],
    ] as const;
    offsets.forEach(([offsetX, offsetY], index) => {
      if (noise(cluster, index, seed) > 0.18) {
        setPixel(
          pixels,
          centerX + offsetX,
          centerY + offsetY,
          index === 0 ? shade(color, 1.12) : shade(color, 0.9 + noise(index, cluster, seed) * 0.18),
        );
      }
    });
  });
}

function drawPlankSeams(pixels: Uint8Array): void {
  const seam = [78, 46, 22] as const;
  const highlight = [203, 151, 82] as const;
  for (const y of [0, 7, 15]) {
    for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
      setPixel(pixels, x, y, x % 5 === 0 ? shade(seam, 0.72) : seam);
    }
  }
  for (const [x, startY] of [
    [5, 0],
    [12, 0],
    [2, 8],
    [9, 8],
  ] as const) {
    for (let y = startY; y < Math.min(startY + 7, BLOCK_TEXTURE_SIZE); y += 1) {
      setPixel(pixels, x, y, seam);
    }
    setPixel(pixels, x + 1, startY + 1, highlight);
  }
}

function createPixels(texture: BlockTexture): BlockTexturePixels {
  const pixels = new Uint8Array(BLOCK_TEXTURE_SIZE * BLOCK_TEXTURE_SIZE * 4);
  let hasAlpha = false;

  switch (texture) {
    case BlockTexture.GrassTop: {
      fillNoisy(pixels, [91, 151, 54], 11, 0.16);
      for (let index = 0; index < 24; index += 1) {
        const x = Math.floor(noise(index, 3, 11) * BLOCK_TEXTURE_SIZE);
        const y = Math.floor(noise(index, 5, 11) * BLOCK_TEXTURE_SIZE);
        setPixel(
          pixels,
          x,
          y,
          noise(index, 7, 11) > 0.5 ? [53, 111, 42] : [132, 178, 70],
        );
      }
      break;
    }
    case BlockTexture.GrassSide: {
      fillNoisy(pixels, [116, 78, 43], 13, 0.13);
      for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
        const fringe = 3 + Math.floor(noise(x, 2, 13) * 3);
        for (let y = 0; y < fringe; y += 1) {
          const green: Rgba = y === 0 ? [99, 159, 57] : [73, 128, 47];
          setPixel(pixels, x, y, shade(green, 0.92 + noise(x, y, 13) * 0.16));
        }
      }
      break;
    }
    case BlockTexture.Dirt:
      fillNoisy(pixels, [116, 77, 44], 17, 0.18);
      break;
    case BlockTexture.Stone:
      drawStoneBase(pixels, 19, [132, 136, 133]);
      break;
    case BlockTexture.RuneStone: {
      drawStoneBase(pixels, 23, [48, 73, 63]);
      const rune = [55, 215, 140] as const;
      for (let step = 2; step < 14; step += 1) {
        setPixel(pixels, step, 8, step % 3 === 0 ? shade(rune, 1.2) : rune);
      }
      for (let step = 4; step < 12; step += 1) {
        setPixel(pixels, 8, step, rune);
      }
      setPixel(pixels, 7, 5, rune);
      setPixel(pixels, 9, 11, rune);
      break;
    }
    case BlockTexture.OakLogTop: {
      fillNoisy(pixels, [167, 121, 67], 29, 0.1);
      const bark = [87, 51, 24] as const;
      for (let edge = 0; edge < BLOCK_TEXTURE_SIZE; edge += 1) {
        setPixel(pixels, edge, 0, bark);
        setPixel(pixels, edge, 15, bark);
        setPixel(pixels, 0, edge, bark);
        setPixel(pixels, 15, edge, bark);
      }
      for (const inset of [3, 6]) {
        for (let x = inset; x < BLOCK_TEXTURE_SIZE - inset; x += 1) {
          setPixel(pixels, x, inset, [119, 78, 38]);
          setPixel(pixels, x, BLOCK_TEXTURE_SIZE - inset - 1, [119, 78, 38]);
        }
        for (let y = inset; y < BLOCK_TEXTURE_SIZE - inset; y += 1) {
          setPixel(pixels, inset, y, [119, 78, 38]);
          setPixel(pixels, BLOCK_TEXTURE_SIZE - inset - 1, y, [119, 78, 38]);
        }
      }
      break;
    }
    case BlockTexture.OakLogSide: {
      fillNoisy(pixels, [94, 59, 28], 31, 0.12);
      for (let x = 1; x < BLOCK_TEXTURE_SIZE; x += 4) {
        for (let y = 0; y < BLOCK_TEXTURE_SIZE; y += 1) {
          setPixel(
            pixels,
            x,
            y,
            y % 5 === 0 ? [61, 35, 17] : [120, 76, 34],
          );
        }
      }
      break;
    }
    case BlockTexture.OakLeaves: {
      hasAlpha = true;
      fillNoisy(pixels, [59, 128, 48, 255], 37, 0.22);
      for (let y = 0; y < BLOCK_TEXTURE_SIZE; y += 1) {
        for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
          const hole = noise(x, y, 37) > 0.82 || ((x + y * 3) % 17 === 0);
          if (hole) {
            setPixel(pixels, x, y, [0, 0, 0, 0]);
          } else if ((x + y) % 7 === 0) {
            setPixel(pixels, x, y, [91, 157, 62, 255]);
          }
        }
      }
      for (let edge = 0; edge < BLOCK_TEXTURE_SIZE; edge += 1) {
        if (edge % 3 !== 0) {
          setPixel(pixels, edge, 0, [35, 92, 39, 255]);
          setPixel(pixels, 0, edge, [35, 92, 39, 255]);
        }
      }
      break;
    }
    case BlockTexture.OakPlanks:
      fillNoisy(pixels, [168, 117, 61], 41, 0.1);
      drawPlankSeams(pixels);
      break;
    case BlockTexture.CraftingTableTop: {
      fillNoisy(pixels, [151, 99, 47], 43, 0.08);
      for (let line = 1; line < 16; line += 5) {
        for (let offset = 0; offset < 16; offset += 1) {
          setPixel(pixels, line, offset, [73, 43, 22]);
          setPixel(pixels, offset, line, [73, 43, 22]);
        }
      }
      for (let edge = 0; edge < 16; edge += 1) {
        setPixel(pixels, edge, 0, [49, 30, 18]);
        setPixel(pixels, 0, edge, [49, 30, 18]);
      }
      break;
    }
    case BlockTexture.CraftingTableSide: {
      fillNoisy(pixels, [132, 83, 39], 47, 0.1);
      drawPlankSeams(pixels);
      for (let y = 3; y < 13; y += 1) {
        setPixel(pixels, 3, y, [67, 42, 23]);
        setPixel(pixels, 12, y, [67, 42, 23]);
      }
      break;
    }
    case BlockTexture.CraftingTableFront: {
      fillNoisy(pixels, [129, 78, 35], 53, 0.08);
      for (let edge = 1; edge < 15; edge += 1) {
        setPixel(pixels, edge, 1, [55, 34, 19]);
        setPixel(pixels, edge, 14, [55, 34, 19]);
        setPixel(pixels, 1, edge, [55, 34, 19]);
        setPixel(pixels, 14, edge, [55, 34, 19]);
      }
      for (let slot = 0; slot < 3; slot += 1) {
        for (let row = 0; row < 3; row += 1) {
          const centerX = 4 + slot * 4;
          const centerY = 4 + row * 4;
          setPixel(pixels, centerX, centerY, [207, 158, 83]);
          setPixel(pixels, centerX + 1, centerY, [88, 54, 27]);
          setPixel(pixels, centerX, centerY + 1, [88, 54, 27]);
        }
      }
      break;
    }
    case BlockTexture.CoalOre:
      drawStoneBase(pixels, 59, [126, 130, 128]);
      drawOreClusters(pixels, 61, [[29, 31, 32], [53, 56, 57]]);
      break;
    case BlockTexture.IronOre:
      drawStoneBase(pixels, 67, [126, 130, 128]);
      drawOreClusters(pixels, 71, [[176, 116, 79], [211, 155, 105], [123, 79, 58]]);
      break;
    case BlockTexture.FurnaceTop: {
      drawStoneBase(pixels, 73, [112, 117, 114]);
      for (let y = 4; y < 12; y += 1) {
        for (let x = 4; x < 12; x += 1) {
          if (x === 4 || x === 11 || y === 4 || y === 11) {
            setPixel(pixels, x, y, [56, 59, 58]);
          }
        }
      }
      break;
    }
    case BlockTexture.FurnaceSide: {
      drawStoneBase(pixels, 79, [111, 116, 113]);
      for (const y of [0, 5, 10, 15]) {
        for (let x = 0; x < 16; x += 1) setPixel(pixels, x, y, [68, 72, 70]);
      }
      for (let row = 0; row < 3; row += 1) {
        const offset = row % 2 === 0 ? 5 : 2;
        for (let x = offset; x < 16; x += 8) {
          for (let y = row * 5; y < Math.min(row * 5 + 5, 16); y += 1) {
            setPixel(pixels, x, y, [72, 76, 74]);
          }
        }
      }
      break;
    }
    case BlockTexture.FurnaceFront: {
      drawStoneBase(pixels, 83, [105, 110, 107]);
      for (let x = 3; x < 13; x += 1) {
        for (let y = 7; y < 14; y += 1) {
          const border = x === 3 || x === 12 || y === 7 || y === 13;
          setPixel(pixels, x, y, border ? [49, 52, 51] : [20, 23, 22]);
        }
      }
      for (let x = 5; x < 11; x += 1) {
        setPixel(pixels, x, 5, [57, 60, 59]);
      }
      break;
    }
  }

  return { pixels, hasAlpha };
}

const TEXTURE_CACHE = Array.from(
  { length: BLOCK_TEXTURE_COUNT },
  (_, texture) => createPixels(texture as BlockTexture),
);

export function getBlockTexturePixels(texture: BlockTexture): BlockTexturePixels {
  return TEXTURE_CACHE[texture] ?? TEXTURE_CACHE[BlockTexture.Stone]!;
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
    case BlockType.Air:
      return BlockTexture.Stone;
  }
}
