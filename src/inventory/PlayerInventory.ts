import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';
import {
  getItemDefinition,
  getMiningSpeedMultiplier,
  isItemType,
  isToolItem,
  itemFromBlock,
  itemToBlock,
  ItemType,
} from './ItemDefinitions';
import type { ItemType as ItemTypeValue } from './ItemDefinitions';

export const HOTBAR_SLOT_COUNT = 9;

export interface InventorySlotSnapshot {
  readonly item: ItemTypeValue | null;
  readonly count: number;
  readonly durability: number | null;
}

export interface PlayerInventorySnapshot {
  readonly version: 2;
  readonly selectedSlot: number;
  readonly slots: readonly InventorySlotSnapshot[];
}

interface MutableInventorySlot {
  item: ItemTypeValue | null;
  count: number;
  durability: number | null;
}

const DEFAULT_SLOTS: readonly InventorySlotSnapshot[] = [
  { item: ItemType.GrassBlock, count: 32, durability: null },
  { item: ItemType.DirtBlock, count: 32, durability: null },
  { item: ItemType.StoneBlock, count: 32, durability: null },
  { item: ItemType.RuneStoneBlock, count: 16, durability: null },
  { item: ItemType.WoodenShovel, count: 1, durability: 48 },
  { item: ItemType.WoodenPickaxe, count: 1, durability: 64 },
  { item: null, count: 0, durability: null },
  { item: null, count: 0, durability: null },
  { item: null, count: 0, durability: null },
];

function normalizeSelectedSlot(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 0), HOTBAR_SLOT_COUNT - 1);
}

function normalizeLegacyBlock(value: unknown): ItemTypeValue | null {
  if (
    value === BlockType.Grass ||
    value === BlockType.Dirt ||
    value === BlockType.Stone ||
    value === BlockType.RuneStone
  ) {
    return itemFromBlock(value);
  }
  return null;
}

function normalizeSlot(value: unknown): MutableInventorySlot {
  if (typeof value !== 'object' || value === null) {
    return { item: null, count: 0, durability: null };
  }

  const candidate = value as {
    item?: unknown;
    block?: unknown;
    count?: unknown;
    durability?: unknown;
  };
  const item = isItemType(candidate.item)
    ? candidate.item
    : normalizeLegacyBlock(candidate.block);
  if (item === null) {
    return { item: null, count: 0, durability: null };
  }

  const definition = getItemDefinition(item);
  if (definition.kind === 'tool') {
    const durability =
      typeof candidate.durability === 'number' &&
      Number.isInteger(candidate.durability)
        ? Math.min(
            Math.max(candidate.durability, 1),
            definition.maximumDurability ?? 1,
          )
        : (definition.maximumDurability ?? 1);
    return { item, count: 1, durability };
  }

  if (
    typeof candidate.count !== 'number' ||
    !Number.isInteger(candidate.count) ||
    candidate.count <= 0
  ) {
    return { item: null, count: 0, durability: null };
  }
  return {
    item,
    count: Math.min(candidate.count, definition.maximumStack),
    durability: null,
  };
}

function createDefaultSlot(index: number): MutableInventorySlot {
  const slot = DEFAULT_SLOTS[index];
  return slot === undefined
    ? { item: null, count: 0, durability: null }
    : { ...slot };
}

export class PlayerInventory {
  readonly #slots: MutableInventorySlot[];
  #selectedSlot: number;
  #revision = 0;

