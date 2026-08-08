import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/BlockType';
import type { BlockType as BlockTypeValue } from '../src/world/BlockType';
import { compactRuntimeRenderChanges } from '../src/world/SurvivalWorldRuntime';
import {
  WorldTickManager,
  type RandomTickWorld,
  type WorldTickChange,
} from '../src/world/WorldTickManager';

class StaticTickWorld implements RandomTickWorld {
  public readonly worldSeed = 'world-tick-overload-regression';
  public sampleCalls = 0;

  public sampleBlock(): BlockTypeValue {
    this.sampleCalls += 1;
    return BlockType.Stone;
  }

  public isSolidAt(): boolean {
    return true;
  }

  public setBlock(): boolean {
    return false;
  }
}

function change(worldX: number, worldY: number, worldZ: number): WorldTickChange {
  return {
    worldX,
    worldY,
    worldZ,
    previous: BlockType.Air,
    next: BlockType.Water,
  };
}

describe('world tick overload protection', () => {
  it('hard-caps the deduplicated scheduled queue', () => {
    const world = new StaticTickWorld();
    const manager = new WorldTickManager(world);

    for (let index = 0; index < 3_000; index += 1) {
      manager.scheduleBlockTick(index, 4, 0, 0.05);
    }

    expect(manager.scheduledTickCount).toBe(2_048);
  });

  it('processes at most eight due scheduled ticks in one simulation update', () => {
    const world = new StaticTickWorld();
    const manager = new WorldTickManager(world);

    for (let index = 0; index < 20; index += 1) {
      manager.scheduleBlockTick(index, 4, 0, 0.05);
    }

    manager.update(10, 4, 0, 0.06);

    expect(manager.scheduledTickCount).toBe(12);
    expect(world.sampleCalls).toBe(16);
  });

  it('drops scheduled work outside the active simulation radius before sampling it', () => {
    const world = new StaticTickWorld();
    const manager = new WorldTickManager(world);
    manager.scheduleBlockTick(0, 4, 0, 0.05);
    manager.scheduleBlockTick(100, 4, 0, 0.05);

    manager.update(0, 4, 0, 0.06);

    expect(manager.scheduledTickCount).toBe(0);
    expect(world.sampleCalls).toBe(2);
  });

  it('coalesces natural changes by real section and boundary impact', () => {
    const compacted = compactRuntimeRenderChanges([
      change(1, 2, 1),
      change(2, 3, 2),
      change(15, 2, 1),
      change(0, 2, 1),
      change(2, 9, 2),
      change(3, 10, 3),
    ]);

    expect(compacted).toHaveLength(4);
    expect(compacted).toContainEqual(change(1, 2, 1));
    expect(compacted).toContainEqual(change(15, 2, 1));
    expect(compacted).toContainEqual(change(0, 2, 1));
    expect(compacted).toContainEqual(change(2, 9, 2));
  });
});
