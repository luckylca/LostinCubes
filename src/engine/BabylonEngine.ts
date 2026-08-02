import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

function createMergedBlocks(
  name: string,
  positions: readonly Vector3[],
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const sourceMeshes = positions.map((position, index) => {
    const block = MeshBuilder.CreateBox(`${name}-source-${index}`, { size: 1 }, scene);
    block.position.copyFrom(position);
    return block;
  });

  const merged = Mesh.MergeMeshes(sourceMeshes, true, true, undefined, false, true);
  if (merged === null) {
    throw new Error(`Failed to merge voxel layer: ${name}`);
  }

  merged.name = name;
  merged.material = material;
  merged.isPickable = true;
  return merged;
}

export class BabylonEngine {
  public readonly engine: Engine;
  readonly #canvas: HTMLCanvasElement;
  readonly #resizeHandler: () => void;

  public constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.engine = new Engine(canvas, true, {
      antialias: true,
      adaptToDeviceRatio: true,
      preserveDrawingBuffer: false,
      stencil: true,
    });
    this.#resizeHandler = () => this.engine.resize();
    window.addEventListener('resize', this.#resizeHandler);
  }

  public async createPrototypeScene(): Promise<Scene> {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.025, 0.07, 0.045, 1);
    scene.ambientColor = new Color3(0.08, 0.14, 0.1);

    const camera = new ArcRotateCamera(
      'prototype-camera',
      -Math.PI / 3,
      Math.PI / 3.1,
      20,
      new Vector3(0, 1.5, 0),
      scene,
    );
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 30;
    camera.wheelPrecision = 35;
    camera.panningSensibility = 0;
    camera.attachControl(this.#canvas, true);

    const light = new HemisphericLight('world-light', new Vector3(-0.4, 1, 0.2), scene);
    light.intensity = 1.15;
    light.groundColor = new Color3(0.09, 0.12, 0.1);

    const grass = new StandardMaterial('grass-material', scene);
    grass.diffuseColor = new Color3(0.17, 0.42, 0.24);
    grass.specularColor = Color3.Black();

    const stone = new StandardMaterial('stone-material', scene);
    stone.diffuseColor = new Color3(0.33, 0.39, 0.35);
    stone.specularColor = Color3.Black();

    const grassPositions: Vector3[] = [];
    const stonePositions: Vector3[] = [];

    for (let x = -5; x <= 5; x += 1) {
      for (let z = -5; z <= 5; z += 1) {
        const height = Math.max(1, 3 - Math.floor(Math.hypot(x, z) / 3));
        for (let y = 0; y < height; y += 1) {
          const position = new Vector3(x, y - 0.5, z);
          if (y === height - 1) {
            grassPositions.push(position);
          } else {
            stonePositions.push(position);
          }
        }
      }
    }

    createMergedBlocks('prototype-grass-layer', grassPositions, grass, scene);
    createMergedBlocks('prototype-stone-layer', stonePositions, stone, scene);

    const monolith = MeshBuilder.CreateBox(
      'rune-monolith',
      { width: 1.4, height: 5, depth: 1.4 },
      scene,
    );
    monolith.position.set(0, 2, 0);
    monolith.rotation.y = Math.PI / 4;
    monolith.material = stone;

    await scene.whenReadyAsync();
    return scene;
  }

  public dispose(): void {
    window.removeEventListener('resize', this.#resizeHandler);
    this.engine.dispose();
  }
}
