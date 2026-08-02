import type { PlayerState } from '../game/session/GameSession';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
} from './PlayerView';

export const THIRD_PERSON_CAMERA_DISTANCE = 4;
export const CAMERA_FOV_RADIANS = (70 * Math.PI) / 180;

export interface CameraVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerCameraPose {
  readonly position: CameraVector;
  readonly target: CameraVector;
  readonly pivot: CameraVector;
}

/**
 * Minecraft-style centered camera pose.
 *
 * First person starts at the eye and looks forward. Third person places the
 * camera directly behind the same eye/view ray and looks back at the eye, so
 * the player, reticle, and interaction direction remain aligned.
 */
export function getPlayerCameraPose(
  player: PlayerState,
  thirdPersonDistance = THIRD_PERSON_CAMERA_DISTANCE,
): PlayerCameraPose {
  const pivot = getPlayerEyePosition(player);
  const direction = getPlayerViewDirection(player);

  if (player.cameraMode === 'first-person') {
    return {
      position: pivot,
      pivot,
      target: {
        x: pivot.x + direction.x * 10,
        y: pivot.y + direction.y * 10,
        z: pivot.z + direction.z * 10,
      },
    };
  }

  return {
    pivot,
    position: {
      x: pivot.x - direction.x * thirdPersonDistance,
      y: pivot.y - direction.y * thirdPersonDistance,
      z: pivot.z - direction.z * thirdPersonDistance,
    },
    target: pivot,
  };
}
