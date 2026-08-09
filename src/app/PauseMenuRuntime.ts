const HIDE_LOADING_KEY = 'lost-in-cubes:hide-runtime-loading';
const BLOCKED_WHILE_PAUSED = new Set([
  'KeyE',
  'KeyV',
  'F5',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
]);
let installed = false;
let pauseMenuOpen = false;
let root: HTMLElement | null = null;
let pointerWasLocked = false;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the setting for this page even when storage is unavailable.
  }
}

function canvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('#game-canvas');
}

function inventoryOpen(): boolean {
  return canvas()?.dataset.inventoryOpen === 'true';
}

function playerDead(): boolean {
  return canvas()?.dataset.playerHealth === '0';
}

function renderPause(open: boolean): void {
  pauseMenuOpen = open && !inventoryOpen() && !playerDead();
  const menu = createMenu();
  menu.hidden = !pauseMenuOpen;
  document.body.classList.toggle('pause-menu-open', pauseMenuOpen);
}

function requestGameplayResume(): void {
  if (!pauseMenuOpen) return;

  // LocalGameSession already owns pause state through InputManager. We deliberately
  // do not monkey-patch either class here. A synthetic Escape supplies the normal
  // pause-toggle pulse when the game was paused while already unlocked; when the
  // pause came from leaving pointer lock, InputManager's existing resume flag
  // supplies the pulse after pointer lock is reacquired.
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  document.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );

  renderPause(false);
  const gameCanvas = canvas();
  if (gameCanvas === null || typeof gameCanvas.requestPointerLock !== 'function') {
    return;
  }
  const request = gameCanvas.requestPointerLock();
  void Promise.resolve(request).catch(() => undefined);
}

function createMenu(): HTMLElement {
  if (root !== null) return root;

  const section = document.createElement('section');
  section.id = 'pause-screen';
  section.hidden = true;
  section.setAttribute('aria-label', '暂停菜单');
  section.innerHTML = [
    '<div class="pause-panel">',
    '<p class="pause-eyebrow">GAME MENU</p>',
    '<h2>游戏已暂停</h2>',
    '<button type="button" class="pause-primary" data-pause-resume>继续游戏</button>',
    '<details class="pause-settings">',
    '<summary>设置</summary>',
    '<label><span>显示区块等待提示</span><input type="checkbox" data-runtime-loading /></label>',
    '<small>0.4.8 暂不恢复动态渲染质量切换，避免重新改动 Babylon Engine 和 RenderLoop。画面设置会在独立性能测试后再加入。</small>',
    '</details>',
    '<button type="button" class="pause-secondary" data-pause-exit>返回世界列表</button>',
    '<p class="pause-hint">Esc 继续 · E 背包</p>',
    '</div>',
  ].join('');
  document.querySelector('#app')?.append(section);

  const loading = section.querySelector<HTMLInputElement>('[data-runtime-loading]');
  const showRuntimeLoading = storageGet(HIDE_LOADING_KEY) !== '1';
  if (loading !== null) loading.checked = showRuntimeLoading;
  document.body.classList.toggle('hide-runtime-wait', !showRuntimeLoading);
  loading?.addEventListener('change', () => {
    const show = loading.checked;
    storageSet(HIDE_LOADING_KEY, show ? '0' : '1');
    document.body.classList.toggle('hide-runtime-wait', !show);
  });

  section
    .querySelector<HTMLButtonElement>('[data-pause-resume]')
    ?.addEventListener('click', requestGameplayResume);
  section
    .querySelector<HTMLButtonElement>('[data-pause-exit]')
    ?.addEventListener('click', () => {
      window.location.reload();
    });

  root = section;
  return section;
}

export function installPauseMenuRuntime(): void {
  if (installed) return;
  installed = true;
  createMenu();
  pointerWasLocked = document.pointerLockElement === canvas();

  document.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.repeat) return;

    if (pauseMenuOpen && BLOCKED_WHILE_PAUSED.has(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.code !== 'Escape' || inventoryOpen() || playerDead()) return;
    // When pointer lock is active the browser normally unlocks it first; the
    // pointerlockchange handler below opens the menu. This branch covers the
    // fallback/unlocked case without touching InputManager internals.
    if (document.pointerLockElement === canvas()) return;
    queueMicrotask(() => renderPause(!pauseMenuOpen));
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas();
    if (pointerWasLocked && !locked && !inventoryOpen() && !playerDead()) {
      renderPause(true);
    } else if (locked) {
      renderPause(false);
    }
    pointerWasLocked = locked;
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-action="toggle-pause"]') === null) return;
    if (inventoryOpen() || playerDead()) return;
    queueMicrotask(() => renderPause(!pauseMenuOpen));
  });

  const gameCanvas = canvas();
  if (gameCanvas !== null) {
    const observer = new MutationObserver(() => {
      if (inventoryOpen() || playerDead()) renderPause(false);
    });
    observer.observe(gameCanvas, {
      attributes: true,
      attributeFilter: ['data-inventory-open', 'data-player-health'],
    });
  }
}
