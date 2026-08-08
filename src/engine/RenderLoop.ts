import type { Engine, Scene } from '@babylonjs/core';
import { SimulationClock } from '../game/simulation/SimulationClock';

export interface RenderLoopHooks {
  beforeFrame(): void;
  fixedUpdate(stepSeconds: number, tick: number): void;
  renderUpdate(frameSeconds: number): void;
}

const MENU_RENDER_INTERVAL_SECONDS = 1 / 12;

function isHeavyMenuOpen(): boolean {
  return (
    document.body.classList.contains('inventory-open') ||
    document.body.classList.contains('pause-menu-open')
  );
}

export class RenderLoop {
  readonly #engine: Engine;
  readonly #scene: Scene;
  readonly #hooks: RenderLoopHooks;
  readonly #clock = new SimulationClock();
  #running = false;
  #menuRenderElapsed = 0;

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

    if (isHeavyMenuOpen()) {
      this.#menuRenderElapsed += frameSeconds;
      if (this.#menuRenderElapsed < MENU_RENDER_INTERVAL_SECONDS) return;
      const menuFrameSeconds = this.#menuRenderElapsed;
      this.#menuRenderElapsed = 0;
      this.#hooks.renderUpdate(menuFrameSeconds);
      this.#scene.render();
      return;
    }

    this.#menuRenderElapsed = 0;
    this.#hooks.renderUpdate(frameSeconds);
    this.#scene.render();
  };
}
