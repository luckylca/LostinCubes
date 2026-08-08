import type { Engine, Scene } from '@babylonjs/core';
import { SimulationClock } from '../game/simulation/SimulationClock';

export interface RenderLoopHooks {
  beforeFrame(): void;
  fixedUpdate(stepSeconds: number, tick: number): void;
  renderUpdate(frameSeconds: number): void;
}

const MENU_RENDER_INTERVAL_SECONDS = 1 / 12;
const IDLE_DESKTOP_RENDER_INTERVAL_SECONDS = 1 / 24;

function isHeavyMenuOpen(): boolean {
  return (
    document.body.classList.contains('inventory-open') ||
    document.body.classList.contains('pause-menu-open')
  );
}

function isIdleDesktopView(): boolean {
  if (document.pointerLockElement !== null) return false;
  return !window.matchMedia('(pointer: coarse)').matches;
}

export class RenderLoop {
  readonly #engine: Engine;
  readonly #scene: Scene;
  readonly #hooks: RenderLoopHooks;
  readonly #clock = new SimulationClock();
  #running = false;
  #deferredRenderElapsed = 0;

  public constructor(engine: Engine, scene: Scene, hooks: RenderLoopHooks) {
    this.#engine = engine;
    this.#scene = scene;
    this.#hooks = hooks;
  }

  public start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    this.#engine.runRenderLoop(this.#frame);
  }

  public stop(): void {
    if (!this.#running) {
      return;
    }

    this.#running = false;
    this.#engine.stopRenderLoop(this.#frame);
    this.#scene.dispose();
  }

  readonly #frame = (): void => {
    const frameSeconds = this.#engine.getDeltaTime() / 1000;
    this.#hooks.beforeFrame();
    this.#clock.advance(frameSeconds, (stepSeconds, tick) => {
      this.#hooks.fixedUpdate(stepSeconds, tick);
    });

    const renderInterval = isHeavyMenuOpen()
      ? MENU_RENDER_INTERVAL_SECONDS
      : isIdleDesktopView()
        ? IDLE_DESKTOP_RENDER_INTERVAL_SECONDS
        : 0;

    if (renderInterval > 0) {
      this.#deferredRenderElapsed += frameSeconds;
      if (this.#deferredRenderElapsed < renderInterval) return;
      const deferredFrameSeconds = this.#deferredRenderElapsed;
      this.#deferredRenderElapsed = 0;
      this.#hooks.renderUpdate(deferredFrameSeconds);
      this.#scene.render();
      return;
    }

    this.#deferredRenderElapsed = 0;
    this.#hooks.renderUpdate(frameSeconds);
    this.#scene.render();
  };
}
