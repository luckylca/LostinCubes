import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../src/game/simulation/SimulationClock';

describe('SimulationClock', () => {
  it('advances gameplay using deterministic fixed steps', () => {
    const clock = new SimulationClock(0.1, 0.5);
    const ticks: number[] = [];

    const result = clock.advance(0.35, (_step, tick) => ticks.push(tick));

    expect(ticks).toEqual([1, 2, 3]);
    expect(result.steps).toBe(3);
    expect(result.alpha).toBeCloseTo(0.5);
  });

  it('caps long frames to prevent an update spiral', () => {
    const clock = new SimulationClock(0.01, 0.25, 4);
    let calls = 0;

    const result = clock.advance(10, () => {
      calls += 1;
    });

    expect(calls).toBe(4);
    expect(result.alpha).toBeLessThanOrEqual(1);
  });
});
