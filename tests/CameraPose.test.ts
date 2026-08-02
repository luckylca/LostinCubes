import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import {
  getPlayerCameraPose,
  THIRD_PERSON_CAMERA_DISTANCE,
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
    ...overrides,
  };
}

describe('getPlayerCameraPose', () => {
  it('centers third person behind the player eye and view ray', () => {
    const pose = getPlayerCameraPose(createPlayer());
    const eyeY = 6 + PLAYER_EYE_HEIGHT;

    expect(pose.pivot).toEqual({ x: 2, y: eyeY, z: -3 });
    expect(pose.target).toEqual(pose.pivot);
    expect(pose.position).toEqual({
      x: 2,
      y: eyeY,
      z: -3 - THIRD_PERSON_CAMERA_DISTANCE,
    });
  });

  it('orbits vertically around the eye when looking upward', () => {
    const pose = getPlayerCameraPose(
      createPlayer({ pitch: Math.PI / 2 }),
    );

    expect(pose.position.x).toBeCloseTo(pose.pivot.x, 12);
    expect(pose.position.y).toBeCloseTo(
      pose.pivot.y - THIRD_PERSON_CAMERA_DISTANCE,
      12,
    );
    expect(pose.position.z).toBeCloseTo(pose.pivot.z, 12);
  });

  it('starts first person at the same eye used for interaction', () => {
    const pose = getPlayerCameraPose(
      createPlayer({ cameraMode: 'first-person', yaw: Math.PI / 2 }),
    );

    expect(pose.position).toEqual(pose.pivot);
    expect(pose.target.x).toBeCloseTo(pose.pivot.x + 10, 12);
    expect(pose.target.y).toBeCloseTo(pose.pivot.y, 12);
    expect(pose.target.z).toBeCloseTo(pose.pivot.z, 12);
  });
});
