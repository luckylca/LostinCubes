import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import {
  getPlayerCameraPose,
  THIRD_PERSON_CAMERA_DISTANCE,
  THIRD_PERSON_SHOULDER_OFFSET,
  THIRD_PERSON_VERTICAL_OFFSET,
} from '../src/player/CameraPose';
import { PLAYER_EYE_HEIGHT } from '../src/player/PlayerView';

function createPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    position: { x: 2, y: 6, z: -3 },
    verticalVelocity: 0,
    horizontalSpeed: 0,
    sprinting: false,
    grounded: true,
    yaw: 0,
    pitch: 0,
    cameraMode: 'third-person',
    paused: false,
    health: 20,
    maximumHealth: 20,
    damageTaken: 0,
    deathCount: 0,
    ...overrides,
  };
}

describe('getPlayerCameraPose', () => {
  it('keeps player aim authoritative while framing over the shoulder', () => {
    const pose = getPlayerCameraPose(createPlayer());
    const eyeY = 6 + PLAYER_EYE_HEIGHT;
    expect(pose.pivot).toEqual({ x: 2, y: eyeY, z: -3 });
    expect(pose.forward).toEqual({ x: 0, y: 0, z: 1 });
    expect(pose.position).toEqual({
      x: 2 + THIRD_PERSON_SHOULDER_OFFSET,
      y: eyeY + THIRD_PERSON_VERTICAL_OFFSET,
      z: -3 - THIRD_PERSON_CAMERA_DISTANCE,
    });
    expect(pose.target).toEqual({ x: pose.position.x, y: pose.position.y, z: pose.position.z + 10 });
  });

  it('keeps the avatar away from the camera center target line', () => {
    const pose = getPlayerCameraPose(createPlayer());
    expect(Math.abs(pose.position.x - pose.pivot.x)).toBeCloseTo(THIRD_PERSON_SHOULDER_OFFSET, 12);
    expect(Math.abs(pose.position.y - pose.pivot.y)).toBeCloseTo(THIRD_PERSON_VERTICAL_OFFSET, 12);
  });

  it('orbits vertically while retaining the shoulder offset', () => {
    const pose = getPlayerCameraPose(createPlayer({ pitch: Math.PI / 2 }));
    expect(pose.position.x).toBeCloseTo(pose.pivot.x + THIRD_PERSON_SHOULDER_OFFSET, 12);
    expect(pose.position.y).toBeCloseTo(pose.pivot.y - THIRD_PERSON_CAMERA_DISTANCE + THIRD_PERSON_VERTICAL_OFFSET, 12);
    expect(pose.position.z).toBeCloseTo(pose.pivot.z, 12);
  });

  it('starts first person at the same eye used for interaction', () => {
    const pose = getPlayerCameraPose(createPlayer({ cameraMode: 'first-person', yaw: Math.PI / 2 }));
    expect(pose.position).toEqual(pose.pivot);
    expect(pose.target.x).toBeCloseTo(pose.pivot.x + 10, 12);
    expect(pose.target.y).toBeCloseTo(pose.pivot.y, 12);
    expect(pose.target.z).toBeCloseTo(pose.pivot.z, 12);
  });
});
