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
  BLOCK_TEXTURE_COUNT,
  BLOCK_TEXTURE_SIZE,
  BlockTexture,
  getBlockTexturePixels,
} from './BlockTextureLibrary';

/** Shared nearest-neighbor pixel materials used by every streamed chunk. */
export class VoxelMaterialLibrary {
  readonly #multiMaterial: MultiMaterial;
  readonly #materials: StandardMaterial[] = [];

  public constructor(scene: Scene) {
    this.#multiMaterial = new MultiMaterial('voxel-world-materials', scene);

    for (let textureId = 0; textureId < BLOCK_TEXTURE_COUNT; textureId += 1) {
      const textureKind = textureId as BlockTexture;
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
      texture.name = `voxel-texture-${String(textureId)}`;
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 1;
      texture.hasAlpha = source.hasAlpha;

      const material = new StandardMaterial(
        `voxel-material-${String(textureId)}`,
        scene,
      );
      material.diffuseTexture = texture;
      material.diffuseColor = Color3.White();
      material.specularColor = Color3.Black();
      material.emissiveColor =
        textureKind === BlockTexture.RuneStone
          ? new Color3(0.035, 0.1, 0.065)
          : new Color3(0.018, 0.022, 0.02);
      material.backFaceCulling = textureKind !== BlockTexture.OakLeaves;
      if (source.hasAlpha) {
        material.useAlphaFromDiffuseTexture = true;
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
        material.alphaCutOff = 0.42;
      }
      material.freeze();
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
