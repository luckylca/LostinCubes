import { applyExplicitTestLoadout } from '../debug/TestLoadout';
import { resolveRuntimeWorldId } from '../world/ActiveWorldRuntime';
import { PlayerInventory } from './PlayerInventory';

export interface InventoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createInventoryKey(worldSeed: string): string {
  return `lost-in-cubes:inventory:${resolveRuntimeWorldId(worldSeed)}`;
}

/**
 * v0.3.2 is an explicitly requested playtest release, so the Batch 3 loadout
 * is filled on the normal game URL as well. Remove this wrapper on the next
 * non-playtest release instead of leaving a hidden permanent debug mode.
 */
function withCurrentPlaytestLoadout(inventory: PlayerInventory): PlayerInventory {
  applyExplicitTestLoadout(inventory, '?test=1');
  return inventory;
}

export function loadPlayerInventory(
  worldSeed: string,
  storage: InventoryStorage | null,
): PlayerInventory {
  if (storage === null) {
    return withCurrentPlaytestLoadout(new PlayerInventory());
  }

  try {
    const serialized = storage.getItem(createInventoryKey(worldSeed));
    if (serialized === null) {
      return withCurrentPlaytestLoadout(new PlayerInventory());
    }
    return withCurrentPlaytestLoadout(
      new PlayerInventory(JSON.parse(serialized) as unknown),
    );
  } catch (error: unknown) {
    console.warn('Inventory save could not be restored; using defaults.', error);
    return withCurrentPlaytestLoadout(new PlayerInventory());
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
