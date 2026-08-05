import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export type BlockToolKind = 'shovel' | 'pickaxe' | 'axe';
export type BlockRenderShape = 'empty' | 'cube' | 'cross';

export interface BlockDefinition {
  readonly id: BlockTypeValue;
  readonly label: string;
  readonly solid: boolean;
  readonly targetable: boolean;
  readonly replaceable: boolean;
  readonly renderShape: BlockRenderShape;
  readonly mergeFaces: boolean;
  readonly hardness: number;
  readonly blastResistance: number;
  readonly preferredTool: BlockToolKind | null;
  readonly minimumToolTierRank: number;
  readonly lightOpacity: number;
  readonly luminance: number;
}

function definition(
  id: BlockTypeValue,
  label: string,
  values: Omit<BlockDefinition, 'id' | 'label'>,
): BlockDefinition {
  return { id, label, ...values };
}

const AIR_VALUES = {
  solid: false,
  targetable: false,
  replaceable: true,
  renderShape: 'empty',
  mergeFaces: false,
  hardness: 0,
  blastResistance: 0,
  preferredTool: null,
  minimumToolTierRank: 0,
  lightOpacity: 0,
  luminance: 0,
} as const;

const FULL_CUBE_VALUES = {
  solid: true,
  targetable: true,
  replaceable: false,
  renderShape: 'cube',
  mergeFaces: true,
  lightOpacity: 15,
  luminance: 0,
} as const;

const DEFINITIONS: Readonly<Record<BlockTypeValue, BlockDefinition>> = {
  [BlockType.Air]: definition(BlockType.Air, '空气', AIR_VALUES),
  [BlockType.Grass]: definition(BlockType.Grass, '草方块', {
    ...FULL_CUBE_VALUES,
    hardness: 0.6,
    blastResistance: 0.6,
    preferredTool: 'shovel',
    minimumToolTierRank: 0,
  }),
  [BlockType.Dirt]: definition(BlockType.Dirt, '泥土', {
    ...FULL_CUBE_VALUES,
    hardness: 0.5,
    blastResistance: 0.5,
    preferredTool: 'shovel',
    minimumToolTierRank: 0,
  }),
  [BlockType.Stone]: definition(BlockType.Stone, '石头', {
    ...FULL_CUBE_VALUES,
    hardness: 1.5,
    blastResistance: 6,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 1,
  }),
  [BlockType.RuneStone]: definition(BlockType.RuneStone, '符文石', {
    ...FULL_CUBE_VALUES,
    hardness: 2.2,
    blastResistance: 8,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 2,
    luminance: 10,
  }),
  [BlockType.OakLog]: definition(BlockType.OakLog, '橡木原木', {
    ...FULL_CUBE_VALUES,
    hardness: 2,
    blastResistance: 2,
    preferredTool: 'axe',
    minimumToolTierRank: 0,
  }),
  [BlockType.OakLeaves]: definition(BlockType.OakLeaves, '橡树树叶', {
    ...FULL_CUBE_VALUES,
    hardness: 0.2,
    blastResistance: 0.2,
    preferredTool: null,
    minimumToolTierRank: 0,
    solid: true,
    mergeFaces: false,
    lightOpacity: 1,
  }),
  [BlockType.OakPlanks]: definition(BlockType.OakPlanks, '橡木木板', {
    ...FULL_CUBE_VALUES,
    hardness: 2,
    blastResistance: 3,
    preferredTool: 'axe',
    minimumToolTierRank: 0,
  }),
  [BlockType.CraftingTable]: definition(BlockType.CraftingTable, '工作台', {
    ...FULL_CUBE_VALUES,
    hardness: 2.5,
    blastResistance: 2.5,
    preferredTool: 'axe',
    minimumToolTierRank: 0,
  }),
  [BlockType.CoalOre]: definition(BlockType.CoalOre, '煤矿石', {
    ...FULL_CUBE_VALUES,
    hardness: 3,
    blastResistance: 3,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 1,
  }),
  [BlockType.IronOre]: definition(BlockType.IronOre, '铁矿石', {
    ...FULL_CUBE_VALUES,
    hardness: 3,
    blastResistance: 3,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 2,
  }),
  [BlockType.Furnace]: definition(BlockType.Furnace, '熔炉', {
    ...FULL_CUBE_VALUES,
    hardness: 3.5,
    blastResistance: 3.5,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 1,
  }),
  [BlockType.Cobblestone]: definition(BlockType.Cobblestone, '圆石', {
    ...FULL_CUBE_VALUES,
    hardness: 2,
    blastResistance: 6,
    preferredTool: 'pickaxe',
    minimumToolTierRank: 1,
  }),
  [BlockType.Torch]: definition(BlockType.Torch, '火把', {
    solid: false,
    targetable: true,
    replaceable: false,
    renderShape: 'cross',
    mergeFaces: false,
    hardness: 0,
    blastResistance: 0,
    preferredTool: null,
    minimumToolTierRank: 0,
    lightOpacity: 0,
    luminance: 14,
  }),
};

export function getBlockDefinition(block: BlockTypeValue): BlockDefinition {
  return DEFINITIONS[block] ?? DEFINITIONS[BlockType.Air];
}

export function isSolidBlock(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).solid;
}

export function isTargetableBlock(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).targetable;
}

export function isRenderableBlock(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).renderShape !== 'empty';
}

export function isFullCubeBlock(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).renderShape === 'cube';
}

export function shouldMergeBlockFaces(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).mergeFaces;
}

export function getBlockLightOpacity(block: BlockTypeValue): number {
  return getBlockDefinition(block).lightOpacity;
}

export function getBlockLuminance(block: BlockTypeValue): number {
  return getBlockDefinition(block).luminance;
}
