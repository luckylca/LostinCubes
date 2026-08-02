import { describe, expect, it } from 'vitest';
import { KinematicPlayerMotor } from '../src/player/KinematicPlayerMotor';
import {
  voxelBodyCollides,
  voxelBodyIsSupported,
} from '../src/player/VoxelCollision';

const STILL_INPUT = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  jump: false,
  yaw: 0,
} as const;

const FLOOR_Y = 0;
const STANDING_Y = 1.4;

function floorProvider(_worldX: number, worldY: number): boolean {
  return worldY === FLOOR_Y;
}

describe('voxel body collision', () => {
  it('treats touching a floor as support rather than penetration', () => {
    const shape = { radius: 0.34, halfHeight: 0.9 };
    const position = { x: 0, y: STANDING_Y, z: 0 };

    expect(voxelBodyCollides(floorProvider, position, shape)).toBe(false);
    expect(voxelBodyIsSupported(floorProvider, position, shape)).toBe(true);
  });

  it('blocks a two-block wall and preserves axis sliding', () => {
    const isSolidAt = (worldX: number, worldY: number): boolean =>
      worldY === FLOOR_Y ||
      (worldX === 1 && (worldY === 1 || worldY === 2));
    const motor = new KinematicPlayerMotor({
      isSolidAt,
      spawnPosition: { x: 0, y: STANDING_Y, z: 0 },
    });

    for (let index = 0; index < 60; index += 1) {
      motor.update({ ...STILL_INPUT, moveX: 1, moveZ: 1 }, 1 / 60);
    }

    expect(motor.getState().position.x).toBeLessThan(0.2);
    expect(motor.getState().position.z).toBeGreaterThan(1);
    expect(motor.getState().grounded).toBe(true);
  });

  it('steps onto a single full voxel but not a two-voxel wall', () => {
    const oneBlockStep = (worldX: number, worldY: number): boolean =>
      worldY === FLOOR_Y || (worldX === 1 && worldY === 1);
    const motor = new KinematicPlayerMotor({
      isSolidAt: oneBlockStep,
      spawnPosition: { x: 0, y: STANDING_Y, z: 0 },
    });

    for (let index = 0; index < 12; index += 1) {
      motor.update({ ...STILL_INPUT, moveX: 1 }, 1 / 60);
    }

    expect(motor.getState().position.x).toBeGreaterThan(0.5);
    expect(motor.getState().position.y).toBeCloseTo(2.4, 5);
    expect(motor.getState().grounded).toBe(true);
  });

  it('stops upward movement when the head reaches a ceiling', () => {
    const isSolidAt = (_worldX: number, worldY: number): boolean =>
      worldY === FLOOR_Y || worldY === 3;
    const motor = new KinematicPlayerMotor({
      isSolidAt,
      spawnPosition: { x: 0, y: STANDING_Y, z: 0 },
    });
    let maximumY = motor.getState().position.y;

    for (let index = 0; index < 60; index += 1) {
      motor.update({ ...STILL_INPUT, jump: index === 0 }, 1 / 60);
      maximumY = Math.max(maximumY, motor.getState().position.y);
    }

    expect(maximumY).toBeLessThanOrEqual(1.601);
    expect(motor.getState().position.y).toBeCloseTo(STANDING_Y, 4);
    expect(motor.getState().grounded).toBe(true);
  });

  it('does not tunnel through a wall during a large simulation step', () => {
    const isSolidAt = (worldX: number, worldY: number): boolean =>
      worldY === FLOOR_Y ||
      (worldX === 1 && (worldY === 1 || worldY === 2));
    const motor = new KinematicPlayerMotor({
      isSolidAt,
      spawnPosition: { x: 0, y: STANDING_Y, z: 0 },
    });

    motor.update({ ...STILL_INPUT, moveX: 1, sprint: true }, 0.5);

    expect(motor.getState().position.x).toBeLessThan(0.2);
  });
});
