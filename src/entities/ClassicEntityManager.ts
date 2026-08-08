import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { PlayerState, VectorState } from '../game/session/GameSession';
import {
  getMeleeDamage,
  getRangedDamage,
  ItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
} from '../player/PlayerView';
import { getBlockDefinition } from '../world/BlockRegistry';
import { BlockType } from '../world/BlockType';
import type { VoxelWorldData } from '../world/VoxelWorldData';
import {
  loadEntitySnapshots,
  saveEntitySnapshots,
} from './EntityPersistence';
import {
  EntityRegistry,
  type EntityKind,
  type EntitySnapshot,
  type EntityVector,
} from './EntityRegistry';

const HOSTILE_KINDS = new Set<EntityKind>([
  'zombie',
  'skeleton',
  'spider',
  'creeper',
]);
const PASSIVE_KINDS = new Set<EntityKind>(['cow', 'pig', 'sheep']);
const MAXIMUM_HOSTILES = 28;
const MAXIMUM_PASSIVES = 18;
const HOSTILE_SPAWN_INTERVAL = 0.75;
const PASSIVE_SPAWN_INTERVAL = 1.5;
const MINIMUM_SPAWN_RADIUS = 8;
const MAXIMUM_SPAWN_RADIUS = 20;
const DESPAWN_RADIUS = 46;
const PLAYER_ATTACK_REACH = 3.25;
const PLAYER_ATTACK_COOLDOWN_SECONDS = 0.42;
const SPAM_ATTACK_DAMAGE_SCALE = 0.35;
const ATTACK_HITBOX_PADDING = 0.12;
const ATTACK_OCCLUSION_STEP = 0.12;
const ARROW_GRAVITY = 7.2;
const ARROW_LIFETIME_SECONDS = 14;
const TNT_FUSE_SECONDS = 4;
const CREEPER_FUSE_SECONDS = 1.5;
const EXPLOSION_RADIUS = 3.4;
const EXPLOSION_VISUAL_SECONDS = 0.58;
const DAYLIGHT_BURN_DAMAGE_PER_SECOND = 2;

interface KindDefinition {
  readonly health: number;
  readonly speed: number;
  readonly damage: number;
  readonly attackRadius: number;
  readonly attackCooldown: number;
  readonly scale: readonly [number, number, number];
  /** Offset from the player-style standing point to this model's actual root. */
  readonly standingOffset: number;
  readonly color: Color3;
  readonly eyeColor: Color3;
}

const KINDS: Readonly<
  Record<Exclude<EntityKind, 'arrow' | 'tnt' | 'dropped-item'>, KindDefinition>
> = {
  zombie: {
    health: 20,
    speed: 1.08,
    damage: 3,
    attackRadius: 1.3,
    attackCooldown: 1.1,
    scale: [0.62, 1.72, 0.42],
    standingOffset: 0.06,
    color: new Color3(0.2, 0.46, 0.27),
    eyeColor: new Color3(0.08, 0.1, 0.06),
  },
  skeleton: {
    health: 20,
    speed: 0.82,
    damage: 4,
    attackRadius: 9.5,
    attackCooldown: 2.1,
    scale: [0.5, 1.75, 0.34],
    standingOffset: 0.06,
    color: new Color3(0.72, 0.72, 0.66),
    eyeColor: new Color3(0.05, 0.05, 0.04),
  },
  spider: {
    health: 16,
    speed: 1.58,
    damage: 2,
    attackRadius: 1.35,
    attackCooldown: 0.85,
    scale: [1.05, 0.56, 0.78],
    // sampleStandingY includes a 0.9 player-foot offset. The low spider model
    // only extends ~0.2 below its root, so it previously hovered visibly.
    standingOffset: -0.68,
    color: new Color3(0.16, 0.12, 0.1),
    eyeColor: new Color3(0.74, 0.08, 0.03),
  },
  creeper: {
    health: 20,
    speed: 0.9,
    damage: 0,
    attackRadius: 2.65,
    attackCooldown: 0,
    scale: [0.58, 1.65, 0.48],
    standingOffset: -0.16,
    color: new Color3(0.23, 0.62, 0.27),
    eyeColor: new Color3(0.02, 0.05, 0.02),
  },
  cow: {
    health: 10,
    speed: 0.58,
    damage: 0,
    attackRadius: 0,
    attackCooldown: 0,
    scale: [0.94, 1.0, 1.2],
    standingOffset: -0.18,
    color: new Color3(0.35, 0.2, 0.12),
    eyeColor: new Color3(0.05, 0.04, 0.03),
  },
  pig: {
    health: 10,
    speed: 0.62,
    damage: 0,
    attackRadius: 0,
    attackCooldown: 0,
    scale: [0.85, 0.78, 1.0],
    standingOffset: -0.22,
    color: new Color3(0.76, 0.42, 0.45),
    eyeColor: new Color3(0.09, 0.05, 0.05),
  },
  sheep: {
    health: 8,
    speed: 0.55,
    damage: 0,
    attackRadius: 0,
    attackCooldown: 0,
    scale: [0.9, 0.92, 1.04],
    standingOffset: -0.18,
    color: new Color3(0.83, 0.82, 0.75),
    eyeColor: new Color3(0.08, 0.07, 0.06),
  },
};

