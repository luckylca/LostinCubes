import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';
import { LocalGameSession } from '../game/session/LocalGameSession';
import { InputManager } from '../input/InputManager';

const QUALITY_KEY = 'lost-in-cubes:render-quality';
const HIDE_LOADING_KEY = 'lost-in-cubes:hide-runtime-loading';
let installed = false;
let resumeRequested = false;
let root: HTMLElement | null = null;

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
    // Settings remain valid for the current session when storage is blocked.
  }
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
    '<label><span>渲染质量</span><select data-render-quality><option value="high">高 · 原始清晰度</option><option value="balanced">均衡</option><option value="performance">性能优先</option></select></label>',
    '<label><span>区块等待提示</span><input type="checkbox" data-runtime-loading /></label>',
    '<small>性能优先只降低 3D 内部渲染分辨率，不改变世界模拟、区块数量和 UI 清晰度。</small>',
    '</details>',
    '<button type="button" class="pause-secondary" data-pause-exit>保存并返回世界列表</button>',
    '<p class="pause-hint">Esc 继续 · E 打开背包</p>',
    '</div>',
  ].join('');
  document.querySelector('#app')?.append(section);

  const quality = section.querySelector<HTMLSelectElement>('[data-render-quality]');
  const storedQuality = storageGet(QUALITY_KEY);
  if (
    quality !== null &&
    (storedQuality === 'high' ||
      storedQuality === 'balanced' ||
      storedQuality === 'performance')
  ) {
    quality.value = storedQuality;
  }
  quality?.addEventListener('change', () => {
    storageSet(QUALITY_KEY, quality.value);
    window.dispatchEvent(
      new CustomEvent('lostincubes:render-quality', { detail: quality.value }),
    );
  });

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
    ?.addEventListener('click', () => {
      resumeRequested = true;
      const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
      if (canvas !== null && typeof canvas.requestPointerLock === 'function') {
        const request = canvas.requestPointerLock();
        void Promise.resolve(request).catch(() => undefined);
      }
    });
  section
    .querySelector<HTMLButtonElement>('[data-pause-exit]')
    ?.addEventListener('click', () => {
      window.location.reload();
    });

  root = section;
  return section;
}

function renderPause(paused: boolean): void {
  const menu = createMenu();
  menu.hidden = !paused;
  document.body.classList.toggle('pause-menu-open', paused);
}

export function installPauseMenuRuntime(): void {
  if (installed) return;
  installed = true;
  createMenu();

  const originalPoll = InputManager.prototype.poll;
  InputManager.prototype.poll = function pauseAwarePoll(
    issuedAtTick: number,
  ): PlayerInputCommand {
    const command = originalPoll.call(this, issuedAtTick);
    if (!resumeRequested) return command;
    resumeRequested = false;
    return { ...command, togglePause: true };
  };

  const originalStep = LocalGameSession.prototype.step;
  LocalGameSession.prototype.step = function pauseAwareStep(
    stepSeconds: number,
  ): void {
    originalStep.call(this, stepSeconds);
    renderPause(!this.isDead && this.getWorldState().player.paused);
  };
}
