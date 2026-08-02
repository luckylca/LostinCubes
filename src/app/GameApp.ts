import type { Engine } from '@babylonjs/core';
import { BabylonEngine } from '../engine/BabylonEngine';
import { RenderLoop } from '../engine/RenderLoop';

export class GameApp {
  readonly #engineHost: BabylonEngine;
  #renderLoop: RenderLoop | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this.#engineHost = new BabylonEngine(canvas);
  }

  public async start(): Promise<void> {
    const scene = await this.#engineHost.createPrototypeScene();
    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene);
    this.#renderLoop.start();
  }

  public dispose(): void {
    this.#renderLoop?.stop();
    this.#renderLoop = null;
    this.#engineHost.dispose();
  }

  public get engine(): Engine {
    return this.#engineHost.engine;
  }
}
