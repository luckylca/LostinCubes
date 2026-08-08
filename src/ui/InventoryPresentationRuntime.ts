const ARMOR = [
  ['head', 'item-iron-helmet'],
  ['chest', 'item-iron-chestplate'],
  ['legs', 'item-iron-leggings'],
  ['feet', 'item-iron-boots'],
] as const;

let installed = false;

function hasItem(root: HTMLElement, className: string): boolean {
  return (
    root.querySelector<HTMLElement>(
      `.inventory-storage .${className}, .inventory-hotbar .${className}`,
    ) !== null
  );
}

function syncEquipment(root: HTMLElement): void {
  const avatar = root.querySelector<HTMLElement>('[data-player-preview]');
  if (avatar === null) return;

  for (const [role, className] of ARMOR) {
    const equipped = hasItem(root, className);
    const slot = root.querySelector<HTMLElement>(
      `[data-equipment-role="${role}"]`,
    );
    avatar.classList.toggle(`wearing-${role}`, equipped);
    if (slot === null) continue;

    slot.classList.toggle('is-equipped', equipped);
    const icon = slot.querySelector<HTMLElement>('.equipment-icon');
    if (icon !== null) {
      icon.className = `equipment-icon inventory-item ${equipped ? className : 'item-empty'}`;
    }
  }
}

/**
 * Wires presentation-only behavior onto markup that already exists in index.html.
 * No InventoryView prototype patching and no DOM relocation are used here: the
 * inventory owns its recipe-list node for its whole lifetime, while this helper
 * only controls visibility and mirrors armor state for the player preview.
 */
export function installInventoryPresentationRuntime(): void {
  if (installed) return;
  installed = true;

  const root = document.querySelector<HTMLElement>('#inventory-screen');
  const toggle = root?.querySelector<HTMLButtonElement>('.recipe-drawer-toggle');
  const content = root?.querySelector<HTMLElement>('.recipe-drawer-content');
  if (root === null || toggle === null || toggle === undefined || content === null || content === undefined) {
    return;
  }

  let recipeOpen = false;

  const applyRecipeState = (): void => {
    const furnaceOpen = root.dataset.station === 'furnace';
    toggle.hidden = furnaceOpen;
    content.hidden = furnaceOpen ? false : !recipeOpen;
    toggle.setAttribute('aria-expanded', String(furnaceOpen || recipeOpen));
  };

  toggle.addEventListener('click', () => {
    recipeOpen = !recipeOpen;
    applyRecipeState();
  });

  const sync = (): void => {
    syncEquipment(root);
    applyRecipeState();
  };

  const storage = root.querySelector<HTMLElement>('[data-inventory-storage]');
  const hotbar = root.querySelector<HTMLElement>('[data-inventory-hotbar]');
  const slotObserver = new MutationObserver(sync);
  if (storage !== null) slotObserver.observe(storage, { childList: true });
  if (hotbar !== null) slotObserver.observe(hotbar, { childList: true });

  const stateObserver = new MutationObserver(sync);
  stateObserver.observe(root, {
    attributes: true,
    attributeFilter: ['hidden', 'data-station'],
  });

  sync();
}
