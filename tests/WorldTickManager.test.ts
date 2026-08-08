import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import type { BlockType as BlockTypeValue } from '../src/world/BlockType';
import {
  WorldTickManager,
  type RandomTickWorld,
} from '../src/world/WorldTickManager';

function coordinateKey(worldX: number, worldY: number, worldZ: number): string {
  return `${String(worldX)},${String(worldY)},${String(worldZ)}`;
}

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
    return (
      this.#changed.get(coordinateKey(worldX, worldY, worldZ)) ?? this.#initial
    );
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
    this.#changed.set(coordinateKey(worldX, worldY, worldZ), block);
    return true;
  }
}

class SparseTickWorld implements RandomTickWorld {
  public readonly worldSeed = 'scheduled-tick-test';
  readonly #blocks = new Map<string, BlockTypeValue>();
  public setCalls = 0;

  public prime(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): void {
    const key = coordinateKey(worldX, worldY, worldZ);
    if (block === BlockType.Air) this.#blocks.delete(key);
    else this.#blocks.set(key, block);
  }

  public sampleBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): BlockTypeValue {
    return this.#blocks.get(coordinateKey(worldX, worldY, worldZ)) ?? BlockType.Air;
  }

  public isSolidAt(worldX: number, worldY: number, worldZ: number): boolean {
    const block = this.sampleBlock(worldX, worldY, worldZ);
    return block !== BlockType.Air && block !== BlockType.Water && block !== BlockType.Lava;
  }

  public setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): boolean {
    const key = coordinateKey(worldX, worldY, worldZ);
    if (this.sampleBlock(worldX, worldY, worldZ) === block) return false;
    this.setCalls += 1;
    if (block === BlockType.Air) this.#blocks.delete(key);
    else this.#blocks.set(key, block);
    return true;
  }
}

function buildFlowChannel(world: SparseTickWorld): void {
  for (let x = -1; x <= 9; x += 1) {
    world.prime(x, 3, 0, BlockType.Stone);
    world.prime(x, 4, -1, BlockType.Stone);
    world.prime(x, 4, 1, BlockType.Stone);
  }
  world.prime(-1, 4, 0, BlockType.Stone);
}

function advanceTicks(
  manager: WorldTickManager,
  seconds: number,
  step = 0.15,
): void {
  const count = Math.ceil(seconds / step);
  for (let index = 0; index < count; index += 1) {
    manager.update(0, 4, 0, step);
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

  it('runs a scheduled water tick after a nearby block edit', () => {
    const world = new SparseTickWorld();
    world.prime(0, 4, 0, BlockType.Water);
    const manager = new WorldTickManager(world);

    manager.notifyBlockChanged(0, 4, 0);
    expect(manager.scheduledTickCount).toBeGreaterThan(0);
    expect(manager.update(0, 4, 0, 0.06)).toBe(1);
    expect(world.sampleBlock(0, 3, 0)).toBe(BlockType.Water);
    expect(manager.getFlowLevel(0, 3, 0)).toBe(1);
  });

  it('spreads water across a flat channel with finite 0..7 flow levels', () => {
    const world = new SparseTickWorld();
    buildFlowChannel(world);
    world.prime(0, 4, 0, BlockType.Water);
    const manager = new WorldTickManager(world);

    manager.notifyBlockChanged(0, 4, 0);
    advanceTicks(manager, 2.2);

    for (let x = 0; x <= 7; x += 1) {
      expect(world.sampleBlock(x, 4, 0)).toBe(BlockType.Water);
      expect(manager.getFlowLevel(x, 4, 0)).toBe(x);
    }
    expect(world.sampleBlock(8, 4, 0)).toBe(BlockType.Air);
  });

  it('recedes propagated water after its source is removed', () => {
    const world = new SparseTickWorld();
    buildFlowChannel(world);
    world.prime(0, 4, 0, BlockType.Water);
    const manager = new WorldTickManager(world);
    manager.notifyBlockChanged(0, 4, 0);
    advanceTicks(manager, 2.2);
    expect(world.sampleBlock(6, 4, 0)).toBe(BlockType.Water);

    world.prime(0, 4, 0, BlockType.Air);
    manager.notifyBlockChanged(0, 4, 0);
    advanceTicks(manager, 4);

    for (let x = 1; x <= 7; x += 1) {
      expect(world.sampleBlock(x, 4, 0)).toBe(BlockType.Air);
    }
  });

  it('turns lava into cobblestone when a scheduled tick touches water', () => {
    const world = new SparseTickWorld();
    world.prime(0, 4, 0, BlockType.Lava);
    world.prime(1, 4, 0, BlockType.Water);
    const manager = new WorldTickManager(world);

    manager.scheduleBlockTick(0, 4, 0, 0.01);
    expect(manager.update(0, 4, 0, 0.02)).toBe(1);
    expect(world.sampleBlock(0, 4, 0)).toBe(BlockType.Cobblestone);
  });

  it('deduplicates repeated scheduled ticks for the same coordinate', () => {
    const world = new SparseTickWorld();
    world.prime(0, 4, 0, BlockType.Water);
    const manager = new WorldTickManager(world);

    manager.scheduleBlockTick(0, 4, 0, 0.2);
    manager.scheduleBlockTick(0, 4, 0, 0.4);
    manager.scheduleBlockTick(0, 4, 0, 0.1);

    expect(manager.scheduledTickCount).toBe(1);
  });
});
