import { getBlockDefinition, isFluidBlock } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

export type FluidRuleBlockSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => BlockTypeValue;

const HORIZONTAL_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Air, plants, and fluids can be replaced by a placed solid block. */
export function canReplaceBlockForPlacement(block: BlockTypeValue): boolean {
  return getBlockDefinition(block).replaceable;
}

/**
 * Resolves the fluid that immediately occupies a freshly opened voxel.
 * Downward fluid has priority, then nearby water, then nearby lava. This is a
 * bounded edit response rather than an unbounded world flood fill.
 */
export function getFluidReplacementAfterBreak(
  sampleBlock: FluidRuleBlockSampler,
  worldX: number,
  worldY: number,
  worldZ: number,
): BlockTypeValue {
  const above = sampleBlock(worldX, worldY + 1, worldZ);
  if (isFluidBlock(above)) return above;

  let touchesWater = false;
  let touchesLava = false;
  for (const [offsetX, offsetZ] of HORIZONTAL_NEIGHBORS) {
    const neighbor = sampleBlock(
      worldX + offsetX,
      worldY,
      worldZ + offsetZ,
    );
    touchesWater = touchesWater || neighbor === BlockType.Water;
    touchesLava = touchesLava || neighbor === BlockType.Lava;
  }

  if (touchesWater) return BlockType.Water;
  if (touchesLava) return BlockType.Lava;
  return BlockType.Air;
}
