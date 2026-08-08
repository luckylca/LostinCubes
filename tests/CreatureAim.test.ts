import { describe, expect, it } from 'vitest';
import {
  normalizeAngle,
  turnAngleToward,
} from '../src/entities/ClassicEntityManager';

describe('creature aiming', () => {
  it('turns toward a target gradually instead of snapping before a ranged shot', () => {
    const next = turnAngleToward(0, Math.PI / 2, 0.2);
    expect(next).toBeCloseTo(0.2, 8);
    expect(Math.abs(normalizeAngle(Math.PI / 2 - next))).toBeGreaterThan(1);
  });

  it('takes the shortest path across the plus/minus pi wrap', () => {
    const current = Math.PI - 0.08;
    const target = -Math.PI + 0.08;
    const next = turnAngleToward(current, target, 0.05);
    expect(Math.abs(normalizeAngle(target - next))).toBeCloseTo(0.11, 8);
  });
});
