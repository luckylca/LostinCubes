import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
  PLAYER_BLOCK_REACH,
  PLAYER_EYE_HEIGHT,
} from '../src/player/PlayerView';

function createPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    position: { x: 3, y: 7, z: -2 },
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

describe('player view helpers', () => {
  it('uses the player eye as the interaction origin in third person', () => {
    const eye = getPlayerEyePosition(createPlayer());

    expect(eye).toEqual({ x: 3, y: 7 + PLAYER_EYE_HEIGHT, z: -2 });
    expect(PLAYER_BLOCK_REACH).toBe(4.5);
  });

  it('does not change interaction direction when camera mode changes', () => {
    const thirdPerson = createPlayer({ yaw: Math.PI / 2, pitch: Math.PI / 6 });
    const firstPerson = { ...thirdPerson, cameraMode: 'first-person' as const };

    expect(getPlayerViewDirection(thirdPerson)).toEqual(
      getPlayerViewDirection(firstPerson),
    );
  });

  it('returns a normalized yaw and pitch direction', () => {
    const direction = getPlayerViewDirection(
      createPlayer({ yaw: Math.PI / 2, pitch: Math.PI / 6 }),
    );
    const length = Math.hypot(direction.x, direction.y, direction.z);

    expect(length).toBeCloseTo(1, 12);
    expect(direction.x).toBeCloseTo(Math.cos(Math.PI / 6), 12);
    expect(direction.y).toBeCloseTo(0.5, 12);
    expect(direction.z).toBeCloseTo(0, 12);
  });
});
