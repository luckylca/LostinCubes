import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

interface ToneOptions {
  readonly frequency: number;
  readonly duration: number;
  readonly volume: number;
  readonly type: OscillatorType;
  readonly frequencyEnd?: number;
}

interface OptionalAudioConstructors {
  readonly AudioContext?: typeof AudioContext;
  readonly webkitAudioContext?: typeof AudioContext;
}

function blockFrequency(block: BlockTypeValue): number {
  switch (block) {
    case BlockType.Grass:
    case BlockType.Dirt:
      return 115;
    case BlockType.OakLog:
    case BlockType.OakPlanks:
    case BlockType.CraftingTable:
      return 165;
    case BlockType.OakLeaves:
      return 260;
    case BlockType.Stone:
    case BlockType.Cobblestone:
    case BlockType.CoalOre:
    case BlockType.IronOre:
    case BlockType.Furnace:
      return 92;
    case BlockType.Torch:
      return 185;
    case BlockType.RuneStone:
      return 210;
    case BlockType.Air:
      return 120;
  }
}

export class GameAudio {
  #context: AudioContext | null = null;
  #disposed = false;

  public constructor() {
    const unlock = (): void => {
      void this.#getContext()?.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  public playBreak(block: BlockTypeValue): void {
    const base = blockFrequency(block);
    this.#tone({
      frequency: base * 1.15,
      frequencyEnd: base * 0.72,
      duration: 0.075,
      volume: 0.045,
      type: block === BlockType.RuneStone ? 'triangle' : 'square',
    });
    window.setTimeout(() => {
      this.#tone({
        frequency: base * 0.78,
        duration: 0.055,
        volume: 0.026,
        type: 'square',
      });
    }, 28);
  }

  public playPlace(block: BlockTypeValue): void {
    const base = blockFrequency(block);
    this.#tone({
      frequency: base,
      frequencyEnd: base * 1.18,
      duration: 0.06,
      volume: 0.035,
      type: 'triangle',
    });
  }

  public playPickup(): void {
    this.#tone({
      frequency: 520,
      frequencyEnd: 760,
      duration: 0.085,
      volume: 0.032,
      type: 'sine',
    });
  }

  public playCraft(): void {
    this.#tone({
      frequency: 440,
      frequencyEnd: 660,
      duration: 0.11,
      volume: 0.04,
      type: 'triangle',
    });
    window.setTimeout(() => {
      this.#tone({
        frequency: 740,
        duration: 0.09,
        volume: 0.025,
        type: 'sine',
      });
    }, 62);
  }

  public playEat(): void {
    this.#tone({
      frequency: 245,
      frequencyEnd: 330,
      duration: 0.08,
      volume: 0.035,
      type: 'triangle',
    });
    window.setTimeout(() => {
      this.#tone({
        frequency: 280,
        frequencyEnd: 410,
        duration: 0.075,
        volume: 0.028,
        type: 'triangle',
      });
    }, 72);
  }

  public playAttack(hit: boolean, killed = false): void {
    this.#tone({
      frequency: hit ? 165 : 120,
      frequencyEnd: hit ? 82 : 95,
      duration: hit ? 0.09 : 0.055,
      volume: hit ? 0.055 : 0.024,
      type: hit ? 'square' : 'triangle',
    });
    if (killed) {
      window.setTimeout(() => {
        this.#tone({
          frequency: 95,
          frequencyEnd: 42,
          duration: 0.18,
          volume: 0.04,
          type: 'sawtooth',
        });
      }, 40);
    }
  }

  public playPlayerHurt(): void {
    this.#tone({
      frequency: 140,
      frequencyEnd: 68,
      duration: 0.12,
      volume: 0.045,
      type: 'sawtooth',
    });
  }

  public dispose(): void {
    this.#disposed = true;
    const context = this.#context;
    this.#context = null;
    if (context !== null && context.state !== 'closed') void context.close();
  }

  #getContext(): AudioContext | null {
    if (this.#disposed) return null;
    if (this.#context !== null) return this.#context;
    const constructors = globalThis as unknown as OptionalAudioConstructors;
    const AudioContextConstructor =
      constructors.AudioContext ?? constructors.webkitAudioContext;
    if (AudioContextConstructor === undefined) return null;
    try {
      this.#context = new AudioContextConstructor();
      return this.#context;
    } catch {
      return null;
    }
  }

  #tone(options: ToneOptions): void {
    const context = this.#getContext();
    if (context === null || context.state === 'closed') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, now);
    if (options.frequencyEnd !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(options.frequencyEnd, 1),
        now + options.duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + options.duration + 0.01);
  }
}
