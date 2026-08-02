export const BlockType = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  RuneStone: 4,
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export function isSolidBlock(block: BlockType): boolean {
  return block !== BlockType.Air;
}
