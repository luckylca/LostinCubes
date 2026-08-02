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
  readonly frameSeconds: number;
}

export interface BlockInteractionTimingResult {
  readonly breakNow: boolean;
  readonly placeNow: boolean;
  readonly breakProgress: number;
}

export function getBlockBreakDuration(block: BlockTypeValue): number {
  switch (block) {
    case BlockType.Grass:
      return 0.3;
    case BlockType.Dirt:
      return 0.4;
    case BlockType.Stone:
      return 0.85;
    case BlockType.RuneStone:
      return 1.25;
    case BlockType.Air:
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * Minecraft-like interaction timing: mining accumulates only while the same
 * block remains targeted, while placement fires immediately and then repeats.
 */
export class BlockInteractionState {
  #breakTargetKey: string | null = null;
  #breakProgress = 0;
  #placeWasHeld = false;
  #placeRepeatSeconds = 0;

  public update(
    input: BlockInteractionTimingInput,
  ): BlockInteractionTimingResult {
    if (!Number.isFinite(input.frameSeconds) || input.frameSeconds < 0) {
      throw new RangeError('frameSeconds must be a finite non-negative value.');
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
      this.#breakProgress += frameSeconds / duration;
      if (this.#breakProgress >= 1) {
        breakNow = true;
        this.#breakTargetKey = null;
        this.#breakProgress = 0;
      }
    } else {
      this.#resetBreaking();
    }

    // Attack takes priority when both buttons are held.
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

    return {
      breakNow,
      placeNow,
      breakProgress: this.#breakProgress,
    };
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
