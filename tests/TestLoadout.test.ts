import { describe, expect, it } from 'vitest';
import {
  applyExplicitTestLoadout,
  isExplicitTestMode,
} from '../src/debug/TestLoadout';
import { ItemType } from '../src/inventory/ItemDefinitions';
import { PlayerInventory } from '../src/inventory/PlayerInventory';

describe('explicit test mode loadout', () => {
  it('is disabled by default', () => {
    expect(isExplicitTestMode('')).toBe(false);
    expect(isExplicitTestMode('?foo=1')).toBe(false);

    const inventory = new PlayerInventory();
    expect(applyExplicitTestLoadout(inventory, '')).toBe(false);
    expect(inventory.countItem(ItemType.Bow)).toBe(0);
    expect(inventory.countItem(ItemType.Tnt)).toBe(0);
  });

  it('adds the requested test kit only when explicitly enabled', () => {
    const inventory = new PlayerInventory();

    expect(applyExplicitTestLoadout(inventory, '?test=1')).toBe(true);
    expect(inventory.countItem(ItemType.Bow)).toBe(1);
    expect(inventory.countItem(ItemType.Arrow)).toBe(64);
    expect(inventory.countItem(ItemType.Tnt)).toBe(32);
    expect(inventory.countItem(ItemType.IronChestplate)).toBe(1);

    expect(applyExplicitTestLoadout(inventory, '?test=1')).toBe(false);
    expect(inventory.countItem(ItemType.Arrow)).toBe(64);
    expect(inventory.countItem(ItemType.Tnt)).toBe(32);
  });
});
