import { Mesh, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import type { PlayerState, VectorState } from '../game/session/GameSession';
import type { ItemType } from '../inventory/ItemDefinitions';
import type { PlayerVector } from '../player/KinematicPlayerMotor';
import { installBlockRegistryBlastAlias } from '../world/BlockRegistryBlastAlias';
import type { VoxelWorldData } from '../world/VoxelWorldData';
import {
  ClassicEntityManager,
  type PlayerAttackResult,
} from './ClassicEntityManager';
import { CreatureVisualRuntime } from './CreatureVisualRuntime';

installBlockRegistryBlastAlias();

const PLAYER_COMBAT_COOLDOWN_SECONDS = 0.5;
const CREATURE_AMBIENT_INTERVAL_SECONDS = 4.2;
const ENTITY_SIMULATION_STEP_SECONDS = 1 / 30;
const BODY_PATTERN = /^body-(?<kind>zombie|skeleton|spider|creeper|cow|pig|sheep)-/;
const BATCHED_BODY_SUFFIX = /-(?:primary|secondary|detail|dark)$/;
const CREATURE_COLLISION: Readonly<Record<string, readonly [radius: number, halfHeight: number]>> = {
  zombie: [0.38, 0.9],
  skeleton: [0.34, 0.9],
  spider: [0.62, 0.32],
  creeper: [0.36, 0.86],
  cow: [0.58, 0.62],
  pig: [0.52, 0.5],
  sheep: [0.55, 0.55],
};

export interface NightStalkerCallbacks {
  readonly onPlayerDamage: (amount: number, source?: VectorState) => void;
  readonly onDrop: (
    item: ItemType,
    count: number,
    x: number,
    y: number,
    z: number,
  ) => void;
  readonly onEnemyHit?: (damage: number, killed: boolean) => void;
  readonly onBlockChanged?: (
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => void;
  readonly onMonsterAmbient?: () => void;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSourceCreatureBody(mesh: Mesh): boolean {
  return BODY_PATTERN.test(mesh.name) && !BATCHED_BODY_SUFFIX.test(mesh.name);
}

export class NightStalkerManager {
  readonly #scene: Scene;
  readonly #entities: ClassicEntityManager;
  readonly #visuals: CreatureVisualRuntime;
  readonly #onMonsterAmbient: (() => void) | undefined;
  readonly #collisionBodies = new Set<Mesh>();
  readonly #meshObserver: Observer<AbstractMesh>;
  #combatCooldown = 0;
  #ambientElapsed = 0;
  #entityAccumulator = 0;
  #lastObservedSceneMeshCount = 0;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    callbacks: NightStalkerCallbacks,
  ) {
    this.#scene = scene;
    this.#onMonsterAmbient = callbacks.onMonsterAmbient;
    this.#meshObserver = scene.onNewMeshAddedObservable.add((mesh) => {
      this.#registerCollisionBody(mesh);
    });
    for (const mesh of scene.meshes) this.#registerCollisionBody(mesh);
    this.#visuals = new CreatureVisualRuntime(scene);
    this.#entities = new ClassicEntityManager(
      scene,
      world,
      world.persistenceId,
      browserStorage(),
      {
        onPlayerDamage: (amount, source) => callbacks.onPlayerDamage(amount, source),
        onDrop: callbacks.onDrop,
        onEntityHit: callbacks.onEnemyHit,
        onBlockChanged: callbacks.onBlockChanged,
      },
    );
    this.#lastObservedSceneMeshCount = scene.meshes.length;
  }

  public update(player: PlayerState, dayTime: number, stepSeconds: number): void {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return;
    this.#combatCooldown = Math.max(this.#combatCooldown - stepSeconds, 0);
    if (this.hostileCount > 0 && !player.paused) {
      this.#ambientElapsed += stepSeconds;
      if (this.#ambientElapsed >= CREATURE_AMBIENT_INTERVAL_SECONDS) {
        this.#ambientElapsed %= CREATURE_AMBIENT_INTERVAL_SECONDS;
        this.#onMonsterAmbient?.();
      }
    } else {
      this.#ambientElapsed = 0;
    }

    this.#entityAccumulator += stepSeconds;
    if (this.#entityAccumulator + Number.EPSILON < ENTITY_SIMULATION_STEP_SECONDS) {
      return;
    }
    const entityStepSeconds = this.#entityAccumulator;
    this.#entityAccumulator = 0;
    this.#entities.update(player, dayTime, entityStepSeconds);
    this.#refreshCreatureRegistrationsIfNeeded();
  }

  public attack(player: PlayerState, heldItem: ItemType | null): PlayerAttackResult {
    if (this.#combatCooldown > 0) {
      return { hit: false, killed: false, damage: 0 };
    }
    const result = this.#entities.attack(player, heldItem);
    if (result.hit) this.#combatCooldown = PLAYER_COMBAT_COOLDOWN_SECONDS;
    return result;
  }

  public shootArrow(player: PlayerState, heldItem: ItemType | null): boolean {
    if (this.#combatCooldown > 0) return false;
    const fired = this.#entities.shootArrow(player, heldItem);
    if (fired) this.#combatCooldown = PLAYER_COMBAT_COOLDOWN_SECONDS;
    return fired;
  }

  public canPlayerOccupy(
    position: PlayerVector,
    playerRadius = 0.34,
    playerHalfHeight = 0.9,
  ): boolean {
    this.#refreshCreatureRegistrationsIfNeeded();
    for (const mesh of this.#collisionBodies) {
      if (mesh.isDisposed()) {
        this.#collisionBodies.delete(mesh);
        continue;
      }
      const match = BODY_PATTERN.exec(mesh.name);
      const kind = match?.groups?.kind;
      const parent = mesh.parent;
      if (kind === undefined || !(parent instanceof TransformNode)) continue;
      const collision = CREATURE_COLLISION[kind];
      if (collision === undefined) continue;
      const root = parent.getAbsolutePosition();
      const horizontalDistance = Math.hypot(
        position.x - root.x,
        position.z - root.z,
      );
      if (horizontalDistance >= playerRadius + collision[0]) continue;
      if (Math.abs(position.y - root.y) >= playerHalfHeight + collision[1]) continue;
      return false;
    }
    return true;
  }

  public primeTnt(x: number, y: number, z: number): boolean {
    return this.#entities.primeTnt({ x, y, z });
  }

  public save(): void {
    this.#entities.save();
  }

  public get activeCount(): number {
    return this.#entities.activeCount;
  }

  public get hostileCount(): number {
    return this.#entities.hostileCount;
  }

  public get passiveCount(): number {
    return this.#entities.passiveCount;
  }

  public dispose(): void {
    this.#scene.onNewMeshAddedObservable.remove(this.#meshObserver);
    this.#collisionBodies.clear();
    this.#visuals.dispose();
    this.#entities.dispose();
  }

  #registerCollisionBody(abstractMesh: AbstractMesh): void {
    if (!(abstractMesh instanceof Mesh)) return;
    if (!isSourceCreatureBody(abstractMesh)) return;
    this.#collisionBodies.add(abstractMesh);
  }

  #refreshCreatureRegistrationsIfNeeded(): void {
    const currentMeshCount = this.#scene.meshes.length;
    if (currentMeshCount === this.#lastObservedSceneMeshCount) return;
    this.#lastObservedSceneMeshCount = currentMeshCount;

    for (const mesh of this.#scene.meshes) {
      if (!isSourceCreatureBody(mesh)) continue;
      this.#collisionBodies.add(mesh);
      // Re-announcing is idempotent: collision bodies use a Set and the visual
      // runtime ignores bodies already pending or already upgraded. This covers
      // Babylon MeshBuilder construction timing without per-frame scene scans.
      this.#scene.onNewMeshAddedObservable.notifyObservers(mesh);
    }
  }
}
