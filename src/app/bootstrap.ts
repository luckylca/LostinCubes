import { GameApp } from './GameApp';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

export async function bootstrap(): Promise<void> {
  const loadingMessage = requireElement('#loading-message');
  let app: GameApp | null = null;

  try {
    const canvasElement = requireElement('#game-canvas');
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Required canvas element has the wrong type: #game-canvas');
    }

    const loadingScreen = requireElement('#loading-screen');
    const prototypeHud = requireElement('#prototype-hud');

    app = new GameApp(canvasElement);
    app.start();

    loadingMessage.textContent = '世界碎片已稳定';
    prototypeHud.hidden = false;
    loadingScreen.classList.add('is-hidden');
  } catch (error: unknown) {
    console.error('Failed to start Lost in Cubes.', error);
    app?.dispose();
    app = null;
    loadingMessage.textContent = `启动失败：${describeError(error)}`;
  }

  window.addEventListener('pagehide', () => app?.dispose(), { once: true });
}
