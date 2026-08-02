import type { PlayerState } from '../game/session/GameSession';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
} from './PlayerView';

export const THIRD_PERSON_CAMERA_DISTANCE = 4;
export const THIRD_PERSON_SHOULDER_OFFSET = 0.72;
export const THIRD_PERSON_VERTICAL_OFFSET = 0.28;
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
  readonly forward: CameraVector;
}

/**
 * Keeps interaction and camera responsibilities separate.
 *
 * The player's eye/yaw/pitch remain the authoritative Minecraft-style aim.
 * First person uses that ray directly. Third person keeps the same rotation but
 * offsets the camera over the right shoulder, leaving the player model out of
 * the target line. The actual hit point is projected separately by the UI.
 */
export function getPlayerCameraPose(
  player: PlayerState,
  thirdPersonDistance = THIRD_PERSON_CAMERA_DISTANCE,
): PlayerCameraPose {
  const pivot = getPlayerEyePosition(player);
  const forward = getPlayerViewDirection(player);

  if (player.cameraMode === 'first-person') {
    return {
      position: pivot,
      pivot,
      forward,
      target: {
        x: pivot.x + forward.x * 10,
        y: pivot.y + forward.y * 10,
        z: pivot.z + forward.z * 10,
      },
    };
  }

  const right = {
    x: Math.cos(player.yaw),
    y: 0,
    z: -Math.sin(player.yaw),
  };
  const position = {
    x:
      pivot.x -
      forward.x * thirdPersonDistance +
      right.x * THIRD_PERSON_SHOULDER_OFFSET,
    y:
      pivot.y -
      forward.y * thirdPersonDistance +
      THIRD_PERSON_VERTICAL_OFFSET,
    z:
      pivot.z -
      forward.z * thirdPersonDistance +
      right.z * THIRD_PERSON_SHOULDER_OFFSET,
  };

  return {
    pivot,
    position,
    forward,
    target: {
      x: position.x + forward.x * 10,
      y: position.y + forward.y * 10,
      z: position.z + forward.z * 10,
    },
  };
}
