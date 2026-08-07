import type { Vector3 } from '@babylonjs/core';

declare module '@babylonjs/core' {
  /**
   * Creature body meshes are always parented to TransformNode instances by
   * ClassicEntityManager. Babylon exposes Mesh.parent as the wider Node type,
   * so declare the TransformNode surface used by the visual adapter.
   */
  interface Node {
    getAbsolutePosition(): Vector3;
    readonly rotation: Vector3;
  }
}
