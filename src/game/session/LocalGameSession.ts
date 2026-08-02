import type { GameCommand, GameSession, WorldState } from './GameSession';

export class LocalGameSession implements GameSession {
  #worldState: WorldState;
  readonly #commandQueue: GameCommand[] = [];

  public constructor(worldSeed: string) {
    this.#worldState = { tick: 0, worldSeed };
  }

  public async start(): Promise<void> {
    this.#worldState = { ...this.#worldState, tick: 0 };
  }

  public async stop(): Promise<void> {
    this.#commandQueue.length = 0;
  }

  public submitCommand(command: GameCommand): void {
    this.#commandQueue.push(command);
  }

  public getWorldState(): Readonly<WorldState> {
    return this.#worldState;
  }
}
