import type { FurnaceViewState } from '../crafting/FurnaceManager';
import { getVisibleRecipes } from '../crafting/CraftingRecipes';
import type {
  CraftingRecipe,
  CraftingStation,
} from '../crafting/CraftingRecipes';
import {
  getItemDefinition,
  getItemLabel,
  ItemType,
} from '../inventory/ItemDefinitions';
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
  readonly getFurnaceState?: () => FurnaceViewState | null;
  readonly onFurnaceInsertInput?: () => number;
  readonly onFurnaceInsertFuel?: () => number;
  readonly onFurnaceTakeOutput?: () => number;
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
  if (stack.item === null) return '空槽';
  const definition = getItemDefinition(stack.item);
  if (definition.kind === 'tool') {
    return `${definition.label}，耐久 ${String(stack.durability ?? 0)}/${String(
      definition.maximumDurability ?? 1,
    )}`;
  }
  return `${definition.label} × ${String(stack.count)}`;
}

function itemIconMarkup(item: ItemType | null): string {
  if (item === null) return '<span class="recipe-cell is-empty"></span>';
  const definition = getItemDefinition(item);
  return `<span class="recipe-cell" title="${definition.label}"><span class="inventory-item item-${definition.cssClass}" aria-hidden="true"></span></span>`;
}

function recipePatternMarkup(recipe: CraftingRecipe): string {
  const cells: string[] = [];
  for (let row = 0; row < recipe.gridSize; row += 1) {
    for (let column = 0; column < recipe.gridSize; column += 1) {
      cells.push(itemIconMarkup(recipe.pattern[row]?.[column] ?? null));
    }
  }
  const output = getItemDefinition(recipe.output.item);
  return [
    `<span class="recipe-pattern recipe-grid-${String(recipe.gridSize)}" aria-label="${String(recipe.gridSize)}乘${String(recipe.gridSize)}配方">`,
    ...cells,
    '</span>',
    '<span class="recipe-arrow" aria-hidden="true">→</span>',
    `<span class="recipe-result"><span class="inventory-item item-${output.cssClass}" aria-hidden="true"></span><strong>${recipe.output.count > 1 ? `×${String(recipe.output.count)}` : ''}</strong></span>`,
  ].join('');
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
    if (
      event.pointerType === 'mouse' &&
      event.button !== 0 &&
      event.button !== 2
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onInteract(index, event.button === 2);
  });
  setItemPresentation(button, stack);
  return button;
}

function stationTitle(station: CraftingStation): string {
  return station === 'crafting-table'
    ? '工作台 · 3×3 合成'
    : station === 'furnace'
      ? '熔炉 · 冶炼'
      : '背包 · 2×2 随身合成';
}

