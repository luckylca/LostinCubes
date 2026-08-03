import { GameApp, type GameUiElements } from './GameApp';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.trim() || 'Error';
    const message = error.message.trim();
    if (message.length > 0 && message !== name) {
      return `${name}: ${message}`;
    }
    return `${name}（浏览器未提供详细原因）`;
  }
  const description = String(error).trim();
  return description.length > 0
    ? description
    : '未知错误（浏览器未提供详细原因）';
}

export async function bootstrap(): Promise<void> {
  const loadingMessage = requireElement('#loading-message');
  let app: GameApp | null = null;
  document.documentElement.dataset.gameState = 'loading';

  try {
    const canvasElement = requireElement('#game-canvas');
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Required canvas element has the wrong type: #game-canvas');
    }

    const loadingScreen = requireElement('#loading-screen');
    const gameHud = requireElement('#game-hud');
    const ui: GameUiElements = {
      touchControls: document.querySelector<HTMLElement>('#touch-controls'),
      status: requireElement('#hud-status'),
      viewMode: requireElement('#hud-view'),
      position: requireElement('#hud-position'),
      hotbar: requireElement('#hotbar'),
      targetReticle: requireElement('#target-reticle'),
      inventoryRoot: requireElement('#inventory-screen'),
    };

    app = new GameApp(canvasElement, ui);
    loadingMessage.textContent = '正在生成附近区块与森林……';
    await app.start();

    loadingMessage.textContent = '世界碎片已稳定';
    gameHud.hidden = false;
    loadingScreen.classList.add('is-hidden');
    document.documentElement.dataset.gameState = 'ready';
  } catch (error: unknown) {
    console.error('Failed to start Lost in Cubes.', error);
    app?.dispose();
    app = null;
    document.documentElement.dataset.gameState = 'error';
    loadingMessage.textContent = `启动失败：${describeError(error)}`;
  }

  window.addEventListener('pagehide', () => app?.dispose(), { once: true });
}
