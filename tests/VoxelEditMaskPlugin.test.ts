import { Mesh, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { VoxelEditMaskRegistry } from '../src/world/VoxelEditMaskPlugin';

describe('VoxelEditMaskRegistry', () => {
  const engines: NullEngine[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
  });

  it('binds a removed voxel to the exact old chunk mesh', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const mesh = new Mesh('voxel-chunk-0,0', scene);
    const registry = new VoxelEditMaskRegistry(scene);

    registry.maskWorldVoxel(3, 5, 4);

    expect(registry.masksForMesh(mesh.uniqueId)).toEqual([
      { x: 3, y: 5, z: 4 },
    ]);
    registry.clear();
  });

  it('does not apply old masks to a replacement chunk mesh', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const oldMesh = new Mesh('voxel-chunk-0,0', scene);
    const registry = new VoxelEditMaskRegistry(scene);

    registry.maskWorldVoxel(2, 6, 2);
    const replacement = new Mesh('voxel-chunk-0,0', scene);

    expect(registry.masksForMesh(oldMesh.uniqueId)).toHaveLength(1);
    expect(registry.masksForMesh(replacement.uniqueId)).toHaveLength(0);
    registry.clear();
  });

  it('releases mask state when the old mesh is disposed', () => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    const mesh = new Mesh('voxel-chunk-0,0', scene);
    const registry = new VoxelEditMaskRegistry(scene);

    registry.maskWorldVoxel(1, 2, 3);
    expect(registry.masksForMesh(mesh.uniqueId)).toHaveLength(1);

    mesh.dispose(false, false);

    expect(registry.masksForMesh(mesh.uniqueId)).toHaveLength(0);
    registry.clear();
  });
});
