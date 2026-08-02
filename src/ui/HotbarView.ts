import {
  getItemDefinition,
  getItemLabel,
} from '../inventory/ItemDefinitions';
import type { PlayerInventorySnapshot } from '../inventory/PlayerInventory';
import { HOTBAR_SLOT_COUNT } from '../inventory/PlayerInventory';

export class HotbarView {
  readonly #root: HTMLElement;
  readonly #buttons: HTMLButtonElement[] = [];
  readonly #onSelect: (slot: number) => void;

  public constructor(root: HTMLElement, onSelect: (slot: number) => void) {
    this.#root = root;
    this.#onSelect = onSelect;
    this.#root.replaceChildren();

    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotbar-slot';
      button.dataset.slot = String(slot);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#onSelect(slot);
      });
      button.innerHTML = [
        `<span class="hotbar-key">${String(slot + 1)}</span>`,
        '<span class="hotbar-item" aria-hidden="true"></span>',
        '<span class="hotbar-count"></span>',
        '<span class="hotbar-durability" aria-hidden="true"><span></span></span>',
      ].join('');
      this.#root.append(button);
      this.#buttons.push(button);
    }
  }

  public render(snapshot: PlayerInventorySnapshot): void {
    for (let slotIndex = 0; slotIndex < HOTBAR_SLOT_COUNT; slotIndex += 1) {
      const button = this.#buttons[slotIndex];
      const slot = snapshot.slots[slotIndex];
      if (button === undefined || slot === undefined) {
        continue;
      }

      const selected = slotIndex === snapshot.selectedSlot;
      const definition =
        slot.item === null ? null : getItemDefinition(slot.item);
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-tool', definition?.kind === 'tool');
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${String(slotIndex + 1)}：${getItemLabel(slot.item)}${
          definition?.kind === 'block' ? ` × ${String(slot.count)}` : ''
        }${
          definition?.kind === 'tool' && slot.durability !== null
            ? `，耐久 ${String(slot.durability)}/${String(definition.maximumDurability ?? 1)}`
            : ''
        }`,
      );

      const itemElement = button.querySelector<HTMLElement>('.hotbar-item');
      const countElement = button.querySelector<HTMLElement>('.hotbar-count');
      const durabilityElement =
        button.querySelector<HTMLElement>('.hotbar-durability');
      const durabilityFill =
        durabilityElement?.querySelector<HTMLElement>('span') ?? null;

      if (itemElement !== null) {
        itemElement.className = `hotbar-item item-${definition?.cssClass ?? 'empty'}`;
      }
      if (countElement !== null) {
        countElement.textContent =
          definition?.kind === 'block' ? String(slot.count) : '';
      }
      if (durabilityElement !== null) {
        durabilityElement.hidden = definition?.kind !== 'tool';
      }
      if (
        durabilityFill !== null &&
        definition?.kind === 'tool' &&
        slot.durability !== null
      ) {
        const maximum = definition.maximumDurability ?? 1;
        durabilityFill.style.scale = `${String(slot.durability / maximum)} 1`;
      }
    }
  }

  public dispose(): void {
    this.#root.replaceChildren();
    this.#buttons.length = 0;
  }
}
