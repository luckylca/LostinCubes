import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  getMeleeDamage,
  ItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
} from '../player/PlayerView';
import type { VoxelWorldData } from '../world/VoxelWorldData';

const MAXIMUM_STALKERS = 10;
const MAXIMUM_HEALTH = 12;
const SPAWN_INTERVAL_SECONDS = 4;
const MINIMUM_SPAWN_RADIUS = 10;
const MAXIMUM_SPAWN_RADIUS = 18;
const DESPAWN_RADIUS = 34;
const MOVE_SPEED = 1.45;
const ATTACK_RADIUS = 1.35;
const ATTACK_DAMAGE = 3;
const ATTACK_COOLDOWN_SECONDS = 1.15;
const PLAYER_ATTACK_REACH = 3.25;
const PLAYER_ATTACK_RADIUS = 0.72;
const PLAYER_ATTACK_COOLDOWN_SECONDS = 0.42;

interface StalkerEntity {
  readonly root: TransformNode;
  readonly bodyMeshes: readonly Mesh[];
  active: boolean;
  health: number;
  x: number;
  y: number;
  z: number;
  attackCooldown: number;
  hurtSeconds: number;
  phase: number;
}

export interface NightStalkerCallbacks {
  readonly onPlayerDamage: (amount: number) => void;
  readonly onDrop: (
    item: ItemTypeValue,
    count: number,
    x: number,
    y: number,
    z: number,
  ) => void;
  readonly onEnemyHit?: (damage: number, killed: boolean) => void;
}

export interface PlayerAttackResult {
  readonly hit: boolean;
  readonly killed: boolean;
  readonly damage: number;
}

function createMaterial(
  name: string,
  scene: Scene,
  diffuse: Color3,
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.ambientColor = diffuse.scale(0.42);
  material.emissiveColor = emissive;
  material.specularColor = Color3.Black();
  material.freeze();
  return material;
}

function addBox(
  name: string,
  parent: TransformNode,
  scene: Scene,
  material: StandardMaterial,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: size[0], height: size[1], depth: size[2] },
    scene,
  );
  mesh.parent = parent;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function isNight(dayTime: number): boolean {
  return dayTime < 0.2 || dayTime > 0.78;
}

