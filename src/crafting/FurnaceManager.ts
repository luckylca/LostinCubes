import {
  getFuelSeconds,
  ItemType,
} from '../inventory/ItemDefinitions';
import type {
  InventorySlotSnapshot,
  PlayerInventory,
} from '../inventory/PlayerInventory';
import { resolveRuntimeWorldId } from '../world/ActiveWorldRuntime';
import { syncBurningFurnaceLights } from '../world/FurnaceLightRuntime';

const STORAGE_PREFIX = 'lost-in-cubes:furnaces:';
const MAXIMUM_FURNACES = 128;
const MAXIMUM_SLOT_COUNT = 64;
export const FURNACE_BURN_SECONDS_PER_COAL = getFuelSeconds(ItemType.Coal);
export const FURNACE_SMELT_SECONDS = 4;
export const FURNACE_LIGHT_LEVEL = 13;

export interface FurnacePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FurnaceViewState {
  readonly inputCount: number;
  readonly fuelCount: number;
  readonly outputCount: number;
  readonly burnSecondsRemaining: number;
  readonly smeltProgressSeconds: number;
  readonly burnProgress: number;
  readonly smeltProgress: number;
  readonly active: boolean;
}

interface MutableFurnaceState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  inputCount: number;
  fuelCount: number;
  outputCount: number;
  burnSecondsRemaining: number;
  smeltProgressSeconds: number;
}

interface FurnaceSave {
  readonly version: 1;
  readonly furnaces: readonly MutableFurnaceState[];
}

function createKey(position: FurnacePosition): string {
  return `${String(position.x)},${String(position.y)},${String(position.z)}`;
}

function clampCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.min(Math.max(value, 0), MAXIMUM_SLOT_COUNT)
    : 0;
}

