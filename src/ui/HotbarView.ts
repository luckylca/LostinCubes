import type { PlayerInventorySnapshot } from '../inventory/PlayerInventory';
import { HOTBAR_SLOT_COUNT } from '../inventory/PlayerInventory';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

function getBlockLabel(block: BlockTypeValue | null): string {
  switch (block) {
    case BlockType.Grass:
      return '草方块';
    case BlockType.Dirt:
      return '泥土';
    case BlockType.Stone:
      return '石头';
    case BlockType.RuneStone:
      return '符文石';
    case BlockType.Air:
    case null:
      return '空';
  }
}

function getBlockClass(block: BlockTypeValue | null): string {
  switch (block) {
    case BlockType.Grass:
      return 'grass';
    case BlockType.Dirt:
      return 'dirt';
    case BlockType.Stone:
      return 'stone';
    case BlockType.RuneStone:
      return 'rune';
    case BlockType.Air:
    case null:
      return 'empty';
  }
}

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
        '<span class="hotbar-block" aria-hidden="true"></span>',
        '<span class="hotbar-count"></span>',
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
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${String(slotIndex + 1)}：${getBlockLabel(slot.block)}${
          slot.block === null ? '' : ` × ${String(slot.count)}`
        }`,
      );

      const blockElement = button.querySelector<HTMLElement>('.hotbar-block');
      const countElement = button.querySelector<HTMLElement>('.hotbar-count');
      if (blockElement !== null) {
        blockElement.className = `hotbar-block block-${getBlockClass(slot.block)}`;
      }
      if (countElement !== null) {
        countElement.textContent = slot.block === null ? '' : String(slot.count);
      }
    }
  }

  public dispose(): void {
    this.#root.replaceChildren();
    this.#buttons.length = 0;
  }
}
