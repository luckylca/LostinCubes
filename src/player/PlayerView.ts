import type { PlayerState } from '../game/session/GameSession';

/** Eye level measured from the player model root. */
export const PLAYER_EYE_HEIGHT = 0.96;
export const PLAYER_BLOCK_REACH = 4.5;

export interface PlayerViewVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Returns the interaction origin shared by first- and third-person views. */
export function getPlayerEyePosition(player: PlayerState): PlayerViewVector {
  return {
    x: player.position.x,
    y: player.position.y + PLAYER_EYE_HEIGHT,
    z: player.position.z,
  };
}

/** Returns the normalized direction the player's head is facing. */
export function getPlayerViewDirection(player: PlayerState): PlayerViewVector {
  const horizontalCosine = Math.cos(player.pitch);
  return {
    x: Math.sin(player.yaw) * horizontalCosine,
    y: Math.sin(player.pitch),
    z: Math.cos(player.yaw) * horizontalCosine,
  };
}
