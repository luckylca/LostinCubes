import {
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

export interface PrototypeSceneBundle {
  readonly scene: Scene;
}

function markCameraBlocker(mesh: Mesh): void {
  mesh.metadata = { cameraBlocker: true };
  mesh.checkCollisions = true;
  mesh.isPickable = true;
}

function createMergedBlocks(
  name: string,
  positions: readonly Vector3[],
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const sourceMeshes = positions.map((position, index) => {
    const block = MeshBuilder.CreateBox(
      `${name}-source-${String(index)}`,
      { size: 1 },
      scene,
    );
    block.position.copyFrom(position);
    block.computeWorldMatrix(true);
    return block;
  });

  const merged = Mesh.MergeMeshes(sourceMeshes, true, true, undefined, false, true);
  if (merged === null) {
    throw new Error(`Failed to merge voxel layer: ${name}`);
  }

  merged.name = name;
  merged.material = material;
  markCameraBlocker(merged);
  return merged;
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

  public createPrototypeScene(): PrototypeSceneBundle {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.025, 0.07, 0.045, 1);
    scene.ambientColor = new Color3(0.08, 0.14, 0.1);
    scene.collisionsEnabled = true;

    const light = new HemisphericLight(
      'world-light',
      new Vector3(-0.4, 1, 0.2),
      scene,
    );
    light.intensity = 1.15;
    light.groundColor = new Color3(0.09, 0.12, 0.1);

    const grass = new StandardMaterial('grass-material', scene);
    grass.diffuseColor = new Color3(0.17, 0.42, 0.24);
    grass.specularColor = Color3.Black();

    const stone = new StandardMaterial('stone-material', scene);
    stone.diffuseColor = new Color3(0.33, 0.39, 0.35);
    stone.specularColor = Color3.Black();

    const rune = new StandardMaterial('rune-material', scene);
    rune.diffuseColor = new Color3(0.18, 0.24, 0.21);
    rune.emissiveColor = new Color3(0.15, 0.48, 0.3);
    rune.specularColor = Color3.Black();

    const grassPositions: Vector3[] = [];
    const stonePositions: Vector3[] = [];

    for (let x = -5; x <= 5; x += 1) {
      for (let z = -5; z <= 5; z += 1) {
        grassPositions.push(new Vector3(x, 1.5, z));
        stonePositions.push(new Vector3(x, 0.5, z));
      }
    }

    createMergedBlocks('prototype-grass-layer', grassPositions, grass, scene);
    createMergedBlocks('prototype-stone-layer', stonePositions, stone, scene);

    const monolith = MeshBuilder.CreateBox(
      'rune-monolith',
      { width: 1.4, height: 5, depth: 1.4 },
      scene,
    );
    monolith.position.set(0, 4.5, 0);
    monolith.rotation.y = Math.PI / 4;
    monolith.material = rune;
    markCameraBlocker(monolith);

    return { scene };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.#resizeHandler);
    this.engine.dispose();
  }
}
