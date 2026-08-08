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
 * The recipe drawer is a native <details> element. The browser owns normal
 * open/close interaction; this runtime only forces it open while the furnace
 * UI occupies the recipe area and mirrors armor state onto the player preview.
 */
export function installInventoryPresentationRuntime(): void {
  if (installed) return;
  installed = true;

  const root = document.querySelector<HTMLElement>('#inventory-screen');
  if (root === null) return;

  const drawer = root.querySelector<HTMLDetailsElement>('.recipe-drawer');
  const summary = drawer?.querySelector<HTMLElement>('.recipe-drawer-toggle');
  if (drawer === null || summary === null || summary === undefined) return;

  let furnaceWasOpen = false;
  let openBeforeFurnace = drawer.open;

  const mirrorExpandedState = (): void => {
    summary.setAttribute('aria-expanded', String(drawer.open));
  };

  const syncDrawer = (): void => {
    const furnaceOpen = root.dataset.station === 'furnace';
    if (furnaceOpen && !furnaceWasOpen) {
      openBeforeFurnace = drawer.open;
      drawer.open = true;
    } else if (!furnaceOpen && furnaceWasOpen) {
      drawer.open = openBeforeFurnace;
    }
    furnaceWasOpen = furnaceOpen;
    drawer.classList.toggle('is-furnace', furnaceOpen);
    mirrorExpandedState();
  };

  drawer.addEventListener('toggle', mirrorExpandedState);

  const sync = (): void => {
    syncEquipment(root);
    syncDrawer();
  };

  const storage = root.querySelector<HTMLElement>('[data-inventory-storage]');
  const hotbar = root.querySelector<HTMLElement>('[data-inventory-hotbar]');
  const slotObserver = new MutationObserver(() => syncEquipment(root));
  if (storage !== null) slotObserver.observe(storage, { childList: true });
  if (hotbar !== null) slotObserver.observe(hotbar, { childList: true });

  const stateObserver = new MutationObserver(sync);
  stateObserver.observe(root, {
    attributes: true,
    attributeFilter: ['hidden', 'data-station'],
  });

  sync();
}
