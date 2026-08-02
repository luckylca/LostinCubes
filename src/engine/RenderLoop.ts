import type { Engine, Scene } from '@babylonjs/core';
import { SimulationClock } from '../game/simulation/SimulationClock';

export interface RenderLoopHooks {
  beforeFrame(): void;
  fixedUpdate(stepSeconds: number, tick: number): void;
  renderUpdate(frameSeconds: number): void;
}

export class RenderLoop {
  readonly #engine: Engine;
  readonly #scene: Scene;
  readonly #hooks: RenderLoopHooks;
  readonly #clock = new SimulationClock();
  #running = false;

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
    this.#clock.advance(frameSeconds, this.#hooks.fixedUpdate);
    this.#hooks.renderUpdate(frameSeconds);
    this.#scene.render();
  };
}
