import type { BlockType as BlockTypeValue } from '../world/BlockType';
import {
  getItemDefinition,
  getMiningSpeedMultiplier,
  isItemType,
  isToolItem,
  itemFromBlock,
  itemToBlock,
} from './ItemDefinitions';
import type { ItemType as ItemTypeValue } from './ItemDefinitions';

export const HOTBAR_SLOT_COUNT = 9;
export const STORAGE_SLOT_COUNT = 27;
export const INVENTORY_SLOT_COUNT = STORAGE_SLOT_COUNT + HOTBAR_SLOT_COUNT;
export const HOTBAR_START_INDEX = STORAGE_SLOT_COUNT;

export interface InventorySlotSnapshot {
  readonly item: ItemTypeValue | null;
  readonly count: number;
  readonly durability: number | null;
}

export interface PlayerInventorySnapshot {
  readonly version: 3;
  readonly selectedSlot: number;
  readonly slots: readonly InventorySlotSnapshot[];
}

export interface ItemRequirement {
  readonly item: ItemTypeValue;
  readonly count: number;
}

interface MutableInventorySlot {
  item: ItemTypeValue | null;
  count: number;
  durability: number | null;
}

const EMPTY_SLOT: InventorySlotSnapshot = {
  item: null,
  count: 0,
  durability: null,
};

function createEmptySlot(): MutableInventorySlot {
  return { ...EMPTY_SLOT };
}

function normalizeSelectedSlot(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), HOTBAR_SLOT_COUNT - 1);
}

function normalizeLegacyBlock(value: unknown): ItemTypeValue | null {
  if (typeof value !== 'number') {
    return null;
  }
  return itemFromBlock(value as BlockTypeValue);
}

function normalizeSlot(value: unknown): MutableInventorySlot {
  if (typeof value !== 'object' || value === null) {
    return createEmptySlot();
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
    return createEmptySlot();
  }

  const definition = getItemDefinition(item);
  if (definition.kind === 'tool') {
    const maximum = definition.maximumDurability ?? 1;
    const durability =
      typeof candidate.durability === 'number' &&
      Number.isInteger(candidate.durability)
        ? Math.min(Math.max(candidate.durability, 1), maximum)
        : maximum;
    return { item, count: 1, durability };
  }

  if (
    typeof candidate.count !== 'number' ||
    !Number.isInteger(candidate.count) ||
    candidate.count <= 0
  ) {
    return createEmptySlot();
  }
  return {
    item,
    count: Math.min(candidate.count, definition.maximumStack),
    durability: null,
  };
}

function cloneStack(stack: InventorySlotSnapshot): InventorySlotSnapshot {
  return { ...stack };
}

function slotOrderForPickup(): number[] {
  return [
    ...Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) =>
      HOTBAR_START_INDEX + index,
    ),
    ...Array.from({ length: STORAGE_SLOT_COUNT }, (_, index) => index),
  ];
}

function aggregateRequirements(
  requirements: readonly ItemRequirement[],
): ReadonlyMap<ItemTypeValue, number> | null {
  const totals = new Map<ItemTypeValue, number>();
  for (const requirement of requirements) {
    if (!Number.isInteger(requirement.count) || requirement.count <= 0) {
      return null;
    }
    totals.set(
      requirement.item,
      (totals.get(requirement.item) ?? 0) + requirement.count,
    );
  }
  return totals;
}

const PICKUP_SLOT_ORDER = slotOrderForPickup();

export class PlayerInventory {
  readonly #slots: MutableInventorySlot[];
  #selectedSlot: number;
  #revision = 0;

