import { MaterialPluginBase } from '@babylonjs/core';
import type {
  AbstractEngine,
  Mesh,
  Scene,
  StandardMaterial,
  SubMesh,
  UniformBuffer,
} from '@babylonjs/core';
import {
  createChunkKey,
  worldToChunkCoordinate,
} from './VoxelChunk';

const MAXIMUM_MASKED_BLOCKS_PER_MESH = 8;
const VOXEL_HALF_EXTENT_WITH_EPSILON = 0.501;

export interface MaskedVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const ACTIVE_REGISTRIES = new WeakMap<Scene, VoxelEditMaskRegistry>();

function voxelKey(x: number, y: number, z: number): string {
  return `${String(x)},${String(y)},${String(z)}`;
}

function chunkMeshName(worldX: number, worldZ: number): string {
  return `voxel-chunk-${createChunkKey(
    worldToChunkCoordinate(worldX),
    worldToChunkCoordinate(worldZ),
  )}`;
}

/**
 * Tracks removed voxels against the exact old chunk mesh currently on screen.
 * A rebuilt chunk gets a new mesh id and is therefore never affected by stale
 * masks. Disposal of the old mesh also removes its mask state automatically.
 */
export class VoxelEditMaskRegistry {
  readonly #scene: Scene;
  readonly #byMesh = new Map<number, Map<string, MaskedVoxel>>();
  readonly #observedMeshes = new Set<number>();

  public constructor(scene: Scene) {
    this.#scene = scene;
    ACTIVE_REGISTRIES.set(scene, this);
  }

  public maskWorldVoxel(worldX: number, worldY: number, worldZ: number): void {
    const mesh = this.#scene.getMeshByName(
      chunkMeshName(worldX, worldZ),
    ) as Mesh | null;
    if (mesh === null || mesh.isDisposed()) return;

    const masks = this.#byMesh.get(mesh.uniqueId) ?? new Map<string, MaskedVoxel>();
    const key = voxelKey(worldX, worldY, worldZ);
    masks.delete(key);
    masks.set(key, { x: worldX, y: worldY, z: worldZ });
    while (masks.size > MAXIMUM_MASKED_BLOCKS_PER_MESH) {
      const oldest = masks.keys().next().value;
      if (oldest === undefined) break;
      masks.delete(oldest);
    }
    this.#byMesh.set(mesh.uniqueId, masks);

    if (!this.#observedMeshes.has(mesh.uniqueId)) {
      this.#observedMeshes.add(mesh.uniqueId);
      const meshId = mesh.uniqueId;
      mesh.onDisposeObservable.addOnce(() => {
        this.#byMesh.delete(meshId);
        this.#observedMeshes.delete(meshId);
      });
    }
  }

  public masksForMesh(meshId: number): readonly MaskedVoxel[] {
    const masks = this.#byMesh.get(meshId);
    return masks === undefined ? [] : [...masks.values()];
  }

  public clear(): void {
    this.#byMesh.clear();
    this.#observedMeshes.clear();
    if (ACTIVE_REGISTRIES.get(this.#scene) === this) {
      ACTIVE_REGISTRIES.delete(this.#scene);
    }
  }
}

/** Called immediately after the world accepts a block break. */
export function maskRemovedVoxelImmediately(
  scene: Scene,
  worldX: number,
  worldY: number,
  worldZ: number,
): void {
  ACTIVE_REGISTRIES.get(scene)?.maskWorldVoxel(worldX, worldY, worldZ);
}

function buildDiscardCode(): string {
  const clauses: string[] = [];
  for (let index = 0; index < MAXIMUM_MASKED_BLOCKS_PER_MESH; index += 1) {
    const uniform = `voxelEditMask${String(index)}`;
    clauses.push(`
      if (
        ${uniform}.w > 0.5 &&
        abs(vPositionW.x - ${uniform}.x) <= ${String(VOXEL_HALF_EXTENT_WITH_EPSILON)} &&
        abs(vPositionW.y - ${uniform}.y) <= ${String(VOXEL_HALF_EXTENT_WITH_EPSILON)} &&
        abs(vPositionW.z - ${uniform}.z) <= ${String(VOXEL_HALF_EXTENT_WITH_EPSILON)}
      ) {
        discard;
      }
    `);
  }
  return clauses.join('\n');
}

/**
 * GPU-side visual eraser for freshly removed blocks. The old streamed mesh can
 * stay on screen while its worker rebuild runs, but fragments belonging to the
 * removed voxel disappear on the very next render.
 */
export class VoxelEditMaskPlugin extends MaterialPluginBase {
  readonly #registry: VoxelEditMaskRegistry;

  public constructor(
    material: StandardMaterial,
    registry: VoxelEditMaskRegistry,
  ) {
    super(material, 'VoxelEditMask', 190, undefined, true, true);
    this.#registry = registry;
    this.registerForExtraEvents = true;
  }

  public override getClassName(): string {
    return 'VoxelEditMaskPlugin';
  }

  public override getUniforms(): {
    ubo: { name: string; size: number; type: string }[];
  } {
    return {
      ubo: Array.from(
        { length: MAXIMUM_MASKED_BLOCKS_PER_MESH },
        (_, index) => ({
          name: `voxelEditMask${String(index)}`,
          size: 4,
          type: 'vec4',
        }),
      ),
    };
  }

  public override getCustomCode(
    shaderType: string,
  ): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_MAIN_BEGIN: buildDiscardCode(),
    };
  }

  public override hardBindForSubMesh(
    uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ): void {
    const masks = this.#registry.masksForMesh(subMesh.getMesh().uniqueId);
    for (let index = 0; index < MAXIMUM_MASKED_BLOCKS_PER_MESH; index += 1) {
      const mask = masks[index];
      const name = `voxelEditMask${String(index)}`;
      if (mask === undefined) {
        uniformBuffer.updateFloat4(name, 0, 0, 0, 0);
      } else {
        uniformBuffer.updateFloat4(name, mask.x, mask.y, mask.z, 1);
      }
    }
  }
}
