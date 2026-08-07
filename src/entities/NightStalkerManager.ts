import type { Scene } from '@babylonjs/core';
import type { PlayerState, VectorState } from '../game/session/GameSession';
import type { ItemType } from '../inventory/ItemDefinitions';
import type { VoxelWorldData } from '../world/VoxelWorldData';
import {
  ClassicEntityManager,
  type PlayerAttackResult,
} from './ClassicEntityManager';

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
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Compatibility facade kept so GameApp does not need a risky wholesale rewrite.
 * All actual entity identity, AI, projectiles, persistence and spatial queries
 * now live in ClassicEntityManager/EntityRegistry.
 */
export class NightStalkerManager {
  readonly #entities: ClassicEntityManager;

  public constructor(
    scene: Scene,
    world: VoxelWorldData,
    callbacks: NightStalkerCallbacks,
  ) {
    this.#entities = new ClassicEntityManager(
      scene,
      world,
      world.persistenceId,
      browserStorage(),
      {
        onPlayerDamage: (amount, source) => callbacks.onPlayerDamage(amount, source),
        onDrop: callbacks.onDrop,
        onEntityHit: callbacks.onEnemyHit,
      },
    );
  }

  public update(player: PlayerState, dayTime: number, stepSeconds: number): void {
    this.#entities.update(player, dayTime, stepSeconds);
  }

  public attack(
    player: PlayerState,
    heldItem: ItemType | null,
  ): PlayerAttackResult {
    return this.#entities.attack(player, heldItem);
  }

  public shootArrow(player: PlayerState, heldItem: ItemType | null): boolean {
    return this.#entities.shootArrow(player, heldItem);
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
    this.#entities.dispose();
  }
}
