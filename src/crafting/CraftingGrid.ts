import type { CraftingRecipe } from './CraftingRecipes';
import { getItemDefinition } from '../inventory/ItemDefinitions';
import type { ItemType } from '../inventory/ItemDefinitions';
import type {
  InventorySlotSnapshot,
  PlayerInventory,
} from '../inventory/PlayerInventory';

export interface CraftingMatch {
  readonly recipe: CraftingRecipe;
  readonly consumedSlots: readonly number[];
}

export interface CraftingTakeResult {
  readonly cursor: InventorySlotSnapshot | null;
  readonly recipe: CraftingRecipe | null;
  readonly crafted: boolean;
}

interface MutableCraftingSlot {
  item: ItemType | null;
  count: number;
  durability: number | null;
}

interface TrimmedPattern {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (ItemType | null)[];
}

function emptySlot(): MutableCraftingSlot {
  return { item: null, count: 0, durability: null };
}

function cloneStack(stack: InventorySlotSnapshot): InventorySlotSnapshot {
  return { ...stack };
}

function trimPattern(recipe: CraftingRecipe): TrimmedPattern | null {
  let minimumRow: number = recipe.gridSize;
  let maximumRow = -1;
  let minimumColumn: number = recipe.gridSize;
  let maximumColumn = -1;
  for (let row = 0; row < recipe.gridSize; row += 1) {
    for (let column = 0; column < recipe.gridSize; column += 1) {
      if ((recipe.pattern[row]?.[column] ?? null) === null) continue;
      minimumRow = Math.min(minimumRow, row);
      maximumRow = Math.max(maximumRow, row);
      minimumColumn = Math.min(minimumColumn, column);
      maximumColumn = Math.max(maximumColumn, column);
    }
  }
  if (maximumRow < minimumRow || maximumColumn < minimumColumn) return null;
  const width = maximumColumn - minimumColumn + 1;
  const height = maximumRow - minimumRow + 1;
  const cells: (ItemType | null)[] = [];
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      cells.push(recipe.pattern[row]?.[column] ?? null);
    }
  }
  return { width, height, cells };
}

function stackItem(stack: InventorySlotSnapshot | undefined): ItemType | null {
  return stack?.item !== null && (stack?.count ?? 0) > 0
    ? (stack?.item ?? null)
    : null;
}

function matchShapedAt(
  gridSize: 2 | 3,
  slots: readonly InventorySlotSnapshot[],
  pattern: TrimmedPattern,
  offsetX: number,
  offsetY: number,
  mirrored: boolean,
): readonly number[] | null {
  const consumed: number[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const index = column + row * gridSize;
      const patternX = column - offsetX;
      const patternY = row - offsetY;
      let expected: ItemType | null = null;
      if (
        patternX >= 0 &&
        patternX < pattern.width &&
        patternY >= 0 &&
        patternY < pattern.height
      ) {
        const sourceX = mirrored ? pattern.width - patternX - 1 : patternX;
        expected = pattern.cells[sourceX + patternY * pattern.width] ?? null;
      }
      const actual = stackItem(slots[index]);
      if (actual !== expected) return null;
      if (expected !== null) consumed.push(index);
    }
  }
  return consumed;
}

export function findCraftingMatch(
  gridSize: 2 | 3,
  slots: readonly InventorySlotSnapshot[],
  recipes: readonly CraftingRecipe[],
): CraftingMatch | null {
  for (const recipe of recipes) {
    if (recipe.gridSize > gridSize) continue;
    const pattern = trimPattern(recipe);
    if (pattern === null || pattern.width > gridSize || pattern.height > gridSize) {
      continue;
    }
    const maximumOffsetX = gridSize - pattern.width;
    const maximumOffsetY = gridSize - pattern.height;
    for (let offsetY = 0; offsetY <= maximumOffsetY; offsetY += 1) {
      for (let offsetX = 0; offsetX <= maximumOffsetX; offsetX += 1) {
        const normal = matchShapedAt(
          gridSize,
          slots,
          pattern,
          offsetX,
          offsetY,
          false,
        );
        if (normal !== null) return { recipe, consumedSlots: normal };
        if (recipe.allowMirror === false || pattern.width <= 1) continue;
        const mirrored = matchShapedAt(
          gridSize,
          slots,
          pattern,
          offsetX,
          offsetY,
          true,
        );
        if (mirrored !== null) return { recipe, consumedSlots: mirrored };
      }
    }
  }
  return null;
}

export class CraftingGrid {
  #size: 2 | 3;
  #slots: MutableCraftingSlot[];
  #revision = 0;

  public constructor(size: 2 | 3) {
    this.#size = size;
    this.#slots = Array.from({ length: size * size }, emptySlot);
  }

  public reset(size: 2 | 3): void {
    this.#size = size;
    this.#slots = Array.from({ length: size * size }, emptySlot);
    this.#revision += 1;
  }

