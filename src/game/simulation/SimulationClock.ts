export interface SimulationAdvanceResult {
  readonly alpha: number;
  readonly steps: number;
  readonly tick: number;
}

export type FixedUpdate = (stepSeconds: number, tick: number) => void;

export class SimulationClock {
  readonly #stepSeconds: number;
  readonly #maxFrameSeconds: number;
  readonly #maxStepsPerFrame: number;
  #accumulatorSeconds = 0;
  #tick = 0;

  public constructor(
    stepSeconds = 1 / 60,
    maxFrameSeconds = 0.25,
    maxStepsPerFrame = 8,
  ) {
    if (stepSeconds <= 0 || maxFrameSeconds <= 0 || maxStepsPerFrame <= 0) {
      throw new Error('Simulation clock values must be positive.');
    }

    this.#stepSeconds = stepSeconds;
    this.#maxFrameSeconds = maxFrameSeconds;
    this.#maxStepsPerFrame = Math.floor(maxStepsPerFrame);
  }

  public advance(frameSeconds: number, update: FixedUpdate): SimulationAdvanceResult {
    const safeFrameSeconds = Number.isFinite(frameSeconds)
      ? Math.min(Math.max(frameSeconds, 0), this.#maxFrameSeconds)
      : 0;

    this.#accumulatorSeconds += safeFrameSeconds;
    let steps = 0;

    while (
      this.#accumulatorSeconds >= this.#stepSeconds &&
      steps < this.#maxStepsPerFrame
    ) {
      this.#tick += 1;
      update(this.#stepSeconds, this.#tick);
      this.#accumulatorSeconds -= this.#stepSeconds;
      steps += 1;
    }

    if (steps === this.#maxStepsPerFrame) {
      this.#accumulatorSeconds = Math.min(
        this.#accumulatorSeconds,
        this.#stepSeconds,
      );
    }

    return {
      alpha: this.#accumulatorSeconds / this.#stepSeconds,
      steps,
      tick: this.#tick,
    };
  }

  public reset(): void {
    this.#accumulatorSeconds = 0;
    this.#tick = 0;
  }

  public get tick(): number {
    return this.#tick;
  }

  public get stepSeconds(): number {
    return this.#stepSeconds;
  }
}
