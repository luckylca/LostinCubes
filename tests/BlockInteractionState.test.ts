import { describe, expect, it } from 'vitest';
import {
  BlockInteractionState,
  getBlockBreakDuration,
} from '../src/world/BlockInteractionState';
import { BlockType } from '../src/world/BlockType';

function update(
  state: BlockInteractionState,
  overrides: Partial<Parameters<BlockInteractionState['update']>[0]> = {},
) {
  return state.update({
    targetKey: '1,2,3',
    targetBlock: BlockType.Dirt,
    canBreakTarget: true,
    breakHeld: false,
    placeHeld: false,
    breakSpeedMultiplier: 1,
    frameSeconds: 0.1,
    ...overrides,
  });
}

describe('BlockInteractionState', () => {
  it('requires continuous focus on one block before breaking it', () => {
    const state = new BlockInteractionState();
    const expectedStep = 0.1 / getBlockBreakDuration(BlockType.Dirt);

    expect(update(state, { breakHeld: true }).breakProgress).toBeCloseTo(
      expectedStep,
    );
    expect(update(state, { breakHeld: true }).breakNow).toBe(false);
    expect(update(state, { breakHeld: true }).breakNow).toBe(false);
    expect(update(state, { breakHeld: true }).breakNow).toBe(false);
    expect(update(state, { breakHeld: true }).breakNow).toBe(true);
  });

  it('applies the held tool speed multiplier', () => {
    const bareHand = new BlockInteractionState();
    const shovel = new BlockInteractionState();

    const bareProgress = update(bareHand, {
      breakHeld: true,
      targetBlock: BlockType.Dirt,
    }).breakProgress;
    const shovelProgress = update(shovel, {
      breakHeld: true,
      targetBlock: BlockType.Dirt,
      breakSpeedMultiplier: 3.4,
    }).breakProgress;

    expect(shovelProgress).toBeGreaterThan(bareProgress * 3);
    expect(shovelProgress).toBeLessThan(1);
  });

  it('resets mining progress when the target changes or attack is released', () => {
    const state = new BlockInteractionState();
    const expectedStep = 0.1 / getBlockBreakDuration(BlockType.Dirt);

    update(state, { breakHeld: true });
    expect(
      update(state, { breakHeld: true, targetKey: '2,2,3' }).breakProgress,
    ).toBeCloseTo(expectedStep);
    expect(update(state, { breakHeld: false }).breakProgress).toBe(0);
  });

  it('places immediately and repeats while use is held', () => {
    const state = new BlockInteractionState();

    expect(update(state, { placeHeld: true }).placeNow).toBe(true);
    expect(
      update(state, { placeHeld: true, frameSeconds: 0.1 }).placeNow,
    ).toBe(false);
    expect(
      update(state, { placeHeld: true, frameSeconds: 0.1 }).placeNow,
    ).toBe(false);
    expect(
      update(state, { placeHeld: true, frameSeconds: 0.1 }).placeNow,
    ).toBe(true);
  });

  it('gives mining priority when both actions are held', () => {
    const state = new BlockInteractionState();

    const result = update(state, { breakHeld: true, placeHeld: true });

    expect(result.placeNow).toBe(false);
    expect(result.breakProgress).toBeGreaterThan(0);
  });
});
