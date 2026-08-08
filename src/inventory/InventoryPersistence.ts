import {
  applyExplicitTestLoadout,
  browserSearch,
} from '../debug/TestLoadout';
import { resolveRuntimeWorldId } from '../world/ActiveWorldRuntime';
import { PlayerInventory } from './PlayerInventory';

export interface InventoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createInventoryKey(worldSeed: string): string {
  return `lost-in-cubes:inventory:${resolveRuntimeWorldId(worldSeed)}`;
}

// This release is an explicitly requested playtest build. It intentionally
// injects the Batch 3 test inventory even on the normal URL. Flip this back to
// false on the next release unless that turn explicitly asks for testing.
const CURRENT_PLAYTEST_LOADOUT_ENABLED = true;

function withPlaytestLoadout(inventory: PlayerInventory): PlayerInventory {
  const search = CURRENT_PLAYTEST_LOADOUT_ENABLED ? '?test=1' : browserSearch();
  applyExplicitTestLoadout(inventory, search);
  return inventory;
}

export function loadPlayerInventory(
  worldSeed: string,
  storage: InventoryStorage | null,
): PlayerInventory {
  if (storage === null) {
    return withPlaytestLoadout(new PlayerInventory());
  }

  try {
    const serialized = storage.getItem(createInventoryKey(worldSeed));
    if (serialized === null) {
      return withPlaytestLoadout(new PlayerInventory());
    }
    return withPlaytestLoadout(
      new PlayerInventory(JSON.parse(serialized) as unknown),
    );
  } catch (error: unknown) {
    console.warn('Inventory save could not be restored; using defaults.', error);
    return withPlaytestLoadout(new PlayerInventory());
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
