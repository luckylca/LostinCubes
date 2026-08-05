import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import type { BlockType as BlockTypeValue } from '../src/world/BlockType';
import {
  WorldTickManager,
  type RandomTickWorld,
} from '../src/world/WorldTickManager';

class UniformTickWorld implements RandomTickWorld {
  public readonly worldSeed = 'bounded-random-tick-test';
  readonly #initial: BlockTypeValue;
  readonly #changed = new Map<string, BlockTypeValue>();
  public sampleCalls = 0;
  public setCalls = 0;

  public constructor(initial: BlockTypeValue) {
    this.#initial = initial;
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    this.sampleCalls += 1;
    return this.#changed.get(`${worldX},${worldY},${worldZ}`) ?? this.#initial;
  }

  public isSolidAt(): boolean {
    return false;
  }

  public setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): boolean {
    this.setCalls += 1;
    this.#changed.set(`${worldX},${worldY},${worldZ}`, block);
    return true;
  }
}

describe('WorldTickManager', () => {
  it('caps catch-up to two batches and eight sampled candidates per update', () => {
    const world = new UniformTickWorld(BlockType.TallGrass);
    const manager = new WorldTickManager(world);

    const changed = manager.update(0, 12, 0, 10);

    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(8);
    expect(world.setCalls).toBe(changed);
    expect(world.sampleCalls).toBeLessThan(40);
  });

  it('removes unsupported ladders through the same bounded tick budget', () => {
    const world = new UniformTickWorld(BlockType.Ladder);
    const manager = new WorldTickManager(world);

    const changed = manager.update(0, 12, 0, 0.25);

    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(4);
    expect(world.setCalls).toBe(changed);
  });

  it('does no work before the fixed random-tick interval elapses', () => {
    const world = new UniformTickWorld(BlockType.OakLeaves);
    const manager = new WorldTickManager(world);

    expect(manager.update(0, 12, 0, 0.1)).toBe(0);
    expect(world.sampleCalls).toBe(0);
    expect(world.setCalls).toBe(0);
  });
});
