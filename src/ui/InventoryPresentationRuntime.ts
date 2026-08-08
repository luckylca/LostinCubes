import { InventoryView } from './InventoryView';

const ARMOR = [
  ['head', 'item-iron-helmet', '头盔'],
  ['chest', 'item-iron-chestplate', '胸甲'],
  ['legs', 'item-iron-leggings', '护腿'],
  ['feet', 'item-iron-boots', '靴子'],
] as const;

let installed = false;

function getRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#inventory-screen');
}

function hasItem(root: HTMLElement, className: string): boolean {
  return (
    root.querySelector<HTMLElement>(
      `.inventory-storage .${className}, .inventory-hotbar .${className}`,
    ) !== null
  );
}

function syncEquipment(root: HTMLElement, panel: HTMLElement): void {
  const avatar = panel.querySelector<HTMLElement>('[data-player-preview]');
  if (avatar === null) return;
  for (const [role, className] of ARMOR) {
    const equipped = hasItem(root, className);
    const slot = panel.querySelector<HTMLElement>(
      `[data-equipment-role="${role}"]`,
    );
    avatar.classList.toggle(`wearing-${role}`, equipped);
    if (slot === null) continue;
    slot.classList.toggle('is-equipped', equipped);
    const icon = slot.querySelector<HTMLElement>('.equipment-icon');
    if (icon !== null) {
      const nextClass = `equipment-icon inventory-item ${equipped ? className : 'item-empty'}`;
      if (icon.className !== nextClass) icon.className = nextClass;
    }
  }
}

function ensureEquipmentPanel(root: HTMLElement): HTMLElement | null {
  const existing = root.querySelector<HTMLElement>('.player-equipment-panel');
  if (existing !== null) return existing;
  const layout = root.querySelector<HTMLElement>('.inventory-layout');
  if (layout === null) return null;

  const panel = document.createElement('section');
  panel.className = 'player-equipment-panel';
  panel.setAttribute('aria-label', '人物与装备');
  panel.innerHTML = [
    '<h3>人物 / 装备</h3>',
    '<div class="inventory-avatar" data-player-preview aria-label="玩家模型预览">',
    '<span class="avatar-head"></span><span class="avatar-body"></span>',
    '<span class="avatar-arm avatar-arm-l"></span><span class="avatar-arm avatar-arm-r"></span>',
    '<span class="avatar-leg avatar-leg-l"></span><span class="avatar-leg avatar-leg-r"></span>',
    '<span class="avatar-armor avatar-helmet"></span><span class="avatar-armor avatar-chest"></span>',
    '<span class="avatar-armor avatar-legs"></span><span class="avatar-armor avatar-boots"></span>',
    '</div>',
    '<div class="equipment-slots">',
    ...ARMOR.map(
      ([role, , label]) =>
        `<div class="equipment-slot" data-equipment-role="${role}" title="${label}"><span class="equipment-slot-label">${label}</span><span class="equipment-icon inventory-item item-empty"></span></div>`,
    ),
    '</div>',
    '<p class="equipment-help">当前护甲会映射到对应装备位并显示在人物身上。</p>',
  ].join('');
  layout.prepend(panel);
  return panel;
}

function ensureRecipeDrawer(root: HTMLElement): void {
  if (root.querySelector('.recipe-drawer') !== null) return;
  const book = root.querySelector<HTMLElement>('.crafting-book');
  const inventoryPanel = root.querySelector<HTMLElement>('.inventory-panel');
  if (book === null || inventoryPanel === null) return;

  const drawer = document.createElement('section');
  drawer.className = 'recipe-drawer';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'recipe-drawer-toggle';
  toggle.textContent = '配方书';
  toggle.setAttribute('aria-expanded', 'false');

  const content = document.createElement('div');
  content.className = 'recipe-drawer-content';
  content.hidden = true;

  toggle.addEventListener('click', () => {
    const nextOpen = content.hidden;
    content.hidden = !nextOpen;
    toggle.setAttribute('aria-expanded', String(nextOpen));
  });

  book.replaceWith(drawer);
  drawer.append(toggle, content);
  content.append(book);
  inventoryPanel.append(drawer);
}

function ensurePresentation(): void {
  const root = getRoot();
  if (root === null) return;
  const panel = ensureEquipmentPanel(root);
  ensureRecipeDrawer(root);
  if (panel !== null) syncEquipment(root, panel);
}

function syncPresentation(): void {
  const root = getRoot();
  const panel = root?.querySelector<HTMLElement>('.player-equipment-panel');
  if (root === null || panel === null) return;
  syncEquipment(root, panel);
}

/**
 * Hooks the inventory's own lifecycle instead of observing its DOM tree.
 * InventoryView already knows exactly when slots are rebuilt; piggybacking on
 * open/render avoids MutationObserver churn and keeps the recipe drawer stable
 * inside the scroll container.
 */
export function installInventoryPresentationRuntime(): void {
  if (installed) return;
  installed = true;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalOpen = InventoryView.prototype.open;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRender = InventoryView.prototype.render;

  InventoryView.prototype.open = function presentedOpen(station = 'inventory'): void {
    ensurePresentation();
    originalOpen.call(this, station);
    syncPresentation();
  };

  InventoryView.prototype.render = function presentedRender(): void {
    ensurePresentation();
    originalRender.call(this);
    syncPresentation();
  };
}
