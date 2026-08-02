import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';

export interface WorldSceneBundle {
  readonly scene: Scene;
}

export class BabylonEngine {
  public readonly engine: Engine;
  readonly #resizeHandler: () => void;

  public constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      antialias: true,
      adaptToDeviceRatio: true,
      preserveDrawingBuffer: false,
      stencil: true,
    });
    this.#resizeHandler = () => this.engine.resize();
    window.addEventListener('resize', this.#resizeHandler);
    this.engine.resize();
  }

  public createWorldScene(): WorldSceneBundle {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.035, 0.085, 0.07, 1);
    scene.ambientColor = new Color3(0.12, 0.16, 0.14);
    scene.collisionsEnabled = false;

    const light = new HemisphericLight(
      'world-light',
      new Vector3(-0.35, 1, 0.25),
      scene,
    );
    light.intensity = 1.2;
    light.groundColor = new Color3(0.09, 0.12, 0.105);

    return { scene };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.#resizeHandler);
    this.engine.dispose();
  }
}