export class NightStalkerManager {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #callbacks: NightStalkerCallbacks;
  readonly #bodyMaterial: StandardMaterial;
  readonly #hurtMaterial: StandardMaterial;
  readonly #eyeMaterial: StandardMaterial;
  readonly #entities: StalkerEntity[] = [];
  #spawnElapsed = 0;
  #spawnSequence = 0;
  #playerAttackCooldown = 0;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    callbacks: NightStalkerCallbacks,
  ) {
    this.#scene = scene;
    this.#world = world;
    this.#callbacks = callbacks;
    this.#bodyMaterial = createMaterial(
      'night-stalker-body',
      scene,
      new Color3(0.14, 0.2, 0.17),
      new Color3(0.01, 0.025, 0.018),
    );
    this.#hurtMaterial = createMaterial(
      'night-stalker-hurt',
      scene,
      new Color3(0.56, 0.13, 0.1),
      new Color3(0.16, 0.015, 0.01),
    );
    this.#eyeMaterial = createMaterial(
      'night-stalker-eyes',
      scene,
      new Color3(0.75, 0.07, 0.04),
      new Color3(0.55, 0.025, 0.012),
    );
  }

  public update(player: PlayerState, dayTime: number, stepSeconds: number): void {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return;
    const seconds = Math.min(stepSeconds, 0.1);
    this.#playerAttackCooldown = Math.max(
      0,
      this.#playerAttackCooldown - seconds,
    );

    if (!isNight(dayTime)) {
      this.#spawnElapsed = 0;
      for (const entity of this.#entities) {
        if (entity.active) this.#deactivate(entity);
      }
      return;
    }

    this.#spawnElapsed += seconds;
    if (
      this.#spawnElapsed >= SPAWN_INTERVAL_SECONDS &&
      this.activeCount < MAXIMUM_STALKERS
    ) {
      this.#spawnElapsed %= SPAWN_INTERVAL_SECONDS;
      this.#spawnNear(player);
    }

    for (const entity of this.#entities) {
      if (!entity.active) continue;
      entity.attackCooldown = Math.max(0, entity.attackCooldown - seconds);
      entity.hurtSeconds = Math.max(0, entity.hurtSeconds - seconds);
      const bodyMaterial =
        entity.hurtSeconds > 0 ? this.#hurtMaterial : this.#bodyMaterial;
      for (const mesh of entity.bodyMeshes) mesh.material = bodyMaterial;

      const deltaX = player.position.x - entity.x;
      const deltaZ = player.position.z - entity.z;
      const horizontalDistance = Math.hypot(deltaX, deltaZ);
      if (horizontalDistance > DESPAWN_RADIUS) {
        this.#deactivate(entity);
        continue;
      }

      if (horizontalDistance > ATTACK_RADIUS && horizontalDistance > 0.001) {
        const moveDistance = Math.min(
          horizontalDistance - ATTACK_RADIUS * 0.82,
          MOVE_SPEED * seconds,
        );
        const nextX = entity.x + (deltaX / horizontalDistance) * moveDistance;
        const nextZ = entity.z + (deltaZ / horizontalDistance) * moveDistance;
        const nextY = this.#world.sampleStandingY(nextX, nextZ);
        if (Math.abs(nextY - entity.y) <= 1.05) {
          entity.x = nextX;
          entity.y = nextY;
          entity.z = nextZ;
        }
      } else if (entity.attackCooldown <= 0 && !player.paused) {
        this.#callbacks.onPlayerDamage(ATTACK_DAMAGE);
        entity.attackCooldown = ATTACK_COOLDOWN_SECONDS;
      }

      entity.phase += seconds * 7;
      entity.root.position.set(entity.x, entity.y - 0.34, entity.z);
      entity.root.rotation.y = Math.atan2(deltaX, deltaZ);
      entity.root.rotation.z = Math.sin(entity.phase) * 0.025;
    }
  }

  public attack(
    player: PlayerState,
    heldItem: ItemTypeValue | null,
  ): PlayerAttackResult {
    if (player.paused || this.#playerAttackCooldown > 0) {
      return { hit: false, killed: false, damage: 0 };
    }
    this.#playerAttackCooldown = PLAYER_ATTACK_COOLDOWN_SECONDS;
    const eye = getPlayerEyePosition(player);
    const direction = getPlayerViewDirection(player);
    let target: StalkerEntity | null = null;
    let targetDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.#entities) {
      if (!entity.active) continue;
      const targetX = entity.x;
      const targetY = entity.y + 0.15;
      const targetZ = entity.z;
      const deltaX = targetX - eye.x;
      const deltaY = targetY - eye.y;
      const deltaZ = targetZ - eye.z;
      const projection =
        deltaX * direction.x +
        deltaY * direction.y +
        deltaZ * direction.z;
      if (projection < 0 || projection > PLAYER_ATTACK_REACH) continue;
      const closestX = eye.x + direction.x * projection;
      const closestY = eye.y + direction.y * projection;
      const closestZ = eye.z + direction.z * projection;
      const missDistance = Math.hypot(
        targetX - closestX,
        targetY - closestY,
        targetZ - closestZ,
      );
      if (missDistance > PLAYER_ATTACK_RADIUS || projection >= targetDistance) {
        continue;
      }
      target = entity;
      targetDistance = projection;
    }

    if (target === null) return { hit: false, killed: false, damage: 0 };
    const damage = getMeleeDamage(heldItem);
    target.health -= damage;
    target.hurtSeconds = 0.18;
    const killed = target.health <= 0;
    if (killed) {
      const dropCount = 1 + (this.#spawnSequence % 2);
      this.#callbacks.onDrop(
        ItemType.Coal,
        dropCount,
        target.x,
        target.y,
        target.z,
      );
      if (this.#spawnSequence % 3 === 0) {
        this.#callbacks.onDrop(
          ItemType.Apple,
          1,
          target.x,
          target.y + 0.15,
          target.z,
        );
      }
      this.#deactivate(target);
    }
    this.#callbacks.onEnemyHit?.(damage, killed);
    return { hit: true, killed, damage };
  }

  public spawnAt(worldX: number, worldY: number, worldZ: number): boolean {
    if (this.activeCount >= MAXIMUM_STALKERS) return false;
    const entity = this.#acquire();
    entity.active = true;
    entity.health = MAXIMUM_HEALTH;
    entity.x = worldX;
    entity.y = worldY;
    entity.z = worldZ;
    entity.attackCooldown = 0.45;
    entity.hurtSeconds = 0;
    entity.phase = this.#spawnSequence * 0.77;
    entity.root.position.set(worldX, worldY - 0.34, worldZ);
    entity.root.setEnabled(true);
    this.#spawnSequence += 1;
    return true;
  }

  public get activeCount(): number {
    return this.#entities.reduce(
      (count, entity) => count + (entity.active ? 1 : 0),
      0,
    );
  }

  public dispose(): void {
    for (const entity of this.#entities) entity.root.dispose(false, false);
    this.#entities.length = 0;
    this.#bodyMaterial.dispose();
    this.#hurtMaterial.dispose();
    this.#eyeMaterial.dispose();
  }

  #spawnNear(player: PlayerState): void {
    const phase = this.#spawnSequence + 1;
    const angle = phase * 2.399963229728653;
    const radius =
      MINIMUM_SPAWN_RADIUS +
      ((phase * 7) % 9) / 8 *
        (MAXIMUM_SPAWN_RADIUS - MINIMUM_SPAWN_RADIUS);
    const x = player.position.x + Math.cos(angle) * radius;
    const z = player.position.z + Math.sin(angle) * radius;
    const y = this.#world.sampleStandingY(x, z);
    if (!Number.isFinite(y) || y < 1 || y > 31) return;
    this.spawnAt(x, y, z);
  }

  #acquire(): StalkerEntity {
    const inactive = this.#entities.find((entity) => !entity.active);
    if (inactive !== undefined) return inactive;

    const root = new TransformNode(
      `night-stalker-${String(this.#entities.length)}`,
      this.#scene,
    );
    const bodyMeshes = [
      addBox('stalker-body', root, this.#scene, this.#bodyMaterial, [0.58, 0.78, 0.34], [0, 0.24, 0]),
      addBox('stalker-head', root, this.#scene, this.#bodyMaterial, [0.48, 0.48, 0.48], [0, 0.88, 0]),
      addBox('stalker-left-arm', root, this.#scene, this.#bodyMaterial, [0.18, 0.7, 0.18], [-0.39, 0.28, 0.03]),
      addBox('stalker-right-arm', root, this.#scene, this.#bodyMaterial, [0.18, 0.7, 0.18], [0.39, 0.28, 0.03]),
      addBox('stalker-left-leg', root, this.#scene, this.#bodyMaterial, [0.2, 0.62, 0.22], [-0.16, -0.45, 0]),
      addBox('stalker-right-leg', root, this.#scene, this.#bodyMaterial, [0.2, 0.62, 0.22], [0.16, -0.45, 0]),
    ];
    addBox('stalker-left-eye', root, this.#scene, this.#eyeMaterial, [0.09, 0.08, 0.035], [-0.12, 0.94, 0.25]);
    addBox('stalker-right-eye', root, this.#scene, this.#eyeMaterial, [0.09, 0.08, 0.035], [0.12, 0.94, 0.25]);
    root.setEnabled(false);
    const entity: StalkerEntity = {
      root,
      bodyMeshes,
      active: false,
      health: MAXIMUM_HEALTH,
      x: 0,
      y: 0,
      z: 0,
      attackCooldown: 0,
      hurtSeconds: 0,
      phase: 0,
    };
    this.#entities.push(entity);
    return entity;
  }

  #deactivate(entity: StalkerEntity): void {
    entity.active = false;
    entity.health = 0;
    entity.root.setEnabled(false);
  }
}
