import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import type { DroppedItemSnapshot } from './DroppedItemManager';

export interface DropStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAXIMUM_SAVED_DROPS = 96;

function createDropKey(worldSeed: string): string {
  return `lost-in-cubes:drops:${worldSeed}`;
}

function isPersistableBlock(value: unknown): value is BlockTypeValue {
  return (
    value === BlockType.Grass ||
    value === BlockType.Dirt ||
    value === BlockType.Stone ||
    value === BlockType.RuneStone ||
    value === BlockType.OakLog ||
    value === BlockType.OakLeaves ||
    value === BlockType.OakPlanks ||
    value === BlockType.CraftingTable
  );
}

function normalizeSnapshot(value: unknown): DroppedItemSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as {
    block?: unknown;
    count?: unknown;
    x?: unknown;
    y?: unknown;
    z?: unknown;
    grounded?: unknown;
  };
  if (
    !isPersistableBlock(candidate.block) ||
    typeof candidate.count !== 'number' ||
    !Number.isInteger(candidate.count) ||
    candidate.count <= 0 ||
    typeof candidate.x !== 'number' ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== 'number' ||
    !Number.isFinite(candidate.y) ||
    typeof candidate.z !== 'number' ||
    !Number.isFinite(candidate.z)
  ) {
    return null;
  }
  return {
    block: candidate.block,
    count: Math.min(candidate.count, 64),
    x: candidate.x,
    y: candidate.y,
    z: candidate.z,
    grounded: candidate.grounded === true,
  };
}

export function loadDroppedItems(
  worldSeed: string,
  storage: DropStorage | null,
): readonly DroppedItemSnapshot[] {
  if (storage === null) {
    return [];
  }
  try {
    const serialized = storage.getItem(createDropKey(worldSeed));
    if (serialized === null) {
      return [];
    }
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .slice(0, MAXIMUM_SAVED_DROPS)
      .map(normalizeSnapshot)
      .filter((snapshot): snapshot is DroppedItemSnapshot => snapshot !== null);
  } catch (error: unknown) {
    console.warn('Ground-drop save could not be restored.', error);
    return [];
  }
}

export function saveDroppedItems(
  worldSeed: string,
  snapshots: readonly DroppedItemSnapshot[],
  storage: DropStorage | null,
): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(
      createDropKey(worldSeed),
      JSON.stringify(snapshots.slice(0, MAXIMUM_SAVED_DROPS)),
    );
  } catch (error: unknown) {
    console.warn('Ground-drop save could not be written.', error);
  }
}
