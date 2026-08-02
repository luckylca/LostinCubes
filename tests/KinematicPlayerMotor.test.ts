import { describe, expect, it } from 'vitest';
import { KinematicPlayerMotor } from '../src/player/KinematicPlayerMotor';

describe('KinematicPlayerMotor', () => {
  it('jumps and lands back on the standing height', () => {
    const motor = new KinematicPlayerMotor();
    motor.update(
      { moveX: 0, moveZ: 0, sprint: false, jump: true, yaw: 0 },
      1 / 60,
    );

    expect(motor.getState().grounded).toBe(false);
    expect(motor.getState().position.y).toBeGreaterThan(2.9);

    for (let index = 0; index < 180; index += 1) {
      motor.update(
        { moveX: 0, moveZ: 0, sprint: false, jump: false, yaw: 0 },
        1 / 60,
      );
    }

    expect(motor.getState().grounded).toBe(true);
    expect(motor.getState().position.y).toBeCloseTo(2.9);
  });

  it('keeps the player inside the playable island boundary', () => {
    const motor = new KinematicPlayerMotor();

    for (let index = 0; index < 600; index += 1) {
      motor.update(
        { moveX: 1, moveZ: 1, sprint: true, jump: false, yaw: 0 },
        1 / 60,
      );
    }

    expect(Math.abs(motor.getState().position.x)).toBeLessThanOrEqual(4.81);
    expect(Math.abs(motor.getState().position.z)).toBeLessThanOrEqual(4.81);
  });
});
