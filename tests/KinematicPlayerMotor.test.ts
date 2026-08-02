import { describe, expect, it } from 'vitest';
import { KinematicPlayerMotor } from '../src/player/KinematicPlayerMotor';

const STILL_INPUT = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
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

  it('steps onto a one-block voxel height change', () => {
    const motor = new KinematicPlayerMotor({
      groundHeightAt: (worldX) => (worldX >= 0.8 ? 3.9 : 2.9),
    });

    motor.update({ ...STILL_INPUT, moveX: 1 }, 0.25);

    expect(motor.getState().position.x).toBeGreaterThan(0.8);
    expect(motor.getState().position.y).toBeCloseTo(3.9);
    expect(motor.getState().grounded).toBe(true);
  });

  it('blocks terrain steps that are taller than the configured limit', () => {
    const motor = new KinematicPlayerMotor({
      groundHeightAt: (worldX) => (worldX >= 0.8 ? 5.1 : 2.9),
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
});
