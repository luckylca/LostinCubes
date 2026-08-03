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
  readonly updateLighting: (dayTime: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function mixColor(night: Color3, day: Color3, amount: number): Color3 {
  return new Color3(
    night.r + (day.r - night.r) * amount,
    night.g + (day.g - night.g) * amount,
    night.b + (day.b - night.b) * amount,
  );
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
    const daySky = new Color3(0.42, 0.62, 0.75);
    const nightSky = new Color3(0.025, 0.045, 0.09);
    scene.clearColor = new Color4(daySky.r, daySky.g, daySky.b, 1);
    scene.ambientColor = new Color3(0.2, 0.23, 0.21);
    scene.collisionsEnabled = false;
    scene.skipPointerMovePicking = true;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = daySky.clone();
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

    const updateLighting = (dayTime: number): void => {
      const normalized = ((dayTime % 1) + 1) % 1;
      const angle = normalized * Math.PI * 2 - Math.PI / 2;
      const sunHeight = Math.sin(angle);
      const daylight = clamp((sunHeight + 0.18) / 1.18, 0.06, 1);
      const twilight = clamp(1 - Math.abs(sunHeight) * 3.2, 0, 1);
      const sky = mixColor(nightSky, daySky, daylight);
      sky.r = clamp(sky.r + twilight * 0.13, 0, 1);
      sky.g = clamp(sky.g + twilight * 0.045, 0, 1);
      scene.clearColor.set(sky.r, sky.g, sky.b, 1);
      scene.fogColor.copyFrom(sky);
      scene.ambientColor.set(
        0.035 + daylight * 0.17,
        0.045 + daylight * 0.18,
        0.075 + daylight * 0.14,
      );
      skyLight.intensity = 0.16 + daylight * 0.62;
      skyLight.diffuse.set(
        0.48 + daylight * 0.44,
        0.57 + daylight * 0.41,
        0.75 + daylight * 0.25,
      );
      sun.intensity = daylight * 1.08;
      sun.direction.set(-Math.cos(angle) * 0.72, -Math.max(sunHeight, 0.08), 0.38);
      sun.diffuse.set(1, 0.69 + daylight * 0.22, 0.5 + daylight * 0.22);
    };
    updateLighting(0.28);
    return { scene, updateLighting };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.#resizeHandler);
    this.engine.dispose();
  }
}
