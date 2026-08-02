import {
  getVisibleRecipes,
} from '../crafting/CraftingRecipes';
import type { CraftingRecipe } from '../crafting/CraftingRecipes';
import {
  getItemDefinition,
  getItemLabel,
} from '../inventory/ItemDefinitions';
import type { ItemType } from '../inventory/ItemDefinitions';
import {
  HOTBAR_START_INDEX,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  STORAGE_SLOT_COUNT,
} from '../inventory/PlayerInventory';
import type {
  InventorySlotSnapshot,
  PlayerInventory,
} from '../inventory/PlayerInventory';

export interface InventoryViewCallbacks {
  readonly onChanged: () => void;
  readonly onClose: () => void;
  readonly onCrafted: (recipe: CraftingRecipe) => void;
}

function createEmptyStack(): InventorySlotSnapshot {
  return { item: null, count: 0, durability: null };
}

function createOutputStack(recipe: CraftingRecipe): InventorySlotSnapshot {
  const definition = getItemDefinition(recipe.output.item);
  return {
    item: recipe.output.item,
    count: recipe.output.count,
    durability: definition.maximumDurability,
  };
}

function stackDescription(stack: InventorySlotSnapshot): string {
  if (stack.item === null) {
    return '空槽';
  }
  const definition = getItemDefinition(stack.item);
  if (definition.kind === 'tool') {
    return `${definition.label}，耐久 ${String(stack.durability ?? 0)}/${String(
      definition.maximumDurability ?? 1,
    )}`;
  }
  return `${definition.label} × ${String(stack.count)}`;
}

function setItemPresentation(
  button: HTMLButtonElement,
  stack: InventorySlotSnapshot,
): void {
  const itemElement = button.querySelector<HTMLElement>('.inventory-item');
  const countElement = button.querySelector<HTMLElement>('.inventory-count');
  const durabilityElement =
    button.querySelector<HTMLElement>('.inventory-durability');
  const durabilityFill =
    durabilityElement?.querySelector<HTMLElement>('span') ?? null;
  const definition =
    stack.item === null ? null : getItemDefinition(stack.item);

  button.classList.toggle('is-empty', definition === null);
  button.classList.toggle('is-tool', definition?.kind === 'tool');
  button.setAttribute('aria-label', stackDescription(stack));
  if (itemElement !== null) {
    itemElement.className = `inventory-item item-${definition?.cssClass ?? 'empty'}`;
  }
  if (countElement !== null) {
    countElement.textContent =
      definition !== null && definition.kind !== 'tool'
        ? String(stack.count)
        : '';
  }
  if (durabilityElement !== null) {
    durabilityElement.hidden = definition?.kind !== 'tool';
  }
  if (
    durabilityFill !== null &&
    definition?.kind === 'tool' &&
    stack.durability !== null
  ) {
    durabilityFill.style.scale = `${String(
      stack.durability / (definition.maximumDurability ?? 1),
    )} 1`;
  }
}

function createSlotButton(
  index: number,
  stack: InventorySlotSnapshot,
  onInteract: (index: number, secondary: boolean) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inventory-slot';
  button.dataset.inventoryIndex = String(index);
  button.innerHTML = [
    '<span class="inventory-item" aria-hidden="true"></span>',
    '<span class="inventory-count"></span>',
    '<span class="inventory-durability" aria-hidden="true"><span></span></span>',
  ].join('');
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onInteract(index, event.button === 2);
  });
  setItemPresentation(button, stack);
  return button;
}

export class InventoryView {
  readonly #root: HTMLElement;
  readonly #inventory: PlayerInventory;
  readonly #callbacks: InventoryViewCallbacks;
  readonly #title: HTMLElement;
  readonly #message: HTMLElement;
  readonly #storage: HTMLElement;
  readonly #hotbar: HTMLElement;
  readonly #recipes: HTMLElement;
  readonly #cursor: HTMLElement;
  #cursorStack: InventorySlotSnapshot | null = null;
  #usingCraftingTable = false;
  #open = false;

