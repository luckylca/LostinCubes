import { resolveRuntimeWorldId } from '../world/ActiveWorldRuntime';
import { PlayerInventory } from './PlayerInventory';

export interface InventoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createInventoryKey(worldSeed: string): string {
  return `lost-in-cubes:inventory:${resolveRuntimeWorldId(worldSeed)}`;
}

export function loadPlayerInventory(
  worldSeed: string,
  storage: InventoryStorage | null,
): PlayerInventory {
  if (storage === null) {
    return new PlayerInventory();
  }

  try {
    const serialized = storage.getItem(createInventoryKey(worldSeed));
    if (serialized === null) {
      return new PlayerInventory();
    }
    return new PlayerInventory(JSON.parse(serialized) as unknown);
  } catch (error: unknown) {
    console.warn('Inventory save could not be restored; using defaults.', error);
    return new PlayerInventory();
  }
}

export function savePlayerInventory(
  worldSeed: string,
  inventory: PlayerInventory,
  storage: InventoryStorage | null,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      createInventoryKey(worldSeed),
      JSON.stringify(inventory.snapshot),
    );
  } catch (error: unknown) {
    console.warn('Inventory save could not be written.', error);
  }
}
