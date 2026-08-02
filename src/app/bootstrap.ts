import { GameApp } from './GameApp';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

export async function bootstrap(): Promise<void> {
  const canvasElement = requireElement('#game-canvas');
  if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error('Required canvas element has the wrong type: #game-canvas');
  }

  const loadingScreen = requireElement('#loading-screen');
  const loadingMessage = requireElement('#loading-message');
  const prototypeHud = requireElement('#prototype-hud');
  const app = new GameApp(canvasElement);

  try {
    await app.start();
    loadingMessage.textContent = '世界碎片已稳定';
    prototypeHud.hidden = false;
    loadingScreen.classList.add('is-hidden');
  } catch (error: unknown) {
    console.error('Failed to start Lost in Cubes.', error);
    loadingMessage.textContent = '启动失败，请检查浏览器 WebGL 支持和控制台日志。';
  }

  window.addEventListener('pagehide', () => app.dispose(), { once: true });
}
