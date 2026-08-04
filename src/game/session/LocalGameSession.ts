import type { PlayerInputCommand } from '../commands/PlayerInputCommand';
import { createNeutralPlayerInput } from '../commands/PlayerInputCommand';
import { KinematicPlayerMotor } from '../../player/KinematicPlayerMotor';
import type { PlayerMotorConfig } from '../../player/KinematicPlayerMotor';
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
const SAFE_LANDING_SPEED = 8;
const FALL_DAMAGE_PER_SPEED = 1.65;
const VOID_DEATH_Y = -20;
const DAY_LENGTH_SECONDS = 180;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPlayerInputCommand(command: GameCommand): command is PlayerInputCommand {
  return command.type === 'player-input';
}

export class LocalGameSession implements GameSession {
  readonly #worldSeed: string;
  readonly #motor: KinematicPlayerMotor;
  #worldState: WorldState;
  #pendingCommand: PlayerInputCommand | null = null;
  #heldCommand = createNeutralPlayerInput(0);
  #yaw = Math.PI;
  #pitch = -0.12;
  #cameraMode: CameraMode = 'third-person';
  #paused = false;
  #menuOpen = false;
  #health = PLAYER_MAXIMUM_HEALTH;
  #damageTaken = 0;
  #deathCount = 0;
  #maximumFallSpeed = 0;
  #dayTime = 0.28;
  #lastDeathPosition: VectorState | null = null;

  public constructor(
    worldSeed: string,
    motorConfig: Partial<PlayerMotorConfig> = {},
  ) {
    this.#worldSeed = worldSeed;
    this.#motor = new KinematicPlayerMotor(motorConfig);
    this.#worldState = this.#createWorldState(0);
  }

  public start(): Promise<void> {
    this.#motor.reset();
    this.#yaw = Math.PI;
    this.#pitch = -0.12;
    this.#cameraMode = 'third-person';
    this.#paused = false;
    this.#menuOpen = false;
    this.#health = PLAYER_MAXIMUM_HEALTH;
    this.#damageTaken = 0;
    this.#deathCount = 0;
    this.#maximumFallSpeed = 0;
    this.#dayTime = 0.28;
    this.#lastDeathPosition = null;
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
    this.#health = Math.round(
      clamp(snapshot.health, 1, PLAYER_MAXIMUM_HEALTH),
    );
    this.#dayTime = ((snapshot.dayTime % 1) + 1) % 1;
    this.#deathCount = Math.max(Math.floor(snapshot.deathCount), 0);
    this.#worldState = this.#createWorldState(this.#worldState.tick);
  }

  public damagePlayer(amount: number): number {
    const before = this.#health;
    this.#applyDamage(amount);
    if (this.#health <= 0) this.#respawn();
    this.#worldState = this.#createWorldState(this.#worldState.tick);
    return before - this.#health;
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

  public getSurvivalSnapshot(): SurvivalSnapshot {
    return {
      version: 1,
      health: this.#health,
      dayTime: this.#dayTime,
      deathCount: this.#deathCount,
    };
  }

  public step(stepSeconds: number): void {
    const command = this.#consumeCommand();
    this.#damageTaken = 0;

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
      const before = this.#motor.getState();
      if (!before.grounded && before.verticalVelocity < 0) {
        this.#maximumFallSpeed = Math.max(
          this.#maximumFallSpeed,
          -before.verticalVelocity,
        );
      }
      const after = this.#motor.update(
        {
          moveX: command.moveX,
          moveZ: command.moveZ,
          sprint: command.sprint,
          jump: command.jump,
          yaw: this.#yaw,
        },
        stepSeconds,
      );
      if (!before.grounded && after.grounded) this.#resolveLanding();
      if (after.position.y < VOID_DEATH_Y) {
        this.#applyDamage(PLAYER_MAXIMUM_HEALTH);
      }
      this.#dayTime = (this.#dayTime + stepSeconds / DAY_LENGTH_SECONDS) % 1;
    }

    if (this.#health <= 0) this.#respawn();
    this.#worldState = this.#createWorldState(this.#worldState.tick + 1);
  }

  public getWorldState(): Readonly<WorldState> {
    return this.#worldState;
  }

  #resolveLanding(): void {
    const excessSpeed = this.#maximumFallSpeed - SAFE_LANDING_SPEED;
    this.#maximumFallSpeed = 0;
    if (excessSpeed <= 0) return;
    this.#applyDamage(
      Math.max(1, Math.ceil(excessSpeed * FALL_DAMAGE_PER_SPEED)),
    );
  }

  #applyDamage(amount: number): void {
    const damage = Math.min(
      Math.max(Math.floor(amount), 0),
      this.#health,
    );
    if (damage <= 0) return;
    this.#health -= damage;
    this.#damageTaken += damage;
  }

  #respawn(): void {
    const deathPosition = this.#motor.getState().position;
    this.#lastDeathPosition = { ...deathPosition };
    this.#motor.reset();
    this.#health = PLAYER_MAXIMUM_HEALTH;
    this.#maximumFallSpeed = 0;
    this.#deathCount += 1;
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
      grounded: motorState.grounded,
      yaw: this.#yaw,
      pitch: this.#pitch,
      cameraMode: this.#cameraMode,
      paused: this.#paused || this.#menuOpen,
      health: this.#health,
      maximumHealth: PLAYER_MAXIMUM_HEALTH,
      damageTaken: this.#damageTaken,
      deathCount: this.#deathCount,
    };
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
