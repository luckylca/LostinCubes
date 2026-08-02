import { GameApp } from './GameApp';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

export async function bootstrap(): Promise<void> {
  const canvas = requireElement<HTMLCanvasElement>('#game-canvas');
  const loadingScreen = requireElement<HTMLElement>('#loading-screen');
  const loadingMessage = requireElement<HTMLElement>('#loading-message');
  const prototypeHud = requireElement<HTMLElement>('#prototype-hud');

  const app = new GameApp(canvas);

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