interface EntityVisual {
  readonly root: TransformNode;
  readonly body: Mesh;
  readonly material: StandardMaterial;
  readonly hurtMaterial: StandardMaterial;
  hurtSeconds: number;
}

interface ExplosionParticle {
  readonly mesh: Mesh;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
}

interface ExplosionVisual {
  readonly wave: Mesh;
  readonly particles: ExplosionParticle[];
  readonly radius: number;
  elapsed: number;
}

export interface ClassicEntityCallbacks {
  readonly onPlayerDamage: (amount: number, source?: VectorState) => void;
  readonly onDrop: (
    item: ItemTypeValue,
    count: number,
    x: number,
    y: number,
    z: number,
  ) => void;
  readonly onEntityHit?: (damage: number, killed: boolean) => void;
  readonly onBlockChanged?: (
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => void;
}

export interface PlayerAttackResult {
  readonly hit: boolean;
  readonly killed: boolean;
  readonly damage: number;
}

function makeMaterial(
  name: string,
  scene: Scene,
  color: Color3,
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color.scale(0.46);
  material.emissiveColor = emissive;
  material.specularColor = Color3.Black();
  return material;
}

function isDay(dayTime: number): boolean {
  return dayTime >= 0.22 && dayTime <= 0.76;
}

function distanceSquared(a: EntityVector, b: EntityVector): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function hostileDefinition(kind: EntityKind): KindDefinition | null {
  return kind === 'zombie' ||
    kind === 'skeleton' ||
    kind === 'spider' ||
    kind === 'creeper'
    ? KINDS[kind]
    : null;
}

function creatureDefinition(kind: EntityKind): KindDefinition | null {
  return kind === 'zombie' ||
    kind === 'skeleton' ||
    kind === 'spider' ||
    kind === 'creeper' ||
    kind === 'cow' ||
    kind === 'pig' ||
    kind === 'sheep'
    ? KINDS[kind]
    : null;
}

/** Returns nearest positive ray distance through an axis-aligned box. */
export function rayEntityAabbDistance(
  origin: EntityVector,
  direction: EntityVector,
  minimum: EntityVector,
  maximum: EntityVector,
  maximumDistance: number,
): number | null {
  let near = 0;
  let far = maximumDistance;
  for (const axis of ['x', 'y', 'z'] as const) {
    const velocity = direction[axis];
    const start = origin[axis];
    if (Math.abs(velocity) < 1e-8) {
      if (start < minimum[axis] || start > maximum[axis]) return null;
      continue;
    }
    const inverse = 1 / velocity;
    let first = (minimum[axis] - start) * inverse;
    let second = (maximum[axis] - start) * inverse;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return near >= 0 && near <= maximumDistance ? near : null;
}

export class ClassicEntityManager {
  readonly #scene: Scene;
  readonly #world: VoxelWorldData;
  readonly #worldId: string;
  readonly #storage: Storage | null;
  readonly #callbacks: ClassicEntityCallbacks;
  readonly #registry = new EntityRegistry();
  readonly #visuals = new Map<string, EntityVisual>();
  readonly #projectileMaterial: StandardMaterial;
  readonly #tntMaterial: StandardMaterial;
  readonly #explosionMaterial: StandardMaterial;
  readonly #shockwaveMaterial: StandardMaterial;
  readonly #explosions: ExplosionVisual[] = [];
  #hostileSpawnElapsed = 0;
  #passiveSpawnElapsed = 0;
  #sequence = 0;
  #playerAttackCooldown = 0;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    worldId: string,
    storage: Storage | null,
    callbacks: ClassicEntityCallbacks,
  ) {
    this.#scene = scene;
    this.#world = world;
    this.#worldId = worldId;
    this.#storage = storage;
    this.#callbacks = callbacks;
    this.#projectileMaterial = makeMaterial(
      'entity-arrow',
      scene,
      new Color3(0.74, 0.69, 0.57),
    );
    this.#tntMaterial = makeMaterial(
      'entity-tnt',
      scene,
      new Color3(0.72, 0.08, 0.06),
      new Color3(0.08, 0.01, 0.005),
    );
    this.#explosionMaterial = makeMaterial(
      'entity-explosion-fragments',
      scene,
      new Color3(0.95, 0.48, 0.08),
      new Color3(0.9, 0.22, 0.03),
    );
    this.#explosionMaterial.disableLighting = true;
    this.#shockwaveMaterial = makeMaterial(
      'entity-explosion-shockwave',
      scene,
      new Color3(1, 0.78, 0.34),
      new Color3(1, 0.42, 0.08),
    );
    this.#shockwaveMaterial.disableLighting = true;
    this.#shockwaveMaterial.wireframe = true;
    this.#shockwaveMaterial.alpha = 0.68;
    this.#registry.restore(loadEntitySnapshots(worldId, storage));
    for (const entity of this.#registry.snapshots) this.#ensureVisual(entity);
  }

  public update(player: PlayerState, dayTime: number, stepSeconds: number): void {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return;
    const seconds = Math.min(stepSeconds, 0.1);
    this.#playerAttackCooldown = Math.max(
      this.#playerAttackCooldown - seconds,
      0,
    );
    this.#registry.advanceAge(seconds);
    this.#hostileSpawnElapsed += seconds;
    this.#passiveSpawnElapsed += seconds;

    if (
      this.#hostileSpawnElapsed >= HOSTILE_SPAWN_INTERVAL &&
      this.hostileCount < MAXIMUM_HOSTILES
    ) {
      this.#hostileSpawnElapsed %= HOSTILE_SPAWN_INTERVAL;
      this.#trySpawnHostile(player, dayTime);
    }
    if (
      this.#passiveSpawnElapsed >= PASSIVE_SPAWN_INTERVAL &&
      this.passiveCount < MAXIMUM_PASSIVES
    ) {
      this.#passiveSpawnElapsed %= PASSIVE_SPAWN_INTERVAL;
      this.#trySpawnPassive(player, dayTime);
    }

    for (const snapshot of this.#registry.snapshots) {
      if (snapshot.kind === 'arrow') {
        this.#updateArrow(snapshot, player, seconds);
      } else if (snapshot.kind === 'tnt') {
        this.#updateTnt(snapshot, player);
      } else if (HOSTILE_KINDS.has(snapshot.kind)) {
        this.#updateHostile(snapshot, player, dayTime, seconds);
      } else if (PASSIVE_KINDS.has(snapshot.kind)) {
        this.#updatePassive(snapshot, player, seconds);
      }
    }
    this.#syncVisuals(seconds);
    this.#updateExplosionVisuals(seconds);
  }

  public attack(
    player: PlayerState,
    heldItem: ItemTypeValue | null,
  ): PlayerAttackResult {
    if (player.paused) return { hit: false, killed: false, damage: 0 };

    const eye = getPlayerEyePosition(player);
    const direction = getPlayerViewDirection(player);
    let target: EntitySnapshot | null = null;
    let targetDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.#registry.queryRadius(eye, PLAYER_ATTACK_REACH + 2)) {
      const definition = creatureDefinition(entity.kind);
      if (definition === null) continue;
      const halfX = definition.scale[0] * 0.5 + ATTACK_HITBOX_PADDING;
      const halfZ = definition.scale[2] * 0.5 + ATTACK_HITBOX_PADDING;
      // Slightly generous vertical bounds match the multipart presentation
      // instead of testing one point near the entity root.
      const halfY = Math.max(definition.scale[1] * 0.58, 0.36);
      const hitDistance = rayEntityAabbDistance(
        eye,
        direction,
        {
          x: entity.position.x - halfX,
          y: entity.position.y - halfY,
          z: entity.position.z - halfZ,
        },
        {
          x: entity.position.x + halfX,
          y: entity.position.y + halfY,
          z: entity.position.z + halfZ,
        },
        PLAYER_ATTACK_REACH,
      );
      if (hitDistance === null || hitDistance >= targetDistance) continue;
      if (this.#rayOccluded(eye, direction, hitDistance)) continue;
      target = entity;
      targetDistance = hitDistance;
    }

    if (target === null) return { hit: false, killed: false, damage: 0 };

    const damageScale =
      this.#playerAttackCooldown > 0 ? SPAM_ATTACK_DAMAGE_SCALE : 1;
    const damage = Math.max(1, Math.round(getMeleeDamage(heldItem) * damageScale));
    this.#playerAttackCooldown = PLAYER_ATTACK_COOLDOWN_SECONDS;
    const killed = this.#damageEntity(
      target.id,
      damage,
      direction.x * 0.34,
      direction.z * 0.34,
    );
    this.#callbacks.onEntityHit?.(damage, killed);
    return { hit: true, killed, damage };
  }

  public shootArrow(player: PlayerState, heldItem: ItemTypeValue | null): boolean {
    const damage = getRangedDamage(heldItem);
    if (damage <= 0 || player.paused) return false;
    const eye = getPlayerEyePosition(player);
    const direction = getPlayerViewDirection(player);
    const speed = 17;
    const arrow = this.#registry.spawn({
      kind: 'arrow',
      position: {
        x: eye.x + direction.x * 0.55,
        y: eye.y + direction.y * 0.55,
        z: eye.z + direction.z * 0.55,
      },
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed,
      },
      maximumHealth: 1,
      health: 1,
      collisionRadius: 0.16,
      ownerId: 'player',
      state: { damage },
    });
    if (arrow !== null) this.#ensureVisual(arrow);
    return arrow !== null;
  }

  public primeTnt(position: EntityVector): boolean {
    const tnt = this.#registry.spawn({
      kind: 'tnt',
      position,
      maximumHealth: 1,
      health: 1,
      collisionRadius: 0.48,
      persistent: true,
      state: { fuse: TNT_FUSE_SECONDS },
    });
    if (tnt !== null) this.#ensureVisual(tnt);
    return tnt !== null;
  }

  public save(): void {
    saveEntitySnapshots(
      this.#worldId,
      this.#registry.persistentSnapshots,
      this.#storage,
    );
  }

  public get activeCount(): number {
    return this.#registry.size;
  }

  public get hostileCount(): number {
    let count = 0;
    for (const kind of HOSTILE_KINDS) count += this.#registry.countByKind(kind);
    return count;
  }

  public get passiveCount(): number {
    let count = 0;
    for (const kind of PASSIVE_KINDS) count += this.#registry.countByKind(kind);
    return count;
  }

  public dispose(): void {
    this.save();
    for (const visual of this.#visuals.values()) {
      visual.root.dispose(false, false);
      visual.material.dispose();
      visual.hurtMaterial.dispose();
    }
    this.#visuals.clear();
    for (const explosion of this.#explosions.splice(0)) {
      explosion.wave.dispose(false, false);
      for (const particle of explosion.particles) {
        particle.mesh.dispose(false, false);
      }
    }
    this.#projectileMaterial.dispose();
    this.#tntMaterial.dispose();
    this.#explosionMaterial.dispose();
    this.#shockwaveMaterial.dispose();
    this.#registry.clear();
  }

  #rayOccluded(
    origin: EntityVector,
    direction: EntityVector,
    targetDistance: number,
  ): boolean {
    for (
      let distance = ATTACK_OCCLUSION_STEP;
      distance < targetDistance - 0.08;
      distance += ATTACK_OCCLUSION_STEP
    ) {
      if (
        this.#world.isSolidAt(
          Math.floor(origin.x + direction.x * distance + 0.5),
          Math.floor(origin.y + direction.y * distance + 0.5),
          Math.floor(origin.z + direction.z * distance + 0.5),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  #trySpawnHostile(player: PlayerState, dayTime: number): void {
    const kind = (['zombie', 'skeleton', 'spider', 'creeper'] as const)[
      this.#sequence % 4
    ];
    this.#sequence += 1;
    if (kind === undefined) return;
    const position = this.#spawnCandidate(player, this.#sequence);
    if (position === null) return;
    const exposed = this.#isExposedToSky(position);
    const lightLevel = exposed && isDay(dayTime) ? 15 : 0;
    if (lightLevel > 7) return;
    this.#spawnCreature(kind, position, false);
  }

  #trySpawnPassive(player: PlayerState, dayTime: number): void {
    if (!isDay(dayTime)) return;
    const kind = (['cow', 'pig', 'sheep'] as const)[this.#sequence % 3];
    this.#sequence += 1;
    if (kind === undefined) return;
    const position = this.#spawnCandidate(player, this.#sequence * 3);
    if (position === null || !this.#isExposedToSky(position)) return;
    this.#spawnCreature(kind, position, true);
  }

  #spawnCreature(
    kind: Exclude<EntityKind, 'arrow' | 'tnt' | 'dropped-item'>,
    standingPosition: EntityVector,
    persistent: boolean,
  ): void {
    const definition = KINDS[kind];
    const position = {
      x: standingPosition.x,
      y: standingPosition.y + definition.standingOffset,
      z: standingPosition.z,
    };
    const entity = this.#registry.spawn({
      kind,
      position,
      maximumHealth: definition.health,
      health: definition.health,
      collisionRadius:
        Math.max(definition.scale[0], definition.scale[2]) * 0.45,
      persistent,
      state: {
        attackCooldown: 0.3,
        fuse: 0,
        burnProgress: 0,
        wanderPhase: this.#sequence * 0.73,
      },
    });
    if (entity !== null) this.#ensureVisual(entity);
  }

  #spawnCandidate(player: PlayerState, sequence: number): EntityVector | null {
    const angle = sequence * 2.399963229728653;
    const radius =
      MINIMUM_SPAWN_RADIUS +
      (((sequence * 7) % 13) / 12) *
        (MAXIMUM_SPAWN_RADIUS - MINIMUM_SPAWN_RADIUS);
    const x = player.position.x + Math.cos(angle) * radius;
    const z = player.position.z + Math.sin(angle) * radius;
    const y = this.#world.sampleStandingY(x, z);
    if (!Number.isFinite(y) || y < 1 || y > 31) return null;
    if (Math.abs(y - player.position.y) > 12) return null;
    return { x, y, z };
  }

  #updateHostile(
    entity: EntitySnapshot,
    player: PlayerState,
    dayTime: number,
    seconds: number,
  ): void {
    if (
      distanceSquared(entity.position, player.position) >
      DESPAWN_RADIUS * DESPAWN_RADIUS
    ) {
      this.#removeEntity(entity.id, false);
      return;
    }
    const definition = hostileDefinition(entity.kind);
    if (definition === null) return;
    let health = entity.health;
    let attackCooldown = Number(entity.state.attackCooldown ?? 0);
    let fuse = Number(entity.state.fuse ?? 0);
    let burnProgress = Number(entity.state.burnProgress ?? 0);

    if (
      (entity.kind === 'zombie' || entity.kind === 'skeleton') &&
      isDay(dayTime) &&
      this.#isExposedToSky(entity.position)
    ) {
      burnProgress += seconds * DAYLIGHT_BURN_DAMAGE_PER_SECOND;
      if (burnProgress >= 1) {
        const damage = Math.floor(burnProgress);
        burnProgress -= damage;
        health -= damage;
      }
    } else {
      burnProgress = 0;
    }
    if (health <= 0) {
      this.#killEntity({ ...entity, health });
      return;
    }

    attackCooldown = Math.max(attackCooldown - seconds, 0);
    const deltaX = player.position.x - entity.position.x;
    const deltaZ = player.position.z - entity.position.z;
    const horizontalDistance = Math.hypot(deltaX, deltaZ);
    let position = entity.position;

    if (entity.kind === 'skeleton') {
      if (horizontalDistance < 5.5 && horizontalDistance > 0.01) {
        position = this.#moveEntity(
          entity,
          -deltaX,
          -deltaZ,
          definition.speed * seconds,
        );
      } else if (horizontalDistance > 10 && horizontalDistance > 0.01) {
        position = this.#moveEntity(
          entity,
          deltaX,
          deltaZ,
          definition.speed * seconds,
        );
      }
      if (
        horizontalDistance <= definition.attackRadius &&
        attackCooldown <= 0 &&
        !player.paused
      ) {
        this.#shootSkeletonArrow(entity, player, definition.damage);
        attackCooldown = definition.attackCooldown;
      }
    } else if (entity.kind === 'creeper') {
      if (horizontalDistance <= definition.attackRadius) {
        fuse += seconds;
        if (fuse >= CREEPER_FUSE_SECONDS) {
          this.#explode(entity.position, player, EXPLOSION_RADIUS, entity.id);
          return;
        }
      } else {
        fuse = Math.max(fuse - seconds * 1.5, 0);
        position = this.#moveEntity(
          entity,
          deltaX,
          deltaZ,
          definition.speed * seconds,
        );
      }
    } else {
      if (horizontalDistance > definition.attackRadius) {
        position = this.#moveEntity(
          entity,
          deltaX,
          deltaZ,
          definition.speed * seconds,
        );
      } else if (attackCooldown <= 0 && !player.paused) {
        this.#callbacks.onPlayerDamage(definition.damage, entity.position);
        attackCooldown = definition.attackCooldown;
      }
    }

    this.#registry.update(entity.id, {
      position,
      health,
      state: { ...entity.state, attackCooldown, fuse, burnProgress },
    });
  }

  #updatePassive(
    entity: EntitySnapshot,
    player: PlayerState,
    seconds: number,
  ): void {
    if (
      distanceSquared(entity.position, player.position) >
      DESPAWN_RADIUS * DESPAWN_RADIUS
    ) {
      if (!entity.persistent) this.#removeEntity(entity.id, false);
      return;
    }
    const definition = KINDS[entity.kind as 'cow' | 'pig' | 'sheep'];
    const phase = Number(entity.state.wanderPhase ?? 0) + seconds * 0.45;
    const directionX = Math.cos(phase * 1.7);
    const directionZ = Math.sin(phase * 1.23);
    const position = this.#moveEntity(
      entity,
      directionX,
      directionZ,
      definition.speed * seconds * 0.42,
    );
    this.#registry.update(entity.id, {
      position,
      state: { ...entity.state, wanderPhase: phase },
    });
  }

  #moveEntity(
    entity: EntitySnapshot,
    deltaX: number,
    deltaZ: number,
    moveDistance: number,
  ): EntityVector {
    const definition = creatureDefinition(entity.kind);
    if (definition === null) return entity.position;
    const length = Math.hypot(deltaX, deltaZ);
    if (length <= 0.001) return entity.position;
    const nextX = entity.position.x + (deltaX / length) * moveDistance;
    const nextZ = entity.position.z + (deltaZ / length) * moveDistance;
    const nextY =
      this.#world.sampleStandingY(nextX, nextZ) + definition.standingOffset;
    if (!Number.isFinite(nextY) || Math.abs(nextY - entity.position.y) > 1.05) {
      return entity.position;
    }
    return { x: nextX, y: nextY, z: nextZ };
  }

  #shootSkeletonArrow(
    skeleton: EntitySnapshot,
    player: PlayerState,
    damage: number,
  ): void {
    const origin = {
      x: skeleton.position.x,
      y: skeleton.position.y + 0.65,
      z: skeleton.position.z,
    };
    const delta = {
      x: player.position.x - origin.x,
      y: player.position.y + 0.35 - origin.y,
      z: player.position.z - origin.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (length <= 0.001) return;
    const speed = 12;
    const arrow = this.#registry.spawn({
      kind: 'arrow',
      position: origin,
      velocity: {
        x: (delta.x / length) * speed,
        y: (delta.y / length) * speed + 0.8,
        z: (delta.z / length) * speed,
      },
      maximumHealth: 1,
      health: 1,
      collisionRadius: 0.16,
      ownerId: skeleton.id,
      state: { damage },
    });
    if (arrow !== null) this.#ensureVisual(arrow);
  }

  #updateArrow(
    entity: EntitySnapshot,
    player: PlayerState,
    seconds: number,
  ): void {
    if (entity.ageSeconds >= ARROW_LIFETIME_SECONDS) {
      this.#removeEntity(entity.id, false);
      return;
    }
    const velocity = {
      x: entity.velocity.x,
      y: entity.velocity.y - ARROW_GRAVITY * seconds,
      z: entity.velocity.z,
    };
    const position = {
      x: entity.position.x + velocity.x * seconds,
      y: entity.position.y + velocity.y * seconds,
      z: entity.position.z + velocity.z * seconds,
    };
    if (
      this.#world.isSolidAt(
        Math.floor(position.x + 0.5),
        Math.floor(position.y + 0.5),
        Math.floor(position.z + 0.5),
      )
    ) {
      this.#removeEntity(entity.id, false);
      return;
    }
    const damage = Math.max(Number(entity.state.damage ?? 4), 1);
    if (entity.ownerId === 'player') {
      const candidates = this.#registry.queryRadius(position, 0.7);
      const target = candidates.find(
        (candidate) =>
          candidate.id !== entity.id &&
          candidate.kind !== 'arrow' &&
          candidate.kind !== 'tnt' &&
          candidate.kind !== 'dropped-item',
      );
      if (target !== undefined) {
        this.#damageEntity(
          target.id,
          damage,
          velocity.x * 0.02,
          velocity.z * 0.02,
        );
        this.#removeEntity(entity.id, false);
        return;
      }
    } else if (
      distanceSquared(position, player.position) <= 0.72 * 0.72 &&
      !player.paused
    ) {
      this.#callbacks.onPlayerDamage(damage, entity.position);
      this.#removeEntity(entity.id, false);
      return;
    }
    this.#registry.update(entity.id, { position, velocity });
  }

  #updateTnt(entity: EntitySnapshot, player: PlayerState): void {
    const fuse = Math.max(TNT_FUSE_SECONDS - entity.ageSeconds, 0);
    if (fuse <= 0) {
      this.#explode(entity.position, player, EXPLOSION_RADIUS, entity.id);
      return;
    }
    this.#registry.update(entity.id, {
      state: { ...entity.state, fuse },
    });
  }

  #explode(
    origin: EntityVector,
    player: PlayerState,
    radius: number,
    sourceId: string,
  ): void {
    this.#spawnExplosionVisual(origin, radius);

    const playerDistance = Math.sqrt(distanceSquared(origin, player.position));
    if (playerDistance < radius * 1.7 && !player.paused) {
      const exposure = 1 - playerDistance / (radius * 1.7);
      this.#callbacks.onPlayerDamage(
        Math.max(1, Math.ceil(exposure * 12)),
        origin,
      );
    }
    for (const entity of this.#registry.queryRadius(origin, radius * 1.6)) {
      if (entity.id === sourceId || entity.kind === 'arrow') continue;
      const distance = Math.sqrt(distanceSquared(origin, entity.position));
      const exposure = Math.max(1 - distance / (radius * 1.6), 0);
      if (exposure <= 0) continue;
      const length = Math.max(distance, 0.1);
      this.#damageEntity(
        entity.id,
        Math.ceil(exposure * 14),
        ((entity.position.x - origin.x) / length) * exposure * 0.8,
        ((entity.position.z - origin.z) / length) * exposure * 0.8,
      );
    }

    const blockRadius = Math.ceil(radius);
    for (let y = -blockRadius; y <= blockRadius; y += 1) {
      for (let z = -blockRadius; z <= blockRadius; z += 1) {
        for (let x = -blockRadius; x <= blockRadius; x += 1) {
          const distance = Math.hypot(x, y, z);
          if (distance > radius) continue;
          const worldX = Math.floor(origin.x + x + 0.5);
          const worldY = Math.floor(origin.y + y + 0.5);
          const worldZ = Math.floor(origin.z + z + 0.5);
          const block = this.#world.sampleBlock(worldX, worldY, worldZ);
          if (
            block === BlockType.Air ||
            block === BlockType.Water ||
            block === BlockType.Lava
          ) {
            continue;
          }
          const resistance = getBlockDefinition(block).resistance;
          const power = (1 - distance / radius) * 10;
          if (power <= resistance) continue;
          if (this.#world.setBlock(worldX, worldY, worldZ, BlockType.Air)) {
            this.#callbacks.onBlockChanged?.(worldX, worldY, worldZ);
          }
        }
      }
    }
    this.#removeEntity(sourceId, false);
  }

  #spawnExplosionVisual(origin: EntityVector, radius: number): void {
    const wave = MeshBuilder.CreateSphere(
      `explosion-wave-${String(this.#sequence++)}`,
      { diameter: 1, segments: 8 },
      this.#scene,
    );
    wave.position.set(origin.x, origin.y, origin.z);
    wave.scaling.setAll(0.15);
    wave.material = this.#shockwaveMaterial;
    wave.isPickable = false;
    wave.renderingGroupId = 2;

    const particles: ExplosionParticle[] = [];
    for (let index = 0; index < 22; index += 1) {
      const angle = index * 2.399963229728653;
      const vertical = ((index * 7) % 11) / 10 * 1.7 - 0.25;
      const horizontal = Math.sqrt(Math.max(1 - Math.min(vertical * vertical * 0.3, 0.8), 0.2));
      const speed = 2.5 + ((index * 13) % 9) * 0.18;
      const mesh = MeshBuilder.CreateBox(
        `explosion-particle-${String(index)}-${String(this.#sequence)}`,
        { size: 0.13 + (index % 3) * 0.035 },
        this.#scene,
      );
      mesh.position.set(origin.x, origin.y, origin.z);
      mesh.material = this.#explosionMaterial;
      mesh.isPickable = false;
      mesh.renderingGroupId = 2;
      particles.push({
        mesh,
        velocityX: Math.cos(angle) * horizontal * speed,
        velocityY: vertical * speed + 1.5,
        velocityZ: Math.sin(angle) * horizontal * speed,
      });
    }
    this.#explosions.push({ wave, particles, radius, elapsed: 0 });
  }

  #updateExplosionVisuals(seconds: number): void {
    for (let index = this.#explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.#explosions[index];
      if (explosion === undefined) continue;
      explosion.elapsed += seconds;
      const progress = Math.min(
        explosion.elapsed / EXPLOSION_VISUAL_SECONDS,
        1,
      );
      const waveScale =
        0.15 + Math.sin(progress * Math.PI * 0.5) * explosion.radius * 2.1;
      explosion.wave.scaling.setAll(waveScale);
      explosion.wave.rotation.y += seconds * 2.4;
      for (const particle of explosion.particles) {
        particle.velocityY -= 7.5 * seconds;
        particle.mesh.position.x += particle.velocityX * seconds;
        particle.mesh.position.y += particle.velocityY * seconds;
        particle.mesh.position.z += particle.velocityZ * seconds;
        particle.mesh.rotation.x += seconds * 7;
        particle.mesh.rotation.y += seconds * 5;
        particle.mesh.scaling.setAll(Math.max(1 - progress * 0.72, 0.18));
      }
      if (progress < 1) continue;
      explosion.wave.dispose(false, false);
      for (const particle of explosion.particles) {
        particle.mesh.dispose(false, false);
      }
      this.#explosions.splice(index, 1);
    }
  }

  #damageEntity(
    id: string,
    damage: number,
    knockbackX: number,
    knockbackZ: number,
  ): boolean {
    const before = this.#registry.get(id);
    if (before === null) return false;
    this.#registry.damage(id, damage);
    const after = this.#registry.get(id);
    if (after === null) return false;
    const visual = this.#visuals.get(id);
    if (visual !== undefined) visual.hurtSeconds = 0.18;
    if (after.health <= 0) {
      this.#killEntity(after);
      return true;
    }
    if (Math.abs(knockbackX) + Math.abs(knockbackZ) > 0.001) {
      const definition = creatureDefinition(after.kind);
      const standingOffset = definition?.standingOffset ?? 0;
      const nextY =
        this.#world.sampleStandingY(
          after.position.x + knockbackX,
          after.position.z + knockbackZ,
        ) + standingOffset;
      this.#registry.update(id, {
        position: {
          x: after.position.x + knockbackX,
          y:
            Math.abs(nextY - after.position.y) <= 1.1
              ? nextY
              : after.position.y,
          z: after.position.z + knockbackZ,
        },
      });
    }
    return false;
  }

  #killEntity(entity: EntitySnapshot): void {
    switch (entity.kind) {
      case 'zombie':
        this.#callbacks.onDrop(
          ItemType.Coal,
          1,
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'skeleton':
        this.#callbacks.onDrop(
          ItemType.Bone,
          1,
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        this.#callbacks.onDrop(
          ItemType.Arrow,
          1 + (this.#sequence % 2),
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'spider':
        this.#callbacks.onDrop(
          ItemType.String,
          1 + (this.#sequence % 2),
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'creeper':
        this.#callbacks.onDrop(
          ItemType.Gunpowder,
          1,
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'cow':
        this.#callbacks.onDrop(
          ItemType.RawBeef,
          1 + (this.#sequence % 2),
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        this.#callbacks.onDrop(
          ItemType.Leather,
          1,
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'pig':
        this.#callbacks.onDrop(
          ItemType.RawPorkchop,
          1 + (this.#sequence % 2),
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      case 'sheep':
        this.#callbacks.onDrop(
          ItemType.Wool,
          1,
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        break;
      default:
        break;
    }
    this.#removeEntity(entity.id, false);
  }

  #isExposedToSky(position: EntityVector): boolean {
    const worldX = Math.floor(position.x + 0.5);
    const worldZ = Math.floor(position.z + 0.5);
    const startY = Math.floor(position.y + 0.5) + 1;
    for (let worldY = startY; worldY < 32; worldY += 1) {
      if (this.#world.isSolidAt(worldX, worldY, worldZ)) return false;
    }
    return true;
  }

  #ensureVisual(entity: EntitySnapshot): EntityVisual {
    const existing = this.#visuals.get(entity.id);
    if (existing !== undefined) return existing;
    const root = new TransformNode(`entity-${entity.id}`, this.#scene);
    let body: Mesh;
    let material: StandardMaterial;
    let hurtMaterial: StandardMaterial;
    if (entity.kind === 'arrow') {
      body = MeshBuilder.CreateBox(
        `arrow-${entity.id}`,
        { width: 0.08, height: 0.08, depth: 0.72 },
        this.#scene,
      );
      material = this.#projectileMaterial;
      hurtMaterial = this.#projectileMaterial;
    } else if (entity.kind === 'tnt') {
      body = MeshBuilder.CreateBox(
        `tnt-${entity.id}`,
        { size: 0.82 },
        this.#scene,
      );
      material = this.#tntMaterial;
      hurtMaterial = this.#tntMaterial;
    } else {
      const definition = KINDS[entity.kind as keyof typeof KINDS];
      body = MeshBuilder.CreateBox(
        `body-${entity.id}`,
        {
          width: definition.scale[0],
          height: definition.scale[1],
          depth: definition.scale[2],
        },
        this.#scene,
      );
      material = makeMaterial(
        `material-${entity.id}`,
        this.#scene,
        definition.color,
      );
      hurtMaterial = makeMaterial(
        `hurt-${entity.id}`,
        this.#scene,
        new Color3(0.7, 0.12, 0.08),
      );
      const eye = MeshBuilder.CreateBox(
        `eye-${entity.id}`,
        {
          width: definition.scale[0] * 0.52,
          height: 0.08,
          depth: 0.03,
        },
        this.#scene,
      );
      eye.parent = root;
      eye.position.set(
        0,
        definition.scale[1] * 0.2,
        definition.scale[2] * 0.51,
      );
      eye.material = makeMaterial(
        `eye-material-${entity.id}`,
        this.#scene,
        definition.eyeColor,
        definition.eyeColor.scale(0.2),
      );
      eye.isPickable = false;
    }
    body.parent = root;
    body.material = material;
    body.isPickable = false;
    const visual: EntityVisual = {
      root,
      body,
      material,
      hurtMaterial,
      hurtSeconds: 0,
    };
    this.#visuals.set(entity.id, visual);
    return visual;
  }

  #syncVisuals(seconds: number): void {
    const live = new Set<string>();
    for (const entity of this.#registry.snapshots) {
      live.add(entity.id);
      const visual = this.#ensureVisual(entity);
      visual.hurtSeconds = Math.max(visual.hurtSeconds - seconds, 0);
      visual.root.position.set(
        entity.position.x,
        entity.position.y,
        entity.position.z,
      );
      if (entity.kind === 'arrow') {
        visual.root.rotation.y = Math.atan2(
          entity.velocity.x,
          entity.velocity.z,
        );
        visual.root.rotation.x = -Math.atan2(
          entity.velocity.y,
          Math.hypot(entity.velocity.x, entity.velocity.z),
        );
      } else if (entity.kind === 'creeper') {
        const progress = Math.min(
          Math.max(Number(entity.state.fuse ?? 0) / CREEPER_FUSE_SECONDS, 0),
          1,
        );
        const pulse =
          progress > 0
            ? Math.sin(progress * Math.PI * 10) ** 2 * progress * 0.08
            : 0;
        visual.root.scaling.set(
          1 + progress * 0.12 + pulse,
          1 + progress * 0.22 + pulse * 0.6,
          1 + progress * 0.12 + pulse,
        );
        visual.body.material =
          visual.hurtSeconds > 0 ? visual.hurtMaterial : visual.material;
      } else if (entity.kind !== 'tnt') {
        visual.root.scaling.setAll(1);
        visual.body.material =
          visual.hurtSeconds > 0 ? visual.hurtMaterial : visual.material;
      }
    }
    for (const [id, visual] of this.#visuals) {
      if (live.has(id)) continue;
      visual.root.dispose(false, false);
      if (
        visual.material !== this.#projectileMaterial &&
        visual.material !== this.#tntMaterial
      ) {
        visual.material.dispose();
      }
      if (visual.hurtMaterial !== visual.material) visual.hurtMaterial.dispose();
      this.#visuals.delete(id);
    }
  }

  #removeEntity(id: string, save: boolean): void {
    const removed = this.#registry.remove(id);
    if (removed === null) return;
    if (save) this.save();
  }
}
