import { describe, expect, it } from 'vitest';
import {
  installBowBallisticsRuntime,
  queuePlayerBowCharge,
} from '../src/entities/BowBallisticsRuntime';
import { EntityRegistry } from '../src/entities/EntityRegistry';

installBowBallisticsRuntime();

function speedOf(velocity: { x: number; y: number; z: number }): number {
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

describe('charged bow ballistics', () => {
  it('makes a full player draw faster and stronger than a weak draw', () => {
    const registry = new EntityRegistry();

    queuePlayerBowCharge(0.1);
    const weak = registry.spawn({
      kind: 'arrow',
      position: { x: 0, y: 2, z: 0 },
      velocity: { x: 0, y: 0, z: 17 },
      ownerId: 'player',
      state: { damage: 5 },
    });

    queuePlayerBowCharge(1);
    const full = registry.spawn({
      kind: 'arrow',
      position: { x: 0, y: 2, z: 0 },
      velocity: { x: 0, y: 0, z: 17 },
      ownerId: 'player',
      state: { damage: 5 },
    });

    expect(weak).not.toBeNull();
    expect(full).not.toBeNull();
    if (weak === null || full === null) return;
    expect(speedOf(weak.velocity)).toBeLessThan(speedOf(full.velocity));
    expect(Number(weak.state.damage)).toBeLessThan(Number(full.state.damage));
    expect(speedOf(full.velocity)).toBeCloseTo(20, 4);
    expect(full.state.bowCharge).toBe(1);
  });

  it('does not alter skeleton arrows', () => {
    const registry = new EntityRegistry();
    queuePlayerBowCharge(1);
    const skeletonArrow = registry.spawn({
      kind: 'arrow',
      position: { x: 0, y: 2, z: 0 },
      velocity: { x: 0, y: 0, z: 12 },
      ownerId: 'skeleton-test',
      state: { damage: 4 },
    });

    expect(skeletonArrow).not.toBeNull();
    if (skeletonArrow === null) return;
    expect(speedOf(skeletonArrow.velocity)).toBeCloseTo(12, 4);
    expect(skeletonArrow.state.damage).toBe(4);
  });
});
