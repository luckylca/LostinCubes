import {
  Color3,
  Constants,
  Material,
  MultiMaterial,
  RawTexture,
  StandardMaterial,
  SubMesh,
  Texture,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { ChunkMaterialRange } from './ChunkMeshBuilder';
import {
  BLOCK_TEXTURE_KINDS,
  BLOCK_TEXTURE_SIZE,
  BlockTexture,
  getBlockTexturePixels,
} from './BlockTextureLibrary';
import {
  VoxelEditMaskPlugin,
  VoxelEditMaskRegistry,
} from './VoxelEditMaskPlugin';

const BLENDED_TEXTURES = new Set<BlockTexture>([
  BlockTexture.Water,
  BlockTexture.Lava,
]);

const DOUBLE_SIDED_TEXTURES = new Set<BlockTexture>([
  BlockTexture.OakLeaves,
  BlockTexture.Torch,
  BlockTexture.Ladder,
  BlockTexture.OakSapling,
  BlockTexture.TallGrass,
  BlockTexture.Dandelion,
  BlockTexture.Water,
  BlockTexture.Lava,
]);

const WATER_FRAME_SECONDS = 0.16;
const LAVA_FRAME_SECONDS = 0.24;

function clampByte(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

/** Builds an original classic voxel-water texture without copying game assets. */
function createClassicFluidPixels(
  textureKind: BlockTexture,
  source: Uint8Array,
): Uint8Array {
  if (textureKind !== BlockTexture.Water) return source;

  const pixels = new Uint8Array(source.length);
  for (let y = 0; y < BLOCK_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_TEXTURE_SIZE; x += 1) {
      const offset = (x + y * BLOCK_TEXTURE_SIZE) * 4;
      const coarseWave =
        ((y + Math.floor(x / 3) + Math.floor((x + y) / 7)) % 6) === 0;
      const fineWave = ((x * 5 + y * 3 + x * y) & 15) - 7;
      const shimmer = ((x + y * 2) % 11 === 0 ? 18 : 0) + fineWave;
      pixels[offset] = clampByte(35 + shimmer * 0.28);
      pixels[offset + 1] = clampByte(105 + shimmer * 0.72);
      pixels[offset + 2] = clampByte(
        (coarseWave ? 226 : 198) + shimmer * 0.55,
      );
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** Shared nearest-neighbor pixel materials used by every streamed chunk. */
export class VoxelMaterialLibrary {
  readonly #multiMaterial: MultiMaterial;
  readonly #materials: StandardMaterial[] = [];
  readonly #editMasks = new VoxelEditMaskRegistry();
  readonly #editMaskPlugins: VoxelEditMaskPlugin[] = [];
  readonly #fluidTextures = new Map<BlockTexture, RawTexture>();
  readonly #removeAnimationObserver: () => void;
  #waterElapsed = 0;
  #lavaElapsed = 0;
  #waterFrame = -1;
  #lavaFrame = -1;

  public constructor(scene: Scene) {
    this.#multiMaterial = new MultiMaterial('voxel-world-materials', scene);

    for (const textureKind of BLOCK_TEXTURE_KINDS) {
      const source = getBlockTexturePixels(textureKind);
      const texturePixels = createClassicFluidPixels(
        textureKind,
        source.pixels,
      );
      const texture = RawTexture.CreateRGBATexture(
        texturePixels,
        BLOCK_TEXTURE_SIZE,
        BLOCK_TEXTURE_SIZE,
        scene,
        true,
        false,
        Texture.NEAREST_NEAREST_MIPNEAREST,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      texture.name = `voxel-texture-${String(textureKind)}`;
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 1;
      texture.hasAlpha = source.hasAlpha;
      if (BLENDED_TEXTURES.has(textureKind)) {
        this.#fluidTextures.set(textureKind, texture);
      }

      const material = new StandardMaterial(
        `voxel-material-${String(textureKind)}`,
        scene,
      );
      material.diffuseTexture = texture;
      material.diffuseColor =
        textureKind === BlockTexture.Water
          ? new Color3(0.82, 0.9, 1)
          : Color3.White();
      material.specularColor = Color3.Black();
      material.backFaceCulling = !DOUBLE_SIDED_TEXTURES.has(textureKind);
      material.emissiveColor =
        textureKind === BlockTexture.Torch
          ? new Color3(0.62, 0.31, 0.05)
          : textureKind === BlockTexture.Lava
            ? new Color3(0.54, 0.16, 0.025)
            : textureKind === BlockTexture.Water
              ? new Color3(0.025, 0.055, 0.095)
              : textureKind === BlockTexture.RuneStone
                ? new Color3(0.035, 0.1, 0.065)
                : new Color3(0.018, 0.022, 0.02);

      const blended = BLENDED_TEXTURES.has(textureKind);
      if (blended) {
        material.useAlphaFromDiffuseTexture = false;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.needDepthPrePass = true;
        material.disableDepthWrite = false;
        material.alpha = textureKind === BlockTexture.Water ? 0.72 : 0.94;
      } else if (source.hasAlpha) {
        material.useAlphaFromDiffuseTexture = true;
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
        material.alphaCutOff = 0.42;
      }

      this.#editMaskPlugins.push(
        new VoxelEditMaskPlugin(material, this.#editMasks),
      );
      if (!blended) material.freeze();
      this.#materials.push(material);
      this.#multiMaterial.subMaterials.push(material);
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = Math.min(
        Math.max(scene.getEngine().getDeltaTime() / 1000, 0),
        0.1,
      );
      this.#animateFluids(deltaSeconds);
    });
    this.#removeAnimationObserver = () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }

  public applyToMesh(
    mesh: Mesh,
    ranges: readonly ChunkMaterialRange[],
    totalVertices: number,
  ): void {
    mesh.material = this.#multiMaterial;
    mesh.subMeshes = [];
    for (const range of ranges) {
      new SubMesh(
        range.texture,
        0,
        totalVertices,
        range.indexStart,
        range.indexCount,
        mesh,
      );
    }
  }

  public maskRemovedBlock(
    chunkKey: string,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    this.#editMasks.mask(chunkKey, worldX, worldY, worldZ);
  }

  public unmaskBlock(
    chunkKey: string,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    this.#editMasks.unmask(chunkKey, worldX, worldY, worldZ);
  }

  public clearEditMasksForChunk(chunkKey: string): void {
    this.#editMasks.clearChunk(chunkKey);
  }

  public dispose(): void {
    this.#removeAnimationObserver();
    this.#editMasks.clear();
    this.#editMaskPlugins.length = 0;
    this.#fluidTextures.clear();
    this.#multiMaterial.dispose();
    for (const material of this.#materials) {
      material.dispose(false, true);
    }
    this.#materials.length = 0;
  }

  #animateFluids(deltaSeconds: number): void {
    this.#waterElapsed += deltaSeconds;
    this.#lavaElapsed += deltaSeconds;

    const waterFrame = Math.floor(this.#waterElapsed / WATER_FRAME_SECONDS);
    if (waterFrame !== this.#waterFrame) {
      this.#waterFrame = waterFrame;
      const texture = this.#fluidTextures.get(BlockTexture.Water);
      if (texture !== undefined) {
        texture.uOffset =
          ((waterFrame * 2) % BLOCK_TEXTURE_SIZE) / BLOCK_TEXTURE_SIZE;
        texture.vOffset =
          (Math.floor(waterFrame / 2) % BLOCK_TEXTURE_SIZE) /
          BLOCK_TEXTURE_SIZE;
      }
    }

    const lavaFrame = Math.floor(this.#lavaElapsed / LAVA_FRAME_SECONDS);
    if (lavaFrame !== this.#lavaFrame) {
      this.#lavaFrame = lavaFrame;
      const texture = this.#fluidTextures.get(BlockTexture.Lava);
      if (texture !== undefined) {
        texture.uOffset =
          (lavaFrame % BLOCK_TEXTURE_SIZE) / BLOCK_TEXTURE_SIZE;
        texture.vOffset =
          (Math.floor(lavaFrame / 3) % BLOCK_TEXTURE_SIZE) /
          BLOCK_TEXTURE_SIZE;
      }
    }
  }
}
