import { getBlockDefinition } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export type FluidRuleBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

/** Air, plants, and fluids can be replaced by a placed solid block. */
export function canReplaceBlockForPlacement(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).replaceable;
}

/**
 * A vertical fluid column can immediately fall into the voxel that was opened
 * beneath it. Horizontal neighbors are deliberately not copied here: the
 * scheduled level simulation decides whether/how far they flow, preventing a
 * mined shoreline cell from silently becoming a new permanent source.
 */
export function getFluidReplacementAfterBreak(
  sampleBlock: FluidRuleBlockSampler,
  worldX: number,
  worldY: number,
  worldZ: number,
): BlockTypeValue {
  const above = sampleBlock(worldX, worldY + 1, worldZ);
  if (above === BlockType.Water || above === BlockType.Lava) return above;
  return BlockType.Air;
}
