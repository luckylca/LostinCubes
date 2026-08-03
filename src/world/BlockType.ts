export const BlockType = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  RuneStone: 4,
  OakLog: 5,
  OakLeaves: 6,
  OakPlanks: 7,
  CraftingTable: 8,
  CoalOre: 9,
  IronOre: 10,
  Furnace: 11,
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export function isSolidBlock(block: BlockType): boolean {
  return block !== BlockType.Air;
}
