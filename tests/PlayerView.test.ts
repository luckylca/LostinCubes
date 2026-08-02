import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../src/game/session/GameSession';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
  PLAYER_BLOCK_REACH,
  PLAYER_EYE_HEIGHT,
} from '../src/player/PlayerView';
import { BlockType } from '../src/world/BlockType';
import { raycastVoxels } from '../src/world/VoxelRaycast';

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
  it('uses the collision-aligned standing eye as the interaction origin', () => {
    const eye = getPlayerEyePosition(createPlayer());

    expect(PLAYER_EYE_HEIGHT).toBeCloseTo(0.72, 12);
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

  it('can target the block directly beneath the standing player', () => {
    const player = createPlayer({
      position: { x: 0, y: 1.4, z: 0 },
      pitch: -Math.PI / 2 + 0.003,
    });
    const hit = raycastVoxels(
      getPlayerEyePosition(player),
      getPlayerViewDirection(player),
      PLAYER_BLOCK_REACH,
      (worldX, worldY, worldZ) =>
        worldX === 0 && worldY === 0 && worldZ === 0
          ? BlockType.Stone
          : BlockType.Air,
    );

    expect(hit?.block).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit?.distance).toBeLessThan(2);
  });
});
