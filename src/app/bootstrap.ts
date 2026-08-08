import { selectWorld } from '../ui/WorldSelectionView';
import { setActiveRuntimeWorld } from '../world/ActiveWorldRuntime';
import { WorldCatalog } from '../world/WorldCatalog';
import { deleteWorldSaveData } from '../world/WorldSaveDeletion';
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

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function bootstrap(): Promise<void> {
  const loadingMessage = requireElement('#loading-message');
  let app: GameApp | null = null;
  document.documentElement.dataset.gameState = 'world-selection';

  try {
    const canvasElement = requireElement('#game-canvas');
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Required canvas element has the wrong type: #game-canvas');
    }

    const loadingScreen = requireElement('#loading-screen');
    const loadingSpinner = requireElement('#loading-spinner');
    const loadingActionElement = requireElement('#loading-action');
    if (!(loadingActionElement instanceof HTMLButtonElement)) {
      throw new Error('Required loading action has the wrong type: #loading-action');
    }
    const gameHud = requireElement('#game-hud');
    const storage = browserStorage();
    const catalog = new WorldCatalog(storage);
    loadingScreen.classList.add('is-hidden');
    const selectedWorld = await selectWorld(catalog, {
      deleteWorldData: (worldId) => deleteWorldSaveData(worldId, storage),
    });
    setActiveRuntimeWorld(selectedWorld);
    loadingScreen.classList.remove('is-hidden');
    loadingScreen.classList.remove('runtime-wait', 'death-screen');
    loadingSpinner.hidden = false;
    loadingActionElement.hidden = true;
    document.documentElement.dataset.gameState = 'loading';

    const ui: GameUiElements = {
      touchControls: document.querySelector<HTMLElement>('#touch-controls'),
      status: requireElement('#hud-status'),
      viewMode: requireElement('#hud-view'),
      position: requireElement('#hud-position'),
      hotbar: requireElement('#hotbar'),
      targetReticle: requireElement('#target-reticle'),
      inventoryRoot: requireElement('#inventory-screen'),
      loadingScreen,
      loadingMessage,
      loadingSpinner,
      loadingAction: loadingActionElement,
    };

    app = new GameApp(canvasElement, ui);
    loadingMessage.textContent = `正在生成「${selectedWorld.name}」附近区块……`;
    await app.start();

    loadingMessage.textContent = `${selectedWorld.name} 已稳定`;
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
