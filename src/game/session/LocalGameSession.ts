import type { PlayerInputCommand } from '../commands/PlayerInputCommand';
import { createNeutralPlayerInput } from '../commands/PlayerInputCommand';
import { KinematicPlayerMotor } from '../../player/KinematicPlayerMotor';
import type {
  PlayerMotorConfig,
  PlayerVector,
} from '../../player/KinematicPlayerMotor';
import { syncSurvivalHud } from '../../ui/SurvivalHudRuntime';
import {
  getSurvivalBiomeLabel,
  isPlayerHeadSubmerged,
  isPlayerHeadSuffocating,
  sampleSurvivalEnvironment,
  updateSurvivalWorld,
} from '../../world/SurvivalWorldRuntime';
import type { SurvivalSnapshot } from './SurvivalPersistence';
import type {
  CameraMode,
  GameCommand,
  GameSession,
  PlayerState,
  VectorState,
  WorldState,
} from './GameSession';

const LOOK_SENSITIVITY = 0.0024;
export const PLAYER_LOOK_PITCH_LIMIT = Math.PI / 2 - 0.003;
const MINIMUM_PITCH = -PLAYER_LOOK_PITCH_LIMIT;
const MAXIMUM_PITCH = PLAYER_LOOK_PITCH_LIMIT;
export const PLAYER_MAXIMUM_HEALTH = 20;
export const PLAYER_MAXIMUM_HUNGER = 20;
export const PLAYER_MAXIMUM_AIR_SUPPLY = 300;
const AIR_UNITS_PER_SECOND = 20;
const AIR_RECOVERY_UNITS_PER_SECOND = 80;
const SAFE_LANDING_SPEED = 8;
const FALL_DAMAGE_PER_SPEED = 1.65;
const VOID_DEATH_Y = -20;
const DAY_LENGTH_SECONDS = 180;
const HURT_INVULNERABILITY_SECONDS = 0.5;
const HURT_KNOCKBACK_DISTANCE = 0.32;
const HURT_KNOCKBACK_LIFT = 0.14;
const DROWNING_INTERVAL_SECONDS = 1;
const DROWNING_DAMAGE = 2;
const LAVA_DAMAGE_INTERVAL_SECONDS = 0.75;
const LAVA_DAMAGE = 4;
const SUFFOCATION_INTERVAL_SECONDS = 0.75;
const SUFFOCATION_DAMAGE = 1;
const HUNGER_WALK_DRAIN_PER_SECOND = 0.012;
const HUNGER_SPRINT_DRAIN_PER_SECOND = 0.045;
const HUNGER_SWIM_DRAIN_PER_SECOND = 0.026;
const NATURAL_REGEN_HUNGER_THRESHOLD = 18;
const NATURAL_REGEN_INTERVAL_SECONDS = 4;
const STARVATION_INTERVAL_SECONDS = 4;
const SESSION_MAXIMUM_AUTO_JUMP_HEIGHT = 1.45;

export interface LocalGameSessionConfig extends Partial<PlayerMotorConfig> {
  readonly isHeadSubmergedAt?: (position: PlayerVector) => boolean;
  readonly isHeadSuffocatingAt?: (position: PlayerVector) => boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPlayerInputCommand(command: GameCommand): command is PlayerInputCommand {
  return command.type === 'player-input';
}

export class LocalGameSession implements GameSession {
  readonly #worldSeed: string;
  readonly #motor: KinematicPlayerMotor;
  readonly #isHeadSubmergedAt: (position: PlayerVector) => boolean;
  readonly #isHeadSuffocatingAt: (position: PlayerVector) => boolean;
  #worldState: WorldState;
  #pendingCommand: PlayerInputCommand | null = null;
  #heldCommand = createNeutralPlayerInput(0);
  #yaw = Math.PI;
  #pitch = -0.12;
  #cameraMode: CameraMode = 'third-person';
  #paused = false;
  #menuOpen = false;
  #dead = false;
  #health = PLAYER_MAXIMUM_HEALTH;
  #hunger = PLAYER_MAXIMUM_HUNGER;
  #armorPoints = 0;
  #damageTaken = 0;
  #deathCount = 0;
  #maximumFallSpeed = 0;
  #dayTime = 0.28;
  #lastDeathPosition: VectorState | null = null;
  #airSupply = PLAYER_MAXIMUM_AIR_SUPPLY;
  #submerged = false;
  #hurtCooldown = 0;
  #drowningElapsed = 0;
  #lavaElapsed = 0;
  #suffocationElapsed = 0;
  #naturalRegenElapsed = 0;
  #starvationElapsed = 0;

