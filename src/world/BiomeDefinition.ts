import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export const BiomeType = {
  Plains: 'plains',
  Forest: 'forest',
  Desert: 'desert',
  SnowyTundra: 'snowy-tundra',
} as const;

export type BiomeType = (typeof BiomeType)[keyof typeof BiomeType];

export interface BiomeDefinition {
  readonly id: BiomeType;
  readonly label: string;
  readonly surfaceBlock: BlockTypeValue;
  readonly fillerBlock: BlockTypeValue;
  readonly baseHeight: number;
  readonly heightVariation: number;
  readonly treeChance: number;
  readonly tallGrassChance: number;
  readonly flowerChance: number;
  readonly freezesSurface: boolean;
}

const DEFINITIONS: Readonly<Record<BiomeType, BiomeDefinition>> = {
  [BiomeType.Plains]: {
    id: BiomeType.Plains,
    label: '平原',
    surfaceBlock: BlockType.Grass,
    fillerBlock: BlockType.Dirt,
    baseHeight: 7,
    heightVariation: 3.2,
    treeChance: 0.08,
    tallGrassChance: 0.2,
    flowerChance: 0.035,
    freezesSurface: false,
  },
  [BiomeType.Forest]: {
    id: BiomeType.Forest,
    label: '森林',
    surfaceBlock: BlockType.Grass,
    fillerBlock: BlockType.Dirt,
    baseHeight: 8,
    heightVariation: 4,
    treeChance: 0.66,
    tallGrassChance: 0.12,
    flowerChance: 0.018,
    freezesSurface: false,
  },
  [BiomeType.Desert]: {
    id: BiomeType.Desert,
    label: '沙漠',
    surfaceBlock: BlockType.Sand,
    fillerBlock: BlockType.Sand,
    baseHeight: 7,
    heightVariation: 2.2,
    treeChance: 0,
    tallGrassChance: 0,
    flowerChance: 0,
    freezesSurface: false,
  },
  [BiomeType.SnowyTundra]: {
    id: BiomeType.SnowyTundra,
    label: '雪原',
    surfaceBlock: BlockType.Snow,
    fillerBlock: BlockType.Dirt,
    baseHeight: 8,
    heightVariation: 3.4,
    treeChance: 0.16,
    tallGrassChance: 0.04,
    flowerChance: 0,
    freezesSurface: true,
  },
};

export function getBiomeDefinition(biome: BiomeType): BiomeDefinition {
  return DEFINITIONS[biome];
}

export function getBiomeLabel(biome: BiomeType): string {
  return getBiomeDefinition(biome).label;
}
