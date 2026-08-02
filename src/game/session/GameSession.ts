export type EntityId = string;

export interface WorldState {
  readonly tick: number;
  readonly worldSeed: string;
}

export interface GameCommand {
  readonly type: string;
  readonly issuedAtTick: number;
}

export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  submitCommand(command: GameCommand): void;
  getWorldState(): Readonly<WorldState>;
}
