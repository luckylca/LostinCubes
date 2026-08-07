export type EntityId = string;
export type CameraMode = 'first-person' | 'third-person';

export interface VectorState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerState {
  readonly position: VectorState;
  readonly verticalVelocity: number;
  readonly horizontalSpeed: number;
  readonly sprinting: boolean;
  readonly sneaking: boolean;
  readonly grounded: boolean;
  readonly inWater: boolean;
  readonly submerged: boolean;
  readonly inLava: boolean;
  readonly onLadder: boolean;
  readonly airSupply: number;
  readonly maximumAirSupply: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly cameraMode: CameraMode;
  readonly paused: boolean;
  readonly health: number;
  readonly maximumHealth: number;
  readonly hunger: number;
  readonly maximumHunger: number;
  readonly armorPoints: number;
  readonly damageTaken: number;
  readonly deathCount: number;
}

export interface WorldState {
  readonly tick: number;
  readonly worldSeed: string;
  readonly dayTime: number;
  readonly lastDeathPosition: VectorState | null;
  readonly player: PlayerState;
}

export interface GameCommand {
  readonly type: string;
  readonly issuedAtTick: number;
}

export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  submitCommand(command: GameCommand): void;
  step(stepSeconds: number): void;
  getWorldState(): Readonly<WorldState>;
}
