import type { Engine, Scene } from '@babylonjs/core';

export class RenderLoop {
  readonly #engine: Engine;
  readonly #scene: Scene;
  #running = false;

  public constructor(engine: Engine, scene: Scene) {
    this.#engine = engine;
    this.#scene = scene;
  }

  public start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#engine.runRenderLoop(() => this.#scene.render());
  }

  public stop(): void {
    if (!this.#running) {
      return;
    }
    this.#running = false;
    this.#engine.stopRenderLoop();
    this.#scene.dispose();
  }
}