  public interactSlot(
    index: number,
    cursor: InventorySlotSnapshot | null,
    secondary: boolean,
  ): InventorySlotSnapshot | null {
    const slot = this.#slots[index];
    if (slot === undefined) return cursor === null ? null : cloneStack(cursor);

    if (cursor === null) {
      if (slot.item === null) return null;
      const takeCount = secondary ? Math.ceil(slot.count / 2) : slot.count;
      const taken: InventorySlotSnapshot = {
        item: slot.item,
        count: takeCount,
        durability: slot.durability,
      };
      slot.count -= takeCount;
      if (slot.count <= 0) this.#clear(slot);
      this.#revision += 1;
      return taken;
    }

    if (cursor.item === null || cursor.count <= 0) return null;
    const definition = getItemDefinition(cursor.item);
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
      definition.maximumStack > 1 &&
      slot.count < definition.maximumStack
    ) {
      const placed = Math.min(
        secondary ? 1 : cursor.count,
        definition.maximumStack - slot.count,
      );
      slot.count += placed;
      this.#revision += 1;
      return placed === cursor.count
        ? null
        : { ...cursor, count: cursor.count - placed };
    }

    if (secondary) return cloneStack(cursor);
    const replaced: InventorySlotSnapshot = { ...slot };
    slot.item = cursor.item;
    slot.count = cursor.count;
    slot.durability = cursor.durability;
    this.#revision += 1;
    return replaced;
  }

  public fillFromRecipe(
    recipe: CraftingRecipe,
    inventory: PlayerInventory,
  ): boolean {
    if (!this.isEmpty || recipe.gridSize > this.#size) return false;
    const pattern = trimPattern(recipe);
    if (pattern === null) return false;
    if (!inventory.hasItems(recipe.ingredients)) return false;
    if (!inventory.consumeItems(recipe.ingredients)) return false;

    const offsetX = Math.floor((this.#size - pattern.width) / 2);
    const offsetY = Math.floor((this.#size - pattern.height) / 2);
    for (let row = 0; row < pattern.height; row += 1) {
      for (let column = 0; column < pattern.width; column += 1) {
        const item = pattern.cells[column + row * pattern.width] ?? null;
        if (item === null) continue;
        const index = column + offsetX + (row + offsetY) * this.#size;
        const slot = this.#slots[index];
        if (slot === undefined) continue;
        slot.item = item;
        slot.count = 1;
        slot.durability = getItemDefinition(item).maximumDurability;
      }
    }
    this.#revision += 1;
    return true;
  }

  public takeOutput(
    cursor: InventorySlotSnapshot | null,
    recipes: readonly CraftingRecipe[],
  ): CraftingTakeResult {
    const match = findCraftingMatch(this.#size, this.snapshot, recipes);
    if (match === null) return { cursor, recipe: null, crafted: false };
    const outputDefinition = getItemDefinition(match.recipe.output.item);
    if (
      cursor !== null &&
      (cursor.item !== match.recipe.output.item ||
        cursor.count + match.recipe.output.count > outputDefinition.maximumStack)
    ) {
      return { cursor, recipe: match.recipe, crafted: false };
    }

    for (const index of match.consumedSlots) {
      const slot = this.#slots[index];
      if (slot?.item === undefined || slot.item === null || slot.count <= 0) {
        return { cursor, recipe: match.recipe, crafted: false };
      }
      slot.count -= 1;
      if (slot.count <= 0) this.#clear(slot);
    }
    this.#revision += 1;
    const output: InventorySlotSnapshot = {
      item: match.recipe.output.item,
      count: match.recipe.output.count,
      durability: outputDefinition.maximumDurability,
    };
    return {
      cursor:
        cursor === null
          ? output
          : { ...cursor, count: cursor.count + output.count },
      recipe: match.recipe,
      crafted: true,
    };
  }

  public returnAll(inventory: PlayerInventory): boolean {
    let complete = true;
    for (const slot of this.#slots) {
      if (slot.item === null || slot.count <= 0) continue;
      const remaining = inventory.addStack({ ...slot });
      if (remaining === null) {
        this.#clear(slot);
      } else {
        slot.item = remaining.item;
        slot.count = remaining.count;
        slot.durability = remaining.durability;
        complete = false;
      }
    }
    this.#revision += 1;
    return complete;
  }

  public getMatch(recipes: readonly CraftingRecipe[]): CraftingMatch | null {
    return findCraftingMatch(this.#size, this.snapshot, recipes);
  }

  public get size(): 2 | 3 {
    return this.#size;
  }

  public get revision(): number {
    return this.#revision;
  }

  public get isEmpty(): boolean {
    return this.#slots.every((slot) => slot.item === null || slot.count <= 0);
  }

  public get snapshot(): readonly InventorySlotSnapshot[] {
    return this.#slots.map((slot) => ({ ...slot }));
  }

  #clear(slot: MutableCraftingSlot): void {
    slot.item = null;
    slot.count = 0;
    slot.durability = null;
  }
}
