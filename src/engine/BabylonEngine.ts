import {
  Color3,
  Color4,
  DirectionalLight,
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
    const skyColor = new Color3(0.42, 0.62, 0.75);
    scene.clearColor = new Color4(skyColor.r, skyColor.g, skyColor.b, 1);
    scene.ambientColor = new Color3(0.2, 0.23, 0.21);
    scene.collisionsEnabled = false;
    scene.skipPointerMovePicking = true;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = skyColor;
    scene.fogStart = 22;
    scene.fogEnd = 58;

    const skyLight = new HemisphericLight(
      'world-sky-light',
      new Vector3(-0.25, 1, 0.18),
      scene,
    );
    skyLight.intensity = 0.72;
    skyLight.diffuse = new Color3(0.92, 0.98, 1);
    skyLight.groundColor = new Color3(0.16, 0.19, 0.17);
    skyLight.specular = Color3.Black();

    const sun = new DirectionalLight(
      'world-sun',
      new Vector3(-0.55, -1, 0.38),
      scene,
    );
    sun.intensity = 1.05;
    sun.diffuse = new Color3(1, 0.91, 0.72);
    sun.specular = Color3.Black();

    return { scene };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.#resizeHandler);
    this.engine.dispose();
  }
}
