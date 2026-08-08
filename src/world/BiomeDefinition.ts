import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export const BiomeType = {
  Plains: 'plains',
  Forest: 'forest',
  Desert: 'desert',
  Swamp: 'swamp',
  Mountains: 'mountains',
  SnowyTundra: 'snowy-tundra',
  SnowyMountains: 'snowy-mountains',
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
    baseHeight: 9,
    heightVariation: 2.4,
    treeChance: 0.055,
    tallGrassChance: 0.24,
    flowerChance: 0.045,
    freezesSurface: false,
  },
  [BiomeType.Forest]: {
    id: BiomeType.Forest,
    label: '森林',
    surfaceBlock: BlockType.Grass,
    fillerBlock: BlockType.Dirt,
    baseHeight: 10,
    heightVariation: 4.8,
    treeChance: 0.72,
    tallGrassChance: 0.14,
    flowerChance: 0.02,
    freezesSurface: false,
  },
  [BiomeType.Desert]: {
    id: BiomeType.Desert,
    label: '沙漠',
    surfaceBlock: BlockType.Sand,
    fillerBlock: BlockType.Sand,
    baseHeight: 9,
    heightVariation: 3.5,
    treeChance: 0,
    tallGrassChance: 0,
    flowerChance: 0,
    freezesSurface: false,
  },
  [BiomeType.Swamp]: {
    id: BiomeType.Swamp,
    label: '沼泽',
    surfaceBlock: BlockType.Grass,
    fillerBlock: BlockType.Dirt,
    baseHeight: 8,
    heightVariation: 1.2,
    treeChance: 0.42,
    tallGrassChance: 0.11,
    flowerChance: 0.012,
    freezesSurface: false,
  },
  [BiomeType.Mountains]: {
    id: BiomeType.Mountains,
    label: '山地',
    surfaceBlock: BlockType.Grass,
    fillerBlock: BlockType.Stone,
    baseHeight: 13,
    heightVariation: 11,
    treeChance: 0.13,
    tallGrassChance: 0.07,
    flowerChance: 0.008,
    freezesSurface: false,
  },
  [BiomeType.SnowyTundra]: {
    id: BiomeType.SnowyTundra,
    label: '雪原',
    surfaceBlock: BlockType.Snow,
    fillerBlock: BlockType.Dirt,
    baseHeight: 9,
    heightVariation: 2.8,
    treeChance: 0.12,
    tallGrassChance: 0.025,
    flowerChance: 0,
    freezesSurface: true,
  },
  [BiomeType.SnowyMountains]: {
    id: BiomeType.SnowyMountains,
    label: '雪山',
    surfaceBlock: BlockType.Snow,
    fillerBlock: BlockType.Stone,
    baseHeight: 14,
    heightVariation: 12,
    treeChance: 0.05,
    tallGrassChance: 0.01,
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