  public constructor(
    worldSeed: string,
    config: LocalGameSessionConfig = {},
  ) {
    this.#worldSeed = worldSeed;
    this.#motor = new KinematicPlayerMotor({
      maximumAutoJumpHeight: SESSION_MAXIMUM_AUTO_JUMP_HEIGHT,
      ...config,
      environmentAt: config.environmentAt ?? sampleSurvivalEnvironment,
    });
    this.#isHeadSubmergedAt =
      config.isHeadSubmergedAt ?? isPlayerHeadSubmerged;
    this.#isHeadSuffocatingAt =
      config.isHeadSuffocatingAt ?? isPlayerHeadSuffocating;
    this.#worldState = this.#createWorldState(0);
  }

  public start(): Promise<void> {
    this.#motor.reset();
    this.#yaw = Math.PI;
    this.#pitch = -0.12;
    this.#cameraMode = 'third-person';
    this.#paused = false;
    this.#menuOpen = false;
    this.#dead = false;
    this.#health = PLAYER_MAXIMUM_HEALTH;
    this.#hunger = PLAYER_MAXIMUM_HUNGER;
    this.#armorPoints = 0;
    this.#damageTaken = 0;
    this.#deathCount = 0;
    this.#maximumFallSpeed = 0;
    this.#dayTime = 0.28;
    this.#lastDeathPosition = null;
    this.#airSupply = PLAYER_MAXIMUM_AIR_SUPPLY;
    this.#submerged = false;
    this.#hurtCooldown = 0;
    this.#drowningElapsed = 0;
    this.#lavaElapsed = 0;
    this.#suffocationElapsed = 0;
    this.#naturalRegenElapsed = 0;
    this.#starvationElapsed = 0;
    this.#pendingCommand = null;
    this.#heldCommand = createNeutralPlayerInput(0);
    this.#worldState = this.#createWorldState(0);
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.#pendingCommand = null;
    this.#heldCommand = createNeutralPlayerInput(this.#worldState.tick);
    return Promise.resolve();
  }

  public submitCommand(command: GameCommand): void {
    if (isPlayerInputCommand(command)) this.#pendingCommand = command;
  }

  public setMenuOpen(open: boolean): void {
    if (open === this.#menuOpen) return;
    this.#menuOpen = open;
    this.#pendingCommand = null;
    this.#heldCommand = createNeutralPlayerInput(this.#worldState.tick);
    this.#worldState = this.#createWorldState(this.#worldState.tick);
  }

  public restoreSurvival(snapshot: SurvivalSnapshot | null): void {
    if (snapshot === null) return;
    this.#health = Math.round(clamp(snapshot.health, 1, PLAYER_MAXIMUM_HEALTH));
    this.#dayTime = ((snapshot.dayTime % 1) + 1) % 1;
    this.#deathCount = Math.max(Math.floor(snapshot.deathCount), 0);
    this.#yaw = snapshot.yaw;
    this.#pitch = clamp(snapshot.pitch, MINIMUM_PITCH, MAXIMUM_PITCH);
    this.#hunger = clamp(snapshot.hunger, 0, PLAYER_MAXIMUM_HUNGER);
    this.#armorPoints = Math.round(clamp(snapshot.armorPoints, 0, 20));
    this.#dead = false;
    if (snapshot.position !== null) this.#motor.reset(snapshot.position);
    this.#worldState = this.#createWorldState(this.#worldState.tick);
  }

  public damagePlayer(amount: number, source?: VectorState): number {
    if (this.#dead) return 0;
    const before = this.#health;
    this.#applyDamage(amount, false, true);
    const damageDealt = before - this.#health;
    if (damageDealt > 0 && this.#health > 0) this.#applyKnockback(source);
    if (this.#health <= 0) this.#markDead();
    this.#worldState = this.#createWorldState(this.#worldState.tick);
    return damageDealt;
  }

  public healPlayer(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0 || this.#health <= 0) return 0;
    const before = this.#health;
    this.#health = Math.min(
      PLAYER_MAXIMUM_HEALTH,
      this.#health + Math.floor(amount),
    );
    this.#worldState = this.#createWorldState(this.#worldState.tick);
    return this.#health - before;
  }

  public feedPlayer(points: number): number {
    if (!Number.isFinite(points) || points <= 0 || this.#dead) return 0;
    const before = this.#hunger;
    this.#hunger = Math.min(
      PLAYER_MAXIMUM_HUNGER,
      this.#hunger + Math.floor(points),
    );
    this.#worldState = this.#createWorldState(this.#worldState.tick);
    return this.#hunger - before;
  }

  public setArmorPoints(points: number): void {
    if (!Number.isFinite(points)) return;
    this.#armorPoints = Math.round(clamp(points, 0, 20));
    this.#worldState = this.#createWorldState(this.#worldState.tick);
  }

  /** Completes a death transition only after the caller has prepared spawn terrain. */
  public respawnPlayer(): boolean {
    if (!this.#dead) return false;
    this.#motor.reset();
    this.#health = PLAYER_MAXIMUM_HEALTH;
    this.#hunger = PLAYER_MAXIMUM_HUNGER;
    this.#armorPoints = 0;
    this.#maximumFallSpeed = 0;
    this.#airSupply = PLAYER_MAXIMUM_AIR_SUPPLY;
    this.#submerged = false;
    this.#hurtCooldown = 0;
    this.#drowningElapsed = 0;
    this.#lavaElapsed = 0;
    this.#suffocationElapsed = 0;
    this.#naturalRegenElapsed = 0;
    this.#starvationElapsed = 0;
    this.#dead = false;
    this.#pendingCommand = null;
    this.#heldCommand = createNeutralPlayerInput(this.#worldState.tick);
    this.#worldState = this.#createWorldState(this.#worldState.tick);
    return true;
  }

  public get isDead(): boolean {
    return this.#dead;
  }

  public getSurvivalSnapshot(): SurvivalSnapshot {
    const motorState = this.#motor.getState();
    return {
      version: 2,
      health: this.#dead ? PLAYER_MAXIMUM_HEALTH : this.#health,
      dayTime: this.#dayTime,
      deathCount: this.#deathCount,
      position: this.#dead ? null : { ...motorState.position },
      yaw: this.#yaw,
      pitch: this.#pitch,
      hunger: this.#dead ? PLAYER_MAXIMUM_HUNGER : this.#hunger,
      armorPoints: this.#dead ? 0 : this.#armorPoints,
    };
  }

  public step(stepSeconds: number): void {
    const command = this.#consumeCommand();
    this.#damageTaken = 0;

    if (this.#dead) {
      this.#worldState = this.#createWorldState(this.#worldState.tick + 1);
      return;
    }

    if (command.togglePause && !this.#menuOpen) this.#paused = !this.#paused;
    if (command.toggleCamera && !this.#menuOpen) {
      this.#cameraMode =
        this.#cameraMode === 'third-person' ? 'first-person' : 'third-person';
    }
    if (!this.#menuOpen) {
      this.#yaw -= command.lookX * LOOK_SENSITIVITY;
      this.#pitch = clamp(
        this.#pitch - command.lookY * LOOK_SENSITIVITY,
        MINIMUM_PITCH,
        MAXIMUM_PITCH,
      );
    }

    if (!this.#paused && !this.#menuOpen) {
      this.#hurtCooldown = Math.max(this.#hurtCooldown - stepSeconds, 0);
      const before = this.#motor.getState();
      if (
        !before.grounded &&
        !before.inWater &&
        !before.inLava &&
        !before.onLadder &&
        before.verticalVelocity < 0
      ) {
        this.#maximumFallSpeed = Math.max(
          this.#maximumFallSpeed,
          -before.verticalVelocity,
        );
      }

      const after = this.#motor.update(
        {
          moveX: command.moveX,
          moveZ: command.moveZ,
          sprint: command.sprint && this.#hunger > 0,
          sneak: command.sneak,
          jump: command.jump,
          yaw: this.#yaw,
        },
        stepSeconds,
      );

      if (after.inWater || after.inLava || after.onLadder) {
        this.#maximumFallSpeed = 0;
      } else if (!before.grounded && after.grounded) {
        this.#resolveLanding();
      }

      this.#submerged = this.#isHeadSubmergedAt(after.position);
      this.#updateAir(stepSeconds);
      this.#updateEnvironmentalDamage(after.position, after.inLava, stepSeconds);
      this.#updateHunger(after, stepSeconds);
      updateSurvivalWorld(after.position, stepSeconds);

      if (after.position.y < VOID_DEATH_Y) {
        this.#applyDamage(PLAYER_MAXIMUM_HEALTH, true, false);
      }
      this.#dayTime = (this.#dayTime + stepSeconds / DAY_LENGTH_SECONDS) % 1;
    }

    if (this.#health <= 0) this.#markDead();
    this.#worldState = this.#createWorldState(this.#worldState.tick + 1);
  }

  public getWorldState(): Readonly<WorldState> {
    return this.#worldState;
  }

  #updateAir(stepSeconds: number): void {
    if (this.#submerged) {
      this.#airSupply = Math.max(
        this.#airSupply - AIR_UNITS_PER_SECOND * stepSeconds,
        0,
      );
      if (this.#airSupply <= 0) {
        this.#drowningElapsed += stepSeconds;
        if (this.#drowningElapsed >= DROWNING_INTERVAL_SECONDS) {
          this.#drowningElapsed %= DROWNING_INTERVAL_SECONDS;
          this.#applyDamage(DROWNING_DAMAGE, false, false);
        }
      }
      return;
    }
    this.#drowningElapsed = 0;
    this.#airSupply = Math.min(
      this.#airSupply + AIR_RECOVERY_UNITS_PER_SECOND * stepSeconds,
      PLAYER_MAXIMUM_AIR_SUPPLY,
    );
  }

  #updateEnvironmentalDamage(
    position: PlayerVector,
    inLava: boolean,
    stepSeconds: number,
  ): void {
    if (inLava) {
      this.#lavaElapsed += stepSeconds;
      if (this.#lavaElapsed >= LAVA_DAMAGE_INTERVAL_SECONDS) {
        this.#lavaElapsed %= LAVA_DAMAGE_INTERVAL_SECONDS;
        this.#applyDamage(LAVA_DAMAGE, false, false);
      }
    } else {
      this.#lavaElapsed = 0;
    }

    if (this.#isHeadSuffocatingAt(position)) {
      this.#suffocationElapsed += stepSeconds;
      if (this.#suffocationElapsed >= SUFFOCATION_INTERVAL_SECONDS) {
        this.#suffocationElapsed %= SUFFOCATION_INTERVAL_SECONDS;
        this.#applyDamage(SUFFOCATION_DAMAGE, false, false);
      }
    } else {
      this.#suffocationElapsed = 0;
    }
  }

  #updateHunger(
    state: ReturnType<KinematicPlayerMotor['getState']>,
    stepSeconds: number,
  ): void {
    if (state.horizontalSpeed > 0.08) {
      const drain = state.sprinting
        ? HUNGER_SPRINT_DRAIN_PER_SECOND
        : state.inWater
          ? HUNGER_SWIM_DRAIN_PER_SECOND
          : HUNGER_WALK_DRAIN_PER_SECOND;
      this.#hunger = Math.max(this.#hunger - drain * stepSeconds, 0);
    }

    if (
      this.#hunger >= NATURAL_REGEN_HUNGER_THRESHOLD &&
      this.#health < PLAYER_MAXIMUM_HEALTH
    ) {
      this.#naturalRegenElapsed += stepSeconds;
      if (this.#naturalRegenElapsed >= NATURAL_REGEN_INTERVAL_SECONDS) {
        this.#naturalRegenElapsed %= NATURAL_REGEN_INTERVAL_SECONDS;
        this.#health = Math.min(this.#health + 1, PLAYER_MAXIMUM_HEALTH);
        this.#hunger = Math.max(this.#hunger - 1, 0);
      }
    } else {
      this.#naturalRegenElapsed = 0;
    }

    if (this.#hunger <= 0) {
      this.#starvationElapsed += stepSeconds;
      if (this.#starvationElapsed >= STARVATION_INTERVAL_SECONDS) {
        this.#starvationElapsed %= STARVATION_INTERVAL_SECONDS;
        this.#applyDamage(1, false, false);
      }
    } else {
      this.#starvationElapsed = 0;
    }
  }

  #resolveLanding(): void {
    const excessSpeed = this.#maximumFallSpeed - SAFE_LANDING_SPEED;
    this.#maximumFallSpeed = 0;
    if (excessSpeed <= 0) return;
    this.#applyDamage(
      Math.max(1, Math.ceil(excessSpeed * FALL_DAMAGE_PER_SPEED)),
      false,
      false,
    );
  }

  #applyDamage(
    amount: number,
    bypassCooldown: boolean,
    armorApplies: boolean,
  ): void {
    if (!Number.isFinite(amount) || amount <= 0 || this.#dead) return;
    if (!bypassCooldown && this.#hurtCooldown > 0) return;
    const armorReduction = armorApplies
      ? Math.min(this.#armorPoints, 20) * 0.04
      : 0;
    const reduced = Math.max(1, Math.ceil(amount * (1 - armorReduction)));
    const damage = Math.min(reduced, this.#health);
    if (damage <= 0) return;
    this.#health -= damage;
    this.#damageTaken += damage;
    if (!bypassCooldown) this.#hurtCooldown = HURT_INVULNERABILITY_SECONDS;
  }

  #applyKnockback(source?: VectorState): void {
    const motorState = this.#motor.getState();
    let directionX = -Math.sin(this.#yaw);
    let directionZ = -Math.cos(this.#yaw);
    if (source !== undefined) {
      const deltaX = motorState.position.x - source.x;
      const deltaZ = motorState.position.z - source.z;
      const length = Math.hypot(deltaX, deltaZ);
      if (length > 0.001) {
        directionX = deltaX / length;
        directionZ = deltaZ / length;
      }
    }
    this.#motor.reset({
      x: motorState.position.x + directionX * HURT_KNOCKBACK_DISTANCE,
      y: motorState.position.y + HURT_KNOCKBACK_LIFT,
      z: motorState.position.z + directionZ * HURT_KNOCKBACK_DISTANCE,
    });
    this.#maximumFallSpeed = 0;
  }

  #markDead(): void {
    if (this.#dead) return;
    const deathPosition = this.#motor.getState().position;
    this.#lastDeathPosition = { ...deathPosition };
    this.#health = 0;
    this.#dead = true;
    this.#deathCount += 1;
    this.#maximumFallSpeed = 0;
    this.#pendingCommand = null;
    this.#heldCommand = createNeutralPlayerInput(this.#worldState.tick);
  }

  #consumeCommand(): PlayerInputCommand {
    if (this.#pendingCommand === null) return this.#heldCommand;
    const command = this.#pendingCommand;
    this.#pendingCommand = null;
    this.#heldCommand = {
      ...command,
      lookX: 0,
      lookY: 0,
      jump: false,
      toggleCamera: false,
      togglePause: false,
      toggleInventory: false,
      breakBlock: false,
      placeBlock: false,
    };
    return command;
  }

  #createWorldState(tick: number): WorldState {
    const motorState = this.#motor.getState();
    const player: PlayerState = {
      position: motorState.position,
      verticalVelocity: motorState.verticalVelocity,
      horizontalSpeed: motorState.horizontalSpeed,
      sprinting: motorState.sprinting,
      sneaking: motorState.sneaking,
      grounded: motorState.grounded,
      inWater: motorState.inWater,
      submerged: this.#submerged,
      inLava: motorState.inLava,
      onLadder: motorState.onLadder,
      airSupply: Math.round(this.#airSupply),
      maximumAirSupply: PLAYER_MAXIMUM_AIR_SUPPLY,
      yaw: this.#yaw,
      pitch: this.#pitch,
      cameraMode: this.#cameraMode,
      paused: this.#paused || this.#menuOpen || this.#dead,
      health: this.#health,
      maximumHealth: PLAYER_MAXIMUM_HEALTH,
      hunger: Math.round(this.#hunger * 10) / 10,
      maximumHunger: PLAYER_MAXIMUM_HUNGER,
      armorPoints: this.#armorPoints,
      damageTaken: this.#damageTaken,
      deathCount: this.#deathCount,
    };
    syncSurvivalHud(player, getSurvivalBiomeLabel(player.position));
    return {
      tick,
      worldSeed: this.#worldSeed,
      dayTime: this.#dayTime,
      lastDeathPosition:
        this.#lastDeathPosition === null ? null : { ...this.#lastDeathPosition },
      player,
    };
  }
}
