import {
  MaterialPluginBase,
  StandardMaterial,
} from '@babylonjs/core';
import type {
  AbstractEngine,
  Scene,
  SubMesh,
  UniformBuffer,
} from '@babylonjs/core';

const MAXIMUM_MASKED_BLOCKS_PER_CHUNK = 8;
const VOXEL_HALF_EXTENT_WITH_EPSILON = 0.501;

export interface MaskedVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function voxelKey(x: number, y: number, z: number): string {
  return `${String(x)},${String(y)},${String(z)}`;
}

/**
 * Tracks a very small set of voxels whose logical state already changed but
 * whose streamed chunk mesh has not been replaced yet.
 */
export class VoxelEditMaskRegistry {
  readonly #byChunk = new Map<string, Map<string, MaskedVoxel>>();

  public mask(chunkKey: string, x: number, y: number, z: number): void {
    const masks = this.#byChunk.get(chunkKey) ?? new Map<string, MaskedVoxel>();
    const key = voxelKey(x, y, z);
    masks.delete(key);
    masks.set(key, { x, y, z });
    while (masks.size > MAXIMUM_MASKED_BLOCKS_PER_CHUNK) {
      const oldest = masks.keys().next().value;
      if (oldest === undefined) break;
      masks.delete(oldest);
    }
    this.#byChunk.set(chunkKey, masks);
  }

  public unmask(chunkKey: string, x: number, y: number, z: number): void {
    const masks = this.#byChunk.get(chunkKey);
    if (masks === undefined) return;
    masks.delete(voxelKey(x, y, z));
    if (masks.size === 0) this.#byChunk.delete(chunkKey);
  }

  public clearChunk(chunkKey: string): void {
    this.#byChunk.delete(chunkKey);
  }

  public masksForChunk(chunkKey: string): readonly MaskedVoxel[] {
    const masks = this.#byChunk.get(chunkKey);
    return masks === undefined ? [] : [...masks.values()];
  }

  public clear(): void {
    this.#byChunk.clear();
  }
}

function readChunkKey(subMesh: SubMesh): string | null {
  const metadata: unknown = subMesh.getMesh().metadata;
  if (typeof metadata !== 'object' || metadata === null) return null;
  const candidate = (metadata as Record<string, unknown>).chunkKey;
  return typeof candidate === 'string' ? candidate : null;
}

function buildDiscardCode(): string {
  const clauses: string[] = [];
  for (let index = 0; index < MAXIMUM_MASKED_BLOCKS_PER_CHUNK; index += 1) {
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
 * GPU-side visual eraser for freshly removed blocks.
 *
 * The chunk mesh can stay on screen while its worker rebuild is in flight. The
 * old fragment(s) inside a removed voxel are discarded immediately, then the
 * mask is cleared as soon as the rebuilt chunk mesh is applied.
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
    ubo: Array<{ name: string; size: number; type: string }>;
  } {
    return {
      ubo: Array.from(
        { length: MAXIMUM_MASKED_BLOCKS_PER_CHUNK },
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
  ): { [pointName: string]: string } | null {
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
    const chunkKey = readChunkKey(subMesh);
    const masks = chunkKey === null ? [] : this.#registry.masksForChunk(chunkKey);
    for (let index = 0; index < MAXIMUM_MASKED_BLOCKS_PER_CHUNK; index += 1) {
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
