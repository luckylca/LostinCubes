import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

export const HOTBAR_SLOT_COUNT = 9;
export const MAX_BLOCK_STACK = 64;

export interface InventorySlotSnapshot {
  readonly block: BlockTypeValue | null;
  readonly count: number;
}

export interface PlayerInventorySnapshot {
  readonly selectedSlot: number;
  readonly slots: readonly InventorySlotSnapshot[];
}

interface MutableInventorySlot {
  block: BlockTypeValue | null;
  count: number;
}

const DEFAULT_SLOTS: readonly InventorySlotSnapshot[] = [
  { block: BlockType.Grass, count: 64 },
  { block: BlockType.Dirt, count: 64 },
  { block: BlockType.Stone, count: 64 },
  { block: BlockType.RuneStone, count: 32 },
  { block: null, count: 0 },
  { block: null, count: 0 },
  { block: null, count: 0 },
  { block: null, count: 0 },
  { block: null, count: 0 },
];

function isInventoryBlock(value: unknown): value is BlockTypeValue {
  return (
    value === BlockType.Grass ||
    value === BlockType.Dirt ||
    value === BlockType.Stone ||
    value === BlockType.RuneStone
  );
}

function normalizeSlot(value: unknown): MutableInventorySlot {
  if (typeof value !== 'object' || value === null) {
    return { block: null, count: 0 };
  }
  const candidate = value as { block?: unknown; count?: unknown };
  if (
    !isInventoryBlock(candidate.block) ||
    typeof candidate.count !== 'number' ||
    !Number.isInteger(candidate.count) ||
    candidate.count <= 0
  ) {
    return { block: null, count: 0 };
  }
  return {
    block: candidate.block,
    count: Math.min(candidate.count, MAX_BLOCK_STACK),
  };
}

function normalizeSelectedSlot(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 0), HOTBAR_SLOT_COUNT - 1);
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
    } else {
      this.#slots = DEFAULT_SLOTS.map((slot) => ({ ...slot }));
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

  public add(block: BlockTypeValue, count = 1): number {
    if (!isInventoryBlock(block) || !Number.isInteger(count) || count <= 0) {
      return count;
    }

    let remaining = count;
    for (const slot of this.#slots) {
      if (slot.block !== block || slot.count >= MAX_BLOCK_STACK) {
        continue;
      }
      const accepted = Math.min(MAX_BLOCK_STACK - slot.count, remaining);
      slot.count += accepted;
      remaining -= accepted;
      if (remaining === 0) {
        this.#revision += 1;
        return 0;
      }
    }

    for (const slot of this.#slots) {
      if (slot.block !== null) {
        continue;
      }
      const accepted = Math.min(MAX_BLOCK_STACK, remaining);
      slot.block = block;
      slot.count = accepted;
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

  public canConsumeSelected(block: BlockTypeValue, count = 1): boolean {
    const slot = this.#slots[this.#selectedSlot];
    return (
      slot?.block === block &&
      Number.isInteger(count) &&
      count > 0 &&
      slot.count >= count
    );
  }

  public consumeSelected(count = 1): boolean {
    const slot = this.#slots[this.#selectedSlot];
    if (
      slot?.block === undefined ||
      slot.block === null ||
      !Number.isInteger(count) ||
      count <= 0 ||
      slot.count < count
    ) {
      return false;
    }

    slot.count -= count;
    if (slot.count === 0) {
      slot.block = null;
    }
    this.#revision += 1;
    return true;
  }

  public get revision(): number {
    return this.#revision;
  }

  public get selectedSlot(): number {
    return this.#selectedSlot;
  }

  public get selectedBlock(): BlockTypeValue | null {
    return this.#slots[this.#selectedSlot]?.block ?? null;
  }

  public get snapshot(): PlayerInventorySnapshot {
    return {
      selectedSlot: this.#selectedSlot,
      slots: this.#slots.map((slot) => ({ ...slot })),
    };
  }
}