  public constructor(snapshot?: unknown) {
    this.#slots = Array.from({ length: INVENTORY_SLOT_COUNT }, createEmptySlot);
    this.#selectedSlot = 0;

    if (typeof snapshot !== 'object' || snapshot === null) {
      return;
    }

    const candidate = snapshot as { selectedSlot?: unknown; slots?: unknown };
    const sourceSlots = Array.isArray(candidate.slots) ? candidate.slots : [];
    this.#selectedSlot = normalizeSelectedSlot(candidate.selectedSlot);

    if (sourceSlots.length <= HOTBAR_SLOT_COUNT) {
      for (let index = 0; index < sourceSlots.length; index += 1) {
        this.#slots[HOTBAR_START_INDEX + index] = normalizeSlot(sourceSlots[index]);
      }
      return;
    }

    for (let index = 0; index < INVENTORY_SLOT_COUNT; index += 1) {
      this.#slots[index] = normalizeSlot(sourceSlots[index]);
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
    let remaining = count;
    if (definition.maximumStack > 1) {
      for (const index of PICKUP_SLOT_ORDER) {
        const slot = this.#slots[index];
        if (
          slot?.item !== item ||
          slot.count >= definition.maximumStack
        ) {
          continue;
        }
        const accepted = Math.min(
          definition.maximumStack - slot.count,
          remaining,
        );
        slot.count += accepted;
        remaining -= accepted;
        if (remaining === 0) {
          this.#revision += 1;
          return 0;
        }
      }
    }

    for (const index of PICKUP_SLOT_ORDER) {
      const slot = this.#slots[index];
      if (slot?.item !== null) {
        continue;
      }
      const accepted = Math.min(definition.maximumStack, remaining);
      slot.item = item;
      slot.count = accepted;
      slot.durability = definition.maximumDurability;
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

  public countItem(item: ItemTypeValue): number {
    let total = 0;
    for (const slot of this.#slots) {
      if (slot.item === item) {
        total += slot.count;
      }
    }
    return total;
  }

  public hasItems(requirements: readonly ItemRequirement[]): boolean {
    const totals = aggregateRequirements(requirements);
    if (totals === null) {
      return false;
    }
    for (const [item, count] of totals) {
      if (this.countItem(item) < count) {
        return false;
      }
    }
    return true;
  }

  public consumeItems(requirements: readonly ItemRequirement[]): boolean {
    const totals = aggregateRequirements(requirements);
    if (totals === null) {
      return false;
    }
    for (const [item, count] of totals) {
      if (this.countItem(item) < count) {
        return false;
      }
    }

    for (const [item, count] of totals) {
      let remaining = count;
      for (const slot of this.#slots) {
        if (slot.item !== item) {
          continue;
        }
        const removed = Math.min(slot.count, remaining);
        slot.count -= removed;
        remaining -= removed;
        if (slot.count === 0) {
          this.#clearSlot(slot);
        }
        if (remaining === 0) {
          break;
        }
      }
    }
    this.#revision += 1;
    return true;
  }

  public interactSlot(
    index: number,
    cursor: InventorySlotSnapshot | null,
    secondary: boolean,
  ): InventorySlotSnapshot | null {
    const slot = this.#slots[index];
    if (slot === undefined) {
      return cursor === null ? null : cloneStack(cursor);
    }

    if (cursor === null) {
      if (slot.item === null) {
        return null;
      }
      const takeCount = secondary ? Math.ceil(slot.count / 2) : slot.count;
      const taken: InventorySlotSnapshot = {
        item: slot.item,
        count: takeCount,
        durability: slot.durability,
      };
      slot.count -= takeCount;
      if (slot.count === 0) {
        this.#clearSlot(slot);
      }
      this.#revision += 1;
      return taken;
    }

    const cursorDefinition =
      cursor.item === null ? null : getItemDefinition(cursor.item);
    if (cursor.item === null || cursorDefinition === null) {
      return null;
    }

    if (slot.item === null) {
      const placed = secondary ? 1 : cursor.count;
      slot.item = cursor.item;
      slot.count = placed;
      slot.durability = cursor.durability;
      this.#revision += 1;
      return placed === cursor.count
        ? null
        : { ...cursor, count: cursor.count - placed };
    }

    if (
      slot.item === cursor.item &&
      cursorDefinition.maximumStack > 1 &&
      slot.count < cursorDefinition.maximumStack
    ) {
      const placed = Math.min(
        secondary ? 1 : cursor.count,
        cursorDefinition.maximumStack - slot.count,
      );
      slot.count += placed;
      this.#revision += 1;
      return placed === cursor.count
        ? null
        : { ...cursor, count: cursor.count - placed };
    }

    if (secondary) {
      return cloneStack(cursor);
    }

    const replaced: InventorySlotSnapshot = {
      item: slot.item,
      count: slot.count,
      durability: slot.durability,
    };
    slot.item = cursor.item;
    slot.count = cursor.count;
    slot.durability = cursor.durability;
    this.#revision += 1;
    return replaced;
  }

  public canConsumeSelectedBlock(block: BlockTypeValue, count = 1): boolean {
    const slot = this.#slots[this.selectedInventoryIndex];
    return (
      slot !== undefined &&
      slot.item !== null &&
      itemToBlock(slot.item) === block &&
      Number.isInteger(count) &&
      count > 0 &&
      slot.count >= count
    );
  }

  public consumeSelectedBlock(count = 1): boolean {
    const slot = this.#slots[this.selectedInventoryIndex];
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
    const slot = this.#slots[this.selectedInventoryIndex];
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

  public get selectedInventoryIndex(): number {
    return HOTBAR_START_INDEX + this.#selectedSlot;
  }

  public get selectedItem(): ItemTypeValue | null {
    return this.#slots[this.selectedInventoryIndex]?.item ?? null;
  }

  public get selectedBlock(): BlockTypeValue | null {
    return itemToBlock(this.selectedItem);
  }

  public get snapshot(): PlayerInventorySnapshot {
    return {
      version: 3,
      selectedSlot: this.#selectedSlot,
      slots: this.#slots.map((slot) => ({ ...slot })),
    };
  }

  #clearSlot(slot: MutableInventorySlot): void {
    slot.item = null;
    slot.count = 0;
    slot.durability = null;
  }
}