function clampSeconds(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), maximum)
    : 0;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export class FurnaceManager {
  readonly #worldSeed: string;
  readonly #storage: Storage | null;
  readonly #states = new Map<string, MutableFurnaceState>();
  #revision = 0;

  public constructor(worldSeed: string, storage: Storage | null) {
    this.#worldSeed = resolveRuntimeWorldId(worldSeed);
    this.#storage = storage;
    this.#restore();
    this.#syncLightSources();
  }

  public getState(position: FurnacePosition): FurnaceViewState {
    const state = this.#ensure(position);
    return {
      inputCount: state.inputCount,
      fuelCount: state.fuelCount,
      outputCount: state.outputCount,
      burnSecondsRemaining: state.burnSecondsRemaining,
      smeltProgressSeconds: state.smeltProgressSeconds,
      burnProgress: state.burnSecondsRemaining / FURNACE_BURN_SECONDS_PER_COAL,
      smeltProgress: state.smeltProgressSeconds / FURNACE_SMELT_SECONDS,
      active:
        state.burnSecondsRemaining > 0 &&
        state.inputCount > 0 &&
        state.outputCount < MAXIMUM_SLOT_COUNT,
    };
  }

  public insertInput(
    position: FurnacePosition,
    inventory: PlayerInventory,
    requested = 8,
  ): number {
    const state = this.#ensure(position);
    const availableSpace = MAXIMUM_SLOT_COUNT - state.inputCount;
    const amount = Math.min(
      Math.max(Math.floor(requested), 0),
      availableSpace,
      inventory.countItem(ItemType.RawIron),
    );
    if (amount <= 0) return 0;
    if (!inventory.consumeItems([{ item: ItemType.RawIron, count: amount }])) {
      return 0;
    }
    state.inputCount += amount;
    this.#revision += 1;
    return amount;
  }

  public insertFuel(
    position: FurnacePosition,
    inventory: PlayerInventory,
    requested = 8,
  ): number {
    const state = this.#ensure(position);
    const availableSpace = MAXIMUM_SLOT_COUNT - state.fuelCount;
    const amount = Math.min(
      Math.max(Math.floor(requested), 0),
      availableSpace,
      inventory.countItem(ItemType.Coal),
    );
    if (amount <= 0) return 0;
    if (!inventory.consumeItems([{ item: ItemType.Coal, count: amount }])) {
      return 0;
    }
    state.fuelCount += amount;
    this.#revision += 1;
    return amount;
  }

  public takeOutput(
    position: FurnacePosition,
    inventory: PlayerInventory,
  ): number {
    const state = this.#ensure(position);
    if (state.outputCount <= 0) return 0;
    const remaining = inventory.addItem(ItemType.IronIngot, state.outputCount);
    const accepted = state.outputCount - remaining;
    if (accepted <= 0) return 0;
    state.outputCount = remaining;
    this.#revision += 1;
    return accepted;
  }

  public update(stepSeconds: number): void {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return;
    const seconds = Math.min(stepSeconds, 0.25);
    let changed = false;

    for (const state of this.#states.values()) {
      const canSmelt = state.inputCount > 0 && state.outputCount < MAXIMUM_SLOT_COUNT;
      if (
        canSmelt &&
        state.burnSecondsRemaining <= 0 &&
        state.fuelCount > 0
      ) {
        state.fuelCount -= 1;
        state.burnSecondsRemaining = FURNACE_BURN_SECONDS_PER_COAL;
        changed = true;
      }

      if (state.burnSecondsRemaining <= 0) {
        if (!canSmelt && state.smeltProgressSeconds !== 0) {
          state.smeltProgressSeconds = 0;
          changed = true;
        }
        continue;
      }

      const burned = Math.min(state.burnSecondsRemaining, seconds);
      state.burnSecondsRemaining -= burned;
      changed = true;
      if (!canSmelt) continue;

      state.smeltProgressSeconds += burned;
      while (
        state.smeltProgressSeconds >= FURNACE_SMELT_SECONDS &&
        state.inputCount > 0 &&
        state.outputCount < MAXIMUM_SLOT_COUNT
      ) {
        state.smeltProgressSeconds -= FURNACE_SMELT_SECONDS;
        state.inputCount -= 1;
        state.outputCount += 1;
      }
      if (state.inputCount <= 0 || state.outputCount >= MAXIMUM_SLOT_COUNT) {
        state.smeltProgressSeconds = 0;
      }
    }

    if (changed) {
      this.#revision += 1;
      this.#syncLightSources();
    }
  }

  public drain(position: FurnacePosition): readonly InventorySlotSnapshot[] {
    const key = createKey(position);
    const state = this.#states.get(key);
    if (state === undefined) return [];
    this.#states.delete(key);
    this.#revision += 1;
    this.#syncLightSources();
    const stacks: InventorySlotSnapshot[] = [];
    if (state.inputCount > 0) {
      stacks.push({ item: ItemType.RawIron, count: state.inputCount, durability: null });
    }
    if (state.fuelCount > 0) {
      stacks.push({ item: ItemType.Coal, count: state.fuelCount, durability: null });
    }
    if (state.outputCount > 0) {
      stacks.push({ item: ItemType.IronIngot, count: state.outputCount, durability: null });
    }
    return stacks;
  }

  public save(): void {
    if (this.#storage === null) return;
    const save: FurnaceSave = {
      version: 1,
      furnaces: [...this.#states.values()].slice(0, MAXIMUM_FURNACES),
    };
    try {
      this.#storage.setItem(`${STORAGE_PREFIX}${this.#worldSeed}`, JSON.stringify(save));
    } catch (error: unknown) {
      console.warn('Furnace state could not be saved.', error);
    }
  }

  public get revision(): number {
    return this.#revision;
  }

  public get furnaceCount(): number {
    return this.#states.size;
  }

  public get burningPositions(): readonly FurnacePosition[] {
    const positions: FurnacePosition[] = [];
    for (const state of this.#states.values()) {
      if (state.burnSecondsRemaining > 0) {
        positions.push({ x: state.x, y: state.y, z: state.z });
      }
    }
    return positions;
  }

  #syncLightSources(): void {
    syncBurningFurnaceLights(this.burningPositions, FURNACE_LIGHT_LEVEL);
  }

  #ensure(position: FurnacePosition): MutableFurnaceState {
    const key = createKey(position);
    const existing = this.#states.get(key);
    if (existing !== undefined) return existing;
    const state: MutableFurnaceState = {
      x: position.x,
      y: position.y,
      z: position.z,
      inputCount: 0,
      fuelCount: 0,
      outputCount: 0,
      burnSecondsRemaining: 0,
      smeltProgressSeconds: 0,
    };
    this.#states.set(key, state);
    this.#revision += 1;
    return state;
  }

  #restore(): void {
    if (this.#storage === null) return;
    try {
      const raw = this.#storage.getItem(`${STORAGE_PREFIX}${this.#worldSeed}`);
      if (raw === null) return;
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return;
      const candidate = parsed as { furnaces?: unknown };
      if (!Array.isArray(candidate.furnaces)) return;
      for (const value of candidate.furnaces.slice(0, MAXIMUM_FURNACES)) {
        if (typeof value !== 'object' || value === null) continue;
        const state = value as Record<string, unknown>;
        if (
          !isCoordinate(state.x) ||
          !isCoordinate(state.y) ||
          !isCoordinate(state.z)
        ) {
          continue;
        }
        const restored: MutableFurnaceState = {
          x: state.x,
          y: state.y,
          z: state.z,
          inputCount: clampCount(state.inputCount),
          fuelCount: clampCount(state.fuelCount),
          outputCount: clampCount(state.outputCount),
          burnSecondsRemaining: clampSeconds(
            state.burnSecondsRemaining,
            FURNACE_BURN_SECONDS_PER_COAL,
          ),
          smeltProgressSeconds: clampSeconds(
            state.smeltProgressSeconds,
            FURNACE_SMELT_SECONDS,
          ),
        };
        this.#states.set(createKey(restored), restored);
      }
    } catch (error: unknown) {
      console.warn('Furnace state could not be restored.', error);
    }
  }
}
