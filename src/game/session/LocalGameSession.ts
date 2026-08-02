import type { PlayerInputCommand } from '../commands/PlayerInputCommand';
import { createNeutralPlayerInput } from '../commands/PlayerInputCommand';
import { KinematicPlayerMotor } from '../../player/KinematicPlayerMotor';
import type {
  CameraMode,
  GameCommand,
  GameSession,
  PlayerState,
  WorldState,
} from './GameSession';

const LOOK_SENSITIVITY = 0.0024;
const MINIMUM_PITCH = -1.15;
const MAXIMUM_PITCH = 1.05;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPlayerInputCommand(command: GameCommand): command is PlayerInputCommand {
  return command.type === 'player-input';
}

export class LocalGameSession implements GameSession {
  readonly #worldSeed: string;
  readonly #motor = new KinematicPlayerMotor();
  #worldState: WorldState;
  #pendingCommand: PlayerInputCommand | null = null;
  #heldCommand = createNeutralPlayerInput(0);
  #yaw = Math.PI;
  #pitch = -0.12;
  #cameraMode: CameraMode = 'third-person';
  #paused = false;

  public constructor(worldSeed: string) {
    this.#worldSeed = worldSeed;
    this.#worldState = this.#createWorldState(0);
  }

  public start(): Promise<void> {
    this.#motor.reset();
    this.#yaw = Math.PI;
    this.#pitch = -0.12;
    this.#cameraMode = 'third-person';
    this.#paused = false;
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
    if (isPlayerInputCommand(command)) {
      this.#pendingCommand = command;
    }
  }

  public step(stepSeconds: number): void {
    const command = this.#consumeCommand();

    if (command.togglePause) {
      this.#paused = !this.#paused;
    }

    if (command.toggleCamera) {
      this.#cameraMode =
        this.#cameraMode === 'third-person' ? 'first-person' : 'third-person';
    }

    this.#yaw -= command.lookX * LOOK_SENSITIVITY;
    this.#pitch = clamp(
      this.#pitch - command.lookY * LOOK_SENSITIVITY,
      MINIMUM_PITCH,
      MAXIMUM_PITCH,
    );

    if (!this.#paused) {
      this.#motor.update(
        {
          moveX: command.moveX,
          moveZ: command.moveZ,
          sprint: command.sprint,
          jump: command.jump,
          yaw: this.#yaw,
        },
        stepSeconds,
      );
    }

    this.#worldState = this.#createWorldState(this.#worldState.tick + 1);
  }

  public getWorldState(): Readonly<WorldState> {
    return this.#worldState;
  }

  #consumeCommand(): PlayerInputCommand {
    if (this.#pendingCommand === null) {
      return this.#heldCommand;
    }

    const command = this.#pendingCommand;
    this.#pendingCommand = null;
    this.#heldCommand = {
      ...command,
      lookX: 0,
      lookY: 0,
      jump: false,
      toggleCamera: false,
      togglePause: false,
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
      paused: this.#paused,
    };

    return {
      tick,
      worldSeed: this.#worldSeed,
      player,
    };
  }
}