function percentage(value: number): string {
  return `${String(Math.round(Math.min(Math.max(value, 0), 1) * 100))}%`;
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
  #station: CraftingStation = 'inventory';
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
    this.#root.addEventListener('contextmenu', (event) =>
      event.preventDefault(),
    );
    this.#root.addEventListener('pointermove', (event) => {
      this.#cursor.style.transform = `translate(${String(
        event.clientX + 14,
      )}px, ${String(event.clientY + 14)}px)`;
    });
    this.#root
      .querySelector<HTMLElement>('[data-inventory-close]')
      ?.addEventListener('click', () => this.close());
  }

  public open(station: CraftingStation = 'inventory'): void {
    this.#station = station;
    this.#open = true;
    this.#root.hidden = false;
    this.#root.dataset.station = station;
    document.body.classList.add('inventory-open');
    this.#message.textContent =
      station === 'crafting-table'
        ? '这是放置在世界中的工作台：使用 3×3 配方制作工具和熔炉。'
        : station === 'furnace'
          ? '像经典熔炉一样：上格放粗铁、下格放煤炭、右格取铁锭；关闭界面后继续燃烧。'
          : '这是随身 2×2 合成：先把原木做成木板，再用四块木板制作工作台。';
    this.render();
  }

  public close(): boolean {
    if (!this.#open) return true;
    if (!this.#returnCursorToInventory()) {
      this.#message.textContent =
        '背包没有空间，请先把手中的物品放入一个槽位。';
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
    if (this.#open) this.close();
    else this.open('inventory');
  }

  public render(): void {
    if (!this.#open) return;
    const snapshot = this.#inventory.snapshot;
    this.#title.textContent = stationTitle(this.#station);
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
      if (slot === snapshot.selectedSlot) button.classList.add('is-selected');
      this.#hotbar.append(button);
    }
    this.#renderRecipes();
    this.#renderCursor();
  }

  public refreshFurnace(): void {
    if (!this.#open || this.#station !== 'furnace') return;
    this.#renderFurnace();
  }

  public get isOpen(): boolean {
    return this.#open;
  }

  public get station(): CraftingStation {
    return this.#station;
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
    if (this.#station === 'furnace') {
      this.#renderFurnace();
      return;
    }
    this.#recipes.replaceChildren();
    for (const recipe of getVisibleRecipes(this.#station)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-card';
      button.dataset.recipeId = recipe.id;
      button.dataset.gridSize = String(recipe.gridSize);
      const craftable =
        this.#inventory.hasItems(recipe.ingredients) &&
        this.#cursorCanAccept(recipe);
      button.disabled = !craftable;
      button.innerHTML = [
        '<span class="recipe-copy">',
        `<strong>${recipe.label}</strong>`,
        `<span>${recipe.description}</span>`,
        `<small>${recipe.ingredients
          .map(
            (ingredient) =>
              `${getItemLabel(ingredient.item)} ×${String(ingredient.count)}`,
          )
          .join(' · ')}</small>`,
        '</span>',
        `<span class="recipe-shape">${recipePatternMarkup(recipe)}</span>`,
      ].join('');
      button.addEventListener('click', () => this.#craft(recipe));
      this.#recipes.append(button);
    }
  }

  #renderFurnace(): void {
    this.#recipes.replaceChildren();
    const state = this.#callbacks.getFurnaceState?.() ?? null;
    if (state === null) {
      const unavailable = document.createElement('p');
      unavailable.className = 'furnace-unavailable';
      unavailable.textContent = '当前熔炉状态不可用。';
      this.#recipes.append(unavailable);
      return;
    }

    const panel = document.createElement('section');
    panel.className = 'furnace-panel';
    panel.dataset.furnaceActive = String(state.active);
    panel.innerHTML = [
      '<div class="furnace-machine">',
      '<div class="furnace-column">',
      `<button type="button" class="furnace-slot" data-furnace-add-input><span class="inventory-item item-raw-iron"></span><strong>${String(state.inputCount)}</strong><small>上：粗铁</small></button>`,
      '<span class="furnace-flame" aria-hidden="true">♨</span>',
      `<button type="button" class="furnace-slot" data-furnace-add-fuel><span class="inventory-item item-coal"></span><strong>${String(state.fuelCount)}</strong><small>下：煤炭</small></button>`,
      '</div>',
      '<span class="furnace-arrow furnace-process-arrow" aria-hidden="true">→</span>',
      `<button type="button" class="furnace-slot furnace-output" data-furnace-take-output><span class="inventory-item item-iron-ingot"></span><strong>${String(state.outputCount)}</strong><small>右：铁锭</small></button>`,
      '</div>',
      '<div class="furnace-meter-row"><span>燃料燃烧</span><div class="furnace-meter"><span data-furnace-burn></span></div><strong data-furnace-burn-label></strong></div>',
      '<div class="furnace-meter-row"><span>铁锭进度</span><div class="furnace-meter"><span data-furnace-smelt></span></div><strong data-furnace-smelt-label></strong></div>',
      '<p class="furnace-hint">1 个煤炭燃烧 12 秒；1 个铁锭需要 4 秒。关闭熔炉界面后世界继续运行。</p>',
    ].join('');

    const burnFill = panel.querySelector<HTMLElement>('[data-furnace-burn]');
    const smeltFill = panel.querySelector<HTMLElement>('[data-furnace-smelt]');
    if (burnFill !== null) burnFill.style.scale = `${String(state.burnProgress)} 1`;
    if (smeltFill !== null) smeltFill.style.scale = `${String(state.smeltProgress)} 1`;
    const burnLabel = panel.querySelector<HTMLElement>('[data-furnace-burn-label]');
    const smeltLabel = panel.querySelector<HTMLElement>('[data-furnace-smelt-label]');
    if (burnLabel !== null) burnLabel.textContent = percentage(state.burnProgress);
    if (smeltLabel !== null) smeltLabel.textContent = percentage(state.smeltProgress);

    const inputButton = panel.querySelector<HTMLButtonElement>('[data-furnace-add-input]');
    const fuelButton = panel.querySelector<HTMLButtonElement>('[data-furnace-add-fuel]');
    const outputButton = panel.querySelector<HTMLButtonElement>('[data-furnace-take-output]');
    if (inputButton !== null) {
      inputButton.disabled =
        state.inputCount >= 64 || this.#inventory.countItem(ItemType.RawIron) <= 0;
      inputButton.addEventListener('click', () => {
        const inserted = this.#callbacks.onFurnaceInsertInput?.() ?? 0;
        this.#message.textContent =
          inserted > 0 ? `已装入粗铁 ×${String(inserted)}` : '背包里没有粗铁。';
        this.#callbacks.onChanged();
        this.render();
      });
    }
    if (fuelButton !== null) {
      fuelButton.disabled =
        state.fuelCount >= 64 || this.#inventory.countItem(ItemType.Coal) <= 0;
      fuelButton.addEventListener('click', () => {
        const inserted = this.#callbacks.onFurnaceInsertFuel?.() ?? 0;
        this.#message.textContent =
          inserted > 0 ? `已装入煤炭 ×${String(inserted)}` : '背包里没有煤炭。';
        this.#callbacks.onChanged();
        this.render();
      });
    }
    if (outputButton !== null) {
      outputButton.disabled = state.outputCount <= 0;
      outputButton.addEventListener('click', () => {
        const taken = this.#callbacks.onFurnaceTakeOutput?.() ?? 0;
        this.#message.textContent =
          taken > 0 ? `已取出铁锭 ×${String(taken)}` : '背包没有空间或还没有铁锭。';
        this.#callbacks.onChanged();
        this.render();
      });
    }
    this.#recipes.append(panel);
  }

  #craft(recipe: CraftingRecipe): void {
    if (
      !this.#inventory.hasItems(recipe.ingredients) ||
      !this.#cursorCanAccept(recipe)
    ) {
      return;
    }
    if (!this.#inventory.consumeItems(recipe.ingredients)) return;
    const output = createOutputStack(recipe);
    this.#cursorStack =
      this.#cursorStack === null
        ? output
        : { ...this.#cursorStack, count: this.#cursorStack.count + output.count };
    this.#message.textContent = `已制作：${recipe.label}`;
    this.#callbacks.onChanged();
    this.#callbacks.onCrafted(recipe);
    this.render();
  }

  #cursorCanAccept(recipe: CraftingRecipe): boolean {
    if (this.#cursorStack === null) return true;
    if (this.#cursorStack.item !== recipe.output.item) return false;
    return (
      this.#cursorStack.count + recipe.output.count <=
      getItemDefinition(recipe.output.item).maximumStack
    );
  }

  #returnCursorToInventory(): boolean {
    if (this.#cursorStack === null) return true;
    const snapshot = this.#inventory.snapshot;
    const matching: number[] = [];
    const empty: number[] = [];
    for (let index = 0; index < INVENTORY_SLOT_COUNT; index += 1) {
      const slot = snapshot.slots[index];
      if (slot?.item === this.#cursorStack.item) matching.push(index);
      else if (slot?.item === null) empty.push(index);
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
    const definition = getItemDefinition(this.#cursorStack.item);
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
