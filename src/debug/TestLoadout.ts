import { ItemType } from '../inventory/ItemDefinitions';
import type { PlayerInventory } from '../inventory/PlayerInventory';

export interface TestLoadoutEntry {
  readonly item: ItemType;
  readonly count: number;
}

/**
 * Test mode is intentionally opt-in. Normal gameplay never receives these
 * items. A future test build can either use ?test=1 or replace this list with
 * exactly the objects requested for that test.
 */
export const DEFAULT_TEST_LOADOUT: readonly TestLoadoutEntry[] = [
  { item: ItemType.Bow, count: 1 },
  { item: ItemType.Arrow, count: 64 },
  { item: ItemType.Tnt, count: 32 },
  { item: ItemType.IronHelmet, count: 1 },
  { item: ItemType.IronChestplate, count: 1 },
  { item: ItemType.IronLeggings, count: 1 },
  { item: ItemType.IronBoots, count: 1 },
  { item: ItemType.IronAxe, count: 1 },
  { item: ItemType.RawPorkchop, count: 16 },
  { item: ItemType.RawBeef, count: 16 },
];

export function isExplicitTestMode(search: string): boolean {
  return new URLSearchParams(search).get('test') === '1';
}

export function applyExplicitTestLoadout(
  inventory: PlayerInventory,
  search: string,
  loadout: readonly TestLoadoutEntry[] = DEFAULT_TEST_LOADOUT,
): boolean {
  if (!isExplicitTestMode(search)) return false;

  let changed = false;
  for (const entry of loadout) {
    const missing = Math.max(entry.count - inventory.countItem(entry.item), 0);
    if (missing <= 0) continue;
    const remaining = inventory.addItem(entry.item, missing);
    if (remaining < missing) changed = true;
  }
  return changed;
}

export function browserSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}