  public constructor(
    root: HTMLElement,
    inventory: PlayerInventory,
    callbacks: InventoryViewCallbacks,
  ) {
    this.#root = root;
    this.#inventory = inventory;
    this.#callbacks = callbacks;
    this.#title = this.#requireChild('[data-inventory-title]');
    this.#message = this.#requireChild('[data-inventory-message]');
    this.#storage = this.#requireChild('[data-inventory-storage]');
    this.#hotbar = this.#requireChild('[data-inventory-hotbar]');
    this.#recipes = this.#requireChild('[data-crafting-recipes]');
    this.#cursor = this.#requireChild('[data-inventory-cursor]');

    this.#root.addEventListener('contextmenu', (event) => event.preventDefault());
    this.#root.addEventListener('pointermove', (event) => {
      this.#cursor.style.transform = `translate(${String(event.clientX + 14)}px, ${String(
        event.clientY + 14,
      )}px)`;
    });
    this.#root
      .querySelector<HTMLElement>('[data-inventory-close]')
      ?.addEventListener('click', () => this.close());
  }

  public open(usingCraftingTable: boolean): void {
    this.#usingCraftingTable = usingCraftingTable;
    this.#open = true;
    this.#root.hidden = false;
    document.body.classList.add('inventory-open');
    this.#message.textContent = usingCraftingTable
      ? '工作台配方已解锁。左键整组，右键半组或单个。'
      : '随身合成可制作木板、木棍和工作台。';
    this.render();
  }

  public close(): boolean {
    if (!this.#open) {
      return true;
    }
    if (!this.#returnCursorToInventory()) {
      this.#message.textContent = '背包没有空间，请先把手中的物品放入一个槽位。';
      return false;
    }
    this.#open = false;
    this.#root.hidden = true;
    document.body.classList.remove('inventory-open');
    this.#callbacks.onChanged();
    this.#callbacks.onClose();
    return true;
  }

  public toggle(): void {
    if (this.#open) {
      this.close();
    } else {
      this.open(false);
    }
  }

  public render(): void {
    if (!this.#open) {
      return;
    }
    const snapshot = this.#inventory.snapshot;
    this.#title.textContent = this.#usingCraftingTable ? '工作台' : '背包与合成';
    this.#storage.replaceChildren();
    this.#hotbar.replaceChildren();

    for (let index = 0; index < STORAGE_SLOT_COUNT; index += 1) {
      this.#storage.append(
        createSlotButton(
          index,
          snapshot.slots[index] ?? createEmptyStack(),
          this.#interactSlot,
        ),
      );
    }
    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      const index = HOTBAR_START_INDEX + slot;
      const button = createSlotButton(
        index,
        snapshot.slots[index] ?? createEmptyStack(),
        this.#interactSlot,
      );
      button.dataset.hotbarNumber = String(slot + 1);
      if (slot === snapshot.selectedSlot) {
        button.classList.add('is-selected');
      }
      this.#hotbar.append(button);
    }

    this.#renderRecipes();
    this.#renderCursor();
  }

  public get isOpen(): boolean {
    return this.#open;
  }

  public dispose(): void {
    this.#returnCursorToInventory();
    document.body.classList.remove('inventory-open');
    this.#root.hidden = true;
    this.#storage.replaceChildren();
    this.#hotbar.replaceChildren();
    this.#recipes.replaceChildren();
  }

  readonly #interactSlot = (index: number, secondary: boolean): void => {
    this.#cursorStack = this.#inventory.interactSlot(
      index,
      this.#cursorStack,
      secondary,
    );
    this.#message.textContent =
      this.#cursorStack === null
        ? '物品已放入背包。'
        : `手持：${stackDescription(this.#cursorStack)}`;
    this.#callbacks.onChanged();
    this.render();
  };

  #renderRecipes(): void {
    this.#recipes.replaceChildren();
    for (const recipe of getVisibleRecipes(this.#usingCraftingTable)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-card';
      const craftable =
        this.#inventory.hasItems(recipe.ingredients) &&
        this.#cursorCanAccept(recipe);
      button.disabled = !craftable;
      button.innerHTML = [
        `<strong>${recipe.label}</strong>`,
        `<span>${recipe.description}</span>`,
        `<small>${recipe.ingredients
          .map(
            (ingredient) =>
              `${getItemLabel(ingredient.item)} ×${String(ingredient.count)}`,
          )
          .join(' · ')}</small>`,
      ].join('');
      button.addEventListener('click', () => this.#craft(recipe));
      this.#recipes.append(button);
    }
  }

  #craft(recipe: CraftingRecipe): void {
    if (
      !this.#inventory.hasItems(recipe.ingredients) ||
      !this.#cursorCanAccept(recipe)
    ) {
      return;
    }
    if (!this.#inventory.consumeItems(recipe.ingredients)) {
      return;
    }

    const output = createOutputStack(recipe);
    if (this.#cursorStack === null) {
      this.#cursorStack = output;
    } else {
      this.#cursorStack = {
        ...this.#cursorStack,
        count: this.#cursorStack.count + output.count,
      };
    }
    this.#message.textContent = `已制作：${recipe.label}`;
    this.#callbacks.onChanged();
    this.#callbacks.onCrafted(recipe);
    this.render();
  }

  #cursorCanAccept(recipe: CraftingRecipe): boolean {
    if (this.#cursorStack === null) {
      return true;
    }
    if (this.#cursorStack.item !== recipe.output.item) {
      return false;
    }
    const maximum = getItemDefinition(recipe.output.item).maximumStack;
    return this.#cursorStack.count + recipe.output.count <= maximum;
  }

  #returnCursorToInventory(): boolean {
    if (this.#cursorStack === null) {
      return true;
    }

    const snapshot = this.#inventory.snapshot;
    const matching: number[] = [];
    const empty: number[] = [];
    for (let index = 0; index < INVENTORY_SLOT_COUNT; index += 1) {
      const slot = snapshot.slots[index];
      if (slot?.item === this.#cursorStack.item) {
        matching.push(index);
      } else if (slot?.item === null) {
        empty.push(index);
      }
    }
    for (const index of [...matching, ...empty]) {
      this.#cursorStack = this.#inventory.interactSlot(
        index,
        this.#cursorStack,
        false,
      );
      if (this.#cursorStack === null) {
        this.#renderCursor();
        return true;
      }
    }
    return false;
  }

  #renderCursor(): void {
    if (this.#cursorStack === null || this.#cursorStack.item === null) {
      this.#cursor.hidden = true;
      this.#cursor.replaceChildren();
      return;
    }
    const definition = getItemDefinition(this.#cursorStack.item as ItemType);
    this.#cursor.hidden = false;
    this.#cursor.innerHTML = [
      `<span class="inventory-item item-${definition.cssClass}"></span>`,
      definition.kind === 'tool'
        ? ''
        : `<strong>${String(this.#cursorStack.count)}</strong>`,
    ].join('');
  }

  #requireChild(selector: string): HTMLElement {
    const child = this.#root.querySelector<HTMLElement>(selector);
    if (child === null) {
      throw new Error(`Inventory UI child not found: ${selector}`);
    }
    return child;
  }
}
