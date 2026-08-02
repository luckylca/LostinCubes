import { FreeCamera, Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  getPlayerEyePosition,
  getPlayerViewDirection,
} from './PlayerView';

const THIRD_PERSON_DISTANCE = 4;

function isCameraBlocker(mesh: AbstractMesh): boolean {
  const metadata = mesh.metadata as { cameraBlocker?: unknown } | null;
  return metadata?.cameraBlocker === true;
}

export class PlayerCameraController {
  readonly #scene: Scene;
  readonly #camera: FreeCamera;
  readonly #currentPosition = new Vector3(0, 4.5, 8);
  readonly #desiredPosition = new Vector3();
  readonly #target = new Vector3();
  readonly #lookTarget = new Vector3();
  readonly #lookDirection = new Vector3();
  readonly #cameraOffset = new Vector3();

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#camera = new FreeCamera('player-camera', this.#currentPosition, scene);
    this.#camera.minZ = 0.05;
    this.#camera.fov = 0.92;
    scene.activeCamera = this.#camera;
  }

  public update(player: PlayerState, frameSeconds: number): void {
    const eye = getPlayerEyePosition(player);
    const direction = getPlayerViewDirection(player);
    this.#target.set(eye.x, eye.y, eye.z);
    this.#lookDirection.set(direction.x, direction.y, direction.z);

    if (player.cameraMode === 'first-person') {
      this.#desiredPosition.copyFrom(this.#target);
    } else {
      this.#lookDirection.scaleToRef(-THIRD_PERSON_DISTANCE, this.#cameraOffset);
      this.#desiredPosition
        .copyFrom(this.#target)
        .addInPlace(this.#cameraOffset);
      this.#resolveCameraWallCollision();
    }

    const blend = 1 - Math.exp(-12 * Math.min(frameSeconds, 0.1));
    Vector3.LerpToRef(
      this.#currentPosition,
      this.#desiredPosition,
      blend,
      this.#currentPosition,
    );
    this.#camera.position.copyFrom(this.#currentPosition);

    this.#lookDirection.scaleToRef(10, this.#lookTarget);
    this.#lookTarget.addInPlace(this.#target);
    this.#camera.setTarget(this.#lookTarget);
  }

  #resolveCameraWallCollision(): void {
    this.#desiredPosition.subtractToRef(this.#target, this.#cameraOffset);
    const distance = this.#cameraOffset.length();
    if (distance <= 0.001) {
      return;
    }

    this.#cameraOffset.scaleInPlace(1 / distance);
    const hit = this.#scene.pickWithRay(
      new Ray(this.#target, this.#cameraOffset, distance),
      isCameraBlocker,
    );

    if (hit?.hit !== true || hit.distance <= 0) {
      return;
    }

    const safeDistance = Math.max(0.55, hit.distance - 0.25);
    this.#cameraOffset.scaleToRef(safeDistance, this.#desiredPosition);
    this.#desiredPosition.addInPlace(this.#target);
  }
}
