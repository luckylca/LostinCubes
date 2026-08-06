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

/** Shared nearest-neighbor pixel materials used by every streamed chunk. */
export class VoxelMaterialLibrary {
  readonly #multiMaterial: MultiMaterial;
  readonly #materials: StandardMaterial[] = [];

  public constructor(scene: Scene) {
    this.#multiMaterial = new MultiMaterial('voxel-world-materials', scene);

    for (const textureKind of BLOCK_TEXTURE_KINDS) {
      const source = getBlockTexturePixels(textureKind);
      const texture = RawTexture.CreateRGBATexture(
        source.pixels,
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

      const material = new StandardMaterial(
        `voxel-material-${String(textureKind)}`,
        scene,
      );
      material.diffuseTexture = texture;
      material.diffuseColor = Color3.White();
      material.specularColor = Color3.Black();
      material.backFaceCulling = !DOUBLE_SIDED_TEXTURES.has(textureKind);
      material.emissiveColor =
        textureKind === BlockTexture.Torch
          ? new Color3(0.62, 0.31, 0.05)
          : textureKind === BlockTexture.Lava
            ? new Color3(0.54, 0.16, 0.025)
            : textureKind === BlockTexture.RuneStone
              ? new Color3(0.035, 0.1, 0.065)
              : new Color3(0.018, 0.022, 0.02);

      const blended = BLENDED_TEXTURES.has(textureKind);
      if (blended) {
        material.useAlphaFromDiffuseTexture = true;
        material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
        material.alphaCutOff = 0.02;
        material.needDepthPrePass = true;
        material.separateCullingPass = true;
        material.disableDepthWrite = false;
        // Fluid opacity is authored once in the texture. Multiplying it by a
        // second material alpha made water nearly invisible and exaggerated
        // transparent-face ordering artifacts.
        material.alpha = 1;
      } else if (source.hasAlpha) {
        material.useAlphaFromDiffuseTexture = true;
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
        material.alphaCutOff = 0.42;
      }

      // Frozen alpha-blended materials with a depth pre-pass can retain stale
      // transparent render state on some Chromium/WebGL paths. Only the stable
      // opaque and alpha-tested materials are frozen.
      if (!blended) material.freeze();
      this.#materials.push(material);
      this.#multiMaterial.subMaterials.push(material);
    }
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

  public dispose(): void {
    this.#multiMaterial.dispose();
    for (const material of this.#materials) {
      material.dispose(false, true);
    }
    this.#materials.length = 0;
  }
}
