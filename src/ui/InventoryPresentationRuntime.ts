const ARMOR = [
  ['head', 'item-iron-helmet', '头盔'],
  ['chest', 'item-iron-chestplate', '胸甲'],
  ['legs', 'item-iron-leggings', '护腿'],
  ['feet', 'item-iron-boots', '靴子'],
] as const;

let installed = false;

function hasItem(root: HTMLElement, className: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `.inventory-storage .${className}, .inventory-hotbar .${className}`,
  );
}

function syncEquipment(root: HTMLElement, panel: HTMLElement): void {
  const avatar = panel.querySelector<HTMLElement>('[data-player-preview]');
  if (avatar === null) return;
  for (const [role, className] of ARMOR) {
    const source = hasItem(root, className);
    const slot = panel.querySelector<HTMLElement>(`[data-equipment-role="${role}"]`);
    const equipped = source !== null;
    avatar.classList.toggle(`wearing-${role}`, equipped);
    if (slot === null) continue;
    slot.classList.toggle('is-equipped', equipped);
    const icon = slot.querySelector<HTMLElement>('.equipment-icon');
    if (icon !== null) {
      icon.className = `equipment-icon inventory-item ${equipped ? className : 'item-empty'}`;
    }
  }
}

function createEquipmentPanel(root: HTMLElement): HTMLElement {
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
      ([role, _className, label]) =>
        `<div class="equipment-slot" data-equipment-role="${role}" title="${label}"><span class="equipment-slot-label">${label}</span><span class="equipment-icon inventory-item item-empty"></span></div>`,
    ),
    '</div>',
    '<p class="equipment-help">当前护甲会映射到对应装备位并显示在人物身上。</p>',
  ].join('');
  const layout = root.querySelector<HTMLElement>('.inventory-layout');
  layout?.prepend(panel);
  return panel;
}

function tuckRecipeBook(root: HTMLElement): void {
  const book = root.querySelector<HTMLElement>('.crafting-book');
  if (book === null || book.closest('.recipe-drawer') !== null) return;
  const drawer = document.createElement('details');
  drawer.className = 'recipe-drawer';
  const summary = document.createElement('summary');
  summary.textContent = '配方书';
  drawer.append(summary);
  book.replaceWith(drawer);
  drawer.append(book);
  root.querySelector<HTMLElement>('.inventory-panel')?.append(drawer);
}

export function installInventoryPresentationRuntime(): void {
  if (installed) return;
  installed = true;
  const root = document.querySelector<HTMLElement>('#inventory-screen');
  if (root === null) return;
  const panel = createEquipmentPanel(root);
  tuckRecipeBook(root);
  const observer = new MutationObserver(() => syncEquipment(root, panel));
  // InventoryView replaces slot children whenever its revision changes. Watching
  // child nodes is enough; observing the classes we set ourselves can create a
  // MutationObserver feedback loop on some browsers.
  observer.observe(root, { subtree: true, childList: true });
  syncEquipment(root, panel);
}
