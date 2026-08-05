import { getBlockDefinition } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

const INITIAL_PLACE_REPEAT_DELAY_SECONDS = 0.25;
const PLACE_REPEAT_INTERVAL_SECONDS = 0.2;

export interface BlockInteractionTimingInput {
  readonly targetKey: string | null;
  readonly targetBlock: BlockTypeValue;
  readonly canBreakTarget: boolean;
  readonly breakHeld: boolean;
  readonly placeHeld: boolean;
  readonly breakSpeedMultiplier: number;
  readonly frameSeconds: number;
}

export interface BlockInteractionTimingResult {
  readonly breakNow: boolean;
  readonly placeNow: boolean;
  readonly breakProgress: number;
}

export function getBlockBreakDuration(block: BlockTypeValue): number {
  if (block === BlockType.Air) return Number.POSITIVE_INFINITY;
  const hardness = getBlockDefinition(block).hardness;
  if (hardness <= 0) return 0.05;
  return Math.max(hardness * 0.9, 0.08);
}

export class BlockInteractionState {
  #breakTargetKey: string | null = null;
  #breakProgress = 0;
  #placeWasHeld = false;
  #placeRepeatSeconds = 0;

  public update(input: BlockInteractionTimingInput): BlockInteractionTimingResult {
    if (!Number.isFinite(input.frameSeconds) || input.frameSeconds < 0) {
      throw new RangeError('frameSeconds must be a finite non-negative value.');
    }
    if (!Number.isFinite(input.breakSpeedMultiplier) || input.breakSpeedMultiplier <= 0) {
      throw new RangeError('breakSpeedMultiplier must be positive and finite.');
    }

    const frameSeconds = Math.min(input.frameSeconds, 0.1);
    let breakNow = false;
    let placeNow = false;

    if (
      input.breakHeld &&
      input.canBreakTarget &&
      input.targetKey !== null &&
      input.targetBlock !== BlockType.Air
    ) {
      if (this.#breakTargetKey !== input.targetKey) {
        this.#breakTargetKey = input.targetKey;
        this.#breakProgress = 0;
      }
      const duration = getBlockBreakDuration(input.targetBlock);
      this.#breakProgress += (frameSeconds * input.breakSpeedMultiplier) / duration;
      if (this.#breakProgress >= 1) {
        breakNow = true;
        this.#breakTargetKey = null;
        this.#breakProgress = 0;
      }
    } else {
      this.#resetBreaking();
    }

    if (input.breakHeld) {
      this.#resetPlacement();
    } else if (input.placeHeld) {
      if (!this.#placeWasHeld) {
        placeNow = true;
        this.#placeRepeatSeconds = INITIAL_PLACE_REPEAT_DELAY_SECONDS;
      } else {
        this.#placeRepeatSeconds -= frameSeconds;
        if (this.#placeRepeatSeconds <= 0) {
          placeNow = true;
          this.#placeRepeatSeconds += PLACE_REPEAT_INTERVAL_SECONDS;
        }
      }
      this.#placeWasHeld = true;
    } else {
      this.#resetPlacement();
    }

    return { breakNow, placeNow, breakProgress: this.#breakProgress };
  }

  public reset(): void {
    this.#resetBreaking();
    this.#resetPlacement();
  }

  #resetBreaking(): void {
    this.#breakTargetKey = null;
    this.#breakProgress = 0;
  }

  #resetPlacement(): void {
    this.#placeWasHeld = false;
    this.#placeRepeatSeconds = 0;
  }
}
