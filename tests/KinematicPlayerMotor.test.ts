import { describe, expect, it } from 'vitest';
import { KinematicPlayerMotor } from '../src/player/KinematicPlayerMotor';

const STILL_INPUT = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  sneak: false,
  jump: false,
  yaw: 0,
} as const;

describe('KinematicPlayerMotor', () => {
  it('jumps and lands back on the standing height', () => {
    const motor = new KinematicPlayerMotor();
    motor.update({ ...STILL_INPUT, jump: true }, 1 / 60);

    expect(motor.getState().grounded).toBe(false);
    expect(motor.getState().position.y).toBeGreaterThan(2.9);

    for (let index = 0; index < 180; index += 1) {
      motor.update(STILL_INPUT, 1 / 60);
    }

    expect(motor.getState().grounded).toBe(true);
    expect(motor.getState().position.y).toBeCloseTo(2.9);
  });

  it('steps onto a half-block height change', () => {
    const motor = new KinematicPlayerMotor({
      groundHeightAt: (worldX) => (worldX >= 0.8 ? 3.4 : 2.9),
    });

    motor.update({ ...STILL_INPUT, moveX: 1 }, 0.25);

    expect(motor.getState().position.x).toBeGreaterThan(0.8);
    expect(motor.getState().position.y).toBeCloseTo(3.4);
    expect(motor.getState().grounded).toBe(true);
  });

  it('blocks terrain steps that are taller than the configured limit', () => {
    const motor = new KinematicPlayerMotor({
      groundHeightAt: (worldX) => (worldX >= 0.8 ? 3.6 : 2.9),
    });

    motor.update({ ...STILL_INPUT, moveX: 1 }, 0.25);

    expect(motor.getState().position.x).toBeCloseTo(0);
    expect(motor.getState().position.y).toBeCloseTo(2.9);
    expect(motor.getState().horizontalSpeed).toBe(0);
  });

  it('starts falling after walking off a tall voxel ledge', () => {
    const motor = new KinematicPlayerMotor({
      groundHeightAt: (worldX) => (worldX >= 0.8 ? 0.9 : 2.9),
    });

    motor.update({ ...STILL_INPUT, moveX: 1 }, 0.25);

    expect(motor.getState().grounded).toBe(false);
    expect(motor.getState().verticalVelocity).toBeLessThan(0);
    expect(motor.getState().position.y).toBeGreaterThan(0.9);
  });

  it('uses fluid drag and swims upward while jump is held', () => {
    const motor = new KinematicPlayerMotor({
      isSolidAt: () => false,
      spawnPosition: { x: 0, y: 3, z: 0 },
      environmentAt: () => ({
        inWater: true,
        inLava: false,
        onLadder: false,
      }),
    });

    for (let index = 0; index < 60; index += 1) {
      motor.update({ ...STILL_INPUT, jump: true, moveZ: 1 }, 1 / 60);
    }

    expect(motor.getState().inWater).toBe(true);
    expect(motor.getState().position.y).toBeGreaterThan(3);
    expect(motor.getState().horizontalSpeed).toBeLessThan(3);
  });

  it('climbs and descends a ladder without normal gravity', () => {
    const motor = new KinematicPlayerMotor({
      isSolidAt: () => false,
      spawnPosition: { x: 0, y: 3, z: 0 },
      environmentAt: () => ({
        inWater: false,
        inLava: false,
        onLadder: true,
      }),
    });

    motor.update({ ...STILL_INPUT, moveZ: 1 }, 0.5);
    const climbedY = motor.getState().position.y;
    motor.update({ ...STILL_INPUT, sneak: true }, 0.5);

    expect(climbedY).toBeGreaterThan(3);
    expect(motor.getState().position.y).toBeLessThan(climbedY);
    expect(motor.getState().onLadder).toBe(true);
  });
});