  public constructor(snapshot?: unknown) {
    if (typeof snapshot === 'object' && snapshot !== null) {
      const candidate = snapshot as { selectedSlot?: unknown; slots?: unknown };
      const sourceSlots = Array.isArray(candidate.slots) ? candidate.slots : [];
      this.#slots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) =>
        normalizeSlot(sourceSlots[index]),
      );
      this.#selectedSlot = normalizeSelectedSlot(candidate.selectedSlot);
      this.#ensureStarterTool(ItemType.WoodenShovel, 4);
      this.#ensureStarterTool(ItemType.WoodenPickaxe, 5);
    } else {
      this.#slots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) =>
        createDefaultSlot(index),
      );
      this.#selectedSlot = 1;
    }
  }

  public selectSlot(index: number): void {
    if (!Number.isInteger(index)) {
      return;
    }
    const next = Math.min(Math.max(index, 0), HOTBAR_SLOT_COUNT - 1);
    if (next !== this.#selectedSlot) {
      this.#selectedSlot = next;
      this.#revision += 1;
    }
  }

  public cycleSelection(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    const direction = delta > 0 ? 1 : -1;
    this.#selectedSlot =
      (this.#selectedSlot + direction + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT;
    this.#revision += 1;
  }

  public addBlock(block: BlockTypeValue, count = 1): number {
    const item = itemFromBlock(block);
    return item === null ? count : this.addItem(item, count);
  }

  public addItem(item: ItemTypeValue, count = 1): number {
    if (!isItemType(item) || !Number.isInteger(count) || count <= 0) {
      return count;
    }

    const definition = getItemDefinition(item);
    if (definition.kind === 'tool') {
      let remaining = count;
      for (const slot of this.#slots) {
        if (slot.item !== null) {
          continue;
        }
        slot.item = item;
        slot.count = 1;
        slot.durability = definition.maximumDurability;
        remaining -= 1;
        if (remaining === 0) {
          break;
        }
      }
      if (remaining !== count) {
        this.#revision += 1;
      }
      return remaining;
    }

    let remaining = count;
    for (const slot of this.#slots) {
      if (slot.item !== item || slot.count >= definition.maximumStack) {
        continue;
      }
      const accepted = Math.min(definition.maximumStack - slot.count, remaining);
      slot.count += accepted;
      remaining -= accepted;
      if (remaining === 0) {
        this.#revision += 1;
        return 0;
      }
    }

    for (const slot of this.#slots) {
      if (slot.item !== null) {
        continue;
      }
      const accepted = Math.min(definition.maximumStack, remaining);
      slot.item = item;
      slot.count = accepted;
      slot.durability = null;
      remaining -= accepted;
      if (remaining === 0) {
        this.#revision += 1;
        return 0;
      }
    }
    if (remaining !== count) {
      this.#revision += 1;
    }
    return remaining;
  }

  public canConsumeSelectedBlock(block: BlockTypeValue, count = 1): boolean {
    const slot = this.#slots[this.#selectedSlot];
    return (
      slot?.item !== null &&
      itemToBlock(slot?.item ?? null) === block &&
      Number.isInteger(count) &&
      count > 0 &&
      slot.count >= count
    );
  }

  public consumeSelectedBlock(count = 1): boolean {
    const slot = this.#slots[this.#selectedSlot];
    if (
      slot?.item === undefined ||
      slot.item === null ||
      itemToBlock(slot.item) === null ||
      !Number.isInteger(count) ||
      count <= 0 ||
      slot.count < count
    ) {
      return false;
    }

    slot.count -= count;
    if (slot.count === 0) {
      this.#clearSlot(slot);
    }
    this.#revision += 1;
    return true;
  }

  public damageSelectedTool(amount = 1): boolean {
    const slot = this.#slots[this.#selectedSlot];
    if (
      slot?.item === undefined ||
      !isToolItem(slot.item) ||
      slot.durability === null ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return false;
    }

    slot.durability -= amount;
    if (slot.durability <= 0) {
      this.#clearSlot(slot);
    }
    this.#revision += 1;
    return true;
  }

  public getMiningSpeed(block: BlockTypeValue): number {
    return getMiningSpeedMultiplier(this.selectedItem, block);
  }

  public get revision(): number {
    return this.#revision;
  }

  public get selectedSlot(): number {
    return this.#selectedSlot;
  }

  public get selectedItem(): ItemTypeValue | null {
    return this.#slots[this.#selectedSlot]?.item ?? null;
  }

  public get selectedBlock(): BlockTypeValue | null {
    return itemToBlock(this.selectedItem);
  }

  public get snapshot(): PlayerInventorySnapshot {
    return {
      version: 2,
      selectedSlot: this.#selectedSlot,
      slots: this.#slots.map((slot) => ({ ...slot })),
    };
  }

  #ensureStarterTool(item: ItemTypeValue, preferredSlot: number): void {
    if (this.#slots.some((slot) => slot.item === item)) {
      return;
    }
    const preferred = this.#slots[preferredSlot];
    const target =
      preferred?.item === null
        ? preferred
        : this.#slots.find((slot) => slot.item === null);
    if (target === undefined) {
      return;
    }
    const definition = getItemDefinition(item);
    target.item = item;
    target.count = 1;
    target.durability = definition.maximumDurability;
  }

  #clearSlot(slot: MutableInventorySlot): void {
    slot.item = null;
    slot.count = 0;
    slot.durability = null;
  }
}
