import {
  Color3,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';
import { getBlockItemColor } from './BlockVisuals';

const MAXIMUM_PARTICLES = 48;
const PARTICLE_SIZE = 0.11;
const PARTICLE_LIFETIME = 0.52;
const GRAVITY = -14;
const PARTICLE_BLOCKS: readonly BlockTypeValue[] = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Cobblestone,
  BlockType.RuneStone,
  BlockType.OakLog,
  BlockType.OakLeaves,
  BlockType.OakPlanks,
  BlockType.CraftingTable,
  BlockType.CoalOre,
  BlockType.IronOre,
  BlockType.Furnace,
  BlockType.Torch,
];

interface Particle {
  readonly mesh: Mesh;
  active: boolean;
  age: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
}

function colorFromTuple(color: readonly [number, number, number]): Color3 {
  return new Color3(color[0], color[1], color[2]);
}

function createMaterial(
  block: BlockTypeValue,
  scene: Scene,
): StandardMaterial {
  const color = colorFromTuple(getBlockItemColor(block));
  const material = new StandardMaterial(`break-particle-${String(block)}`, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(
    block === BlockType.Torch
      ? 0.4
      : block === BlockType.RuneStone
        ? 0.22
        : 0.05,
  );
  material.specularColor = Color3.Black();
  material.freeze();
  return material;
}

/** Small fixed-capacity cube particle pool used for block break feedback. */
export class VoxelBreakEffects {
  readonly #scene: Scene;
  readonly #materials: ReadonlyMap<BlockTypeValue, StandardMaterial>;
  readonly #particles: Particle[] = [];
  #sequence = 0;

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#materials = new Map(
      PARTICLE_BLOCKS.map((block) => [block, createMaterial(block, scene)]),
    );
  }

  public spawn(
    block: BlockTypeValue,
    worldX: number,
    worldY: number,
    worldZ: number,
    count = 9,
  ): void {
    const material = this.#materials.get(block);
    if (material === undefined) return;
    for (let index = 0; index < count; index += 1) {
      const particle = this.#acquireParticle();
      if (particle === null) return;
      const phase = this.#sequence * 1.618 + index * 2.41;
      this.#sequence += 1;
      const horizontalSpeed = 0.75 + (index % 3) * 0.22;
      particle.active = true;
      particle.age = 0;
      particle.velocityX = Math.cos(phase) * horizontalSpeed;
      particle.velocityY = 1.7 + (index % 4) * 0.25;
      particle.velocityZ = Math.sin(phase) * horizontalSpeed;
      particle.mesh.material = material;
      particle.mesh.position.set(
        worldX + Math.cos(phase * 0.7) * 0.22,
        worldY + Math.sin(phase * 1.1) * 0.18,
        worldZ + Math.sin(phase * 0.7) * 0.22,
      );
      particle.mesh.rotation.set(phase, phase * 0.7, phase * 0.3);
      particle.mesh.setEnabled(true);
    }
  }

  public update(frameSeconds: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
    const seconds = Math.min(frameSeconds, 0.1);
    for (const particle of this.#particles) {
      if (!particle.active) continue;
      particle.age += seconds;
      if (particle.age >= PARTICLE_LIFETIME) {
        particle.active = false;
        particle.mesh.setEnabled(false);
        continue;
      }
      particle.velocityY += GRAVITY * seconds;
      particle.mesh.position.x += particle.velocityX * seconds;
      particle.mesh.position.y += particle.velocityY * seconds;
      particle.mesh.position.z += particle.velocityZ * seconds;
      particle.mesh.rotation.x += seconds * 5;
      particle.mesh.rotation.y += seconds * 7;
      const remaining = 1 - particle.age / PARTICLE_LIFETIME;
      particle.mesh.scaling.setAll(Math.max(remaining, 0.2));
    }
  }

  public dispose(): void {
    for (const particle of this.#particles) particle.mesh.dispose(false, false);
    this.#particles.length = 0;
    for (const material of this.#materials.values()) material.dispose();
  }

  #acquireParticle(): Particle | null {
    const inactive = this.#particles.find((particle) => !particle.active);
    if (inactive !== undefined) {
      inactive.mesh.scaling.setAll(1);
      return inactive;
    }
    if (this.#particles.length >= MAXIMUM_PARTICLES) return null;
    const mesh = MeshBuilder.CreateBox(
      `voxel-break-particle-${String(this.#particles.length)}`,
      { size: PARTICLE_SIZE },
      this.#scene,
    );
    mesh.isPickable = false;
    mesh.setEnabled(false);
    const particle: Particle = {
      mesh,
      active: false,
      age: 0,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
    };
    this.#particles.push(particle);
    return particle;
  }
}
