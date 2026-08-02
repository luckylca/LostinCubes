import { FreeCamera, Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import {
  CAMERA_FOV_RADIANS,
  getPlayerCameraPose,
} from './CameraPose';

function isCameraBlocker(mesh: AbstractMesh): boolean {
  const metadata = mesh.metadata as { cameraBlocker?: unknown } | null;
  return metadata?.cameraBlocker === true;
}

export class PlayerCameraController {
  readonly #scene: Scene;
  readonly #camera: FreeCamera;
  readonly #desiredPosition = new Vector3();
  readonly #target = new Vector3();
  readonly #pivot = new Vector3();
  readonly #forward = new Vector3();
  readonly #cameraOffset = new Vector3();

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#camera = new FreeCamera(
      'player-camera',
      new Vector3(0, 3, 0),
      scene,
    );
    this.#camera.minZ = 0.05;
    this.#camera.fov = CAMERA_FOV_RADIANS;
    scene.activeCamera = this.#camera;
  }

  public update(player: PlayerState, frameSeconds: number): void {
    void frameSeconds;
    const pose = getPlayerCameraPose(player);
    this.#desiredPosition.set(
      pose.position.x,
      pose.position.y,
      pose.position.z,
    );
    this.#pivot.set(pose.pivot.x, pose.pivot.y, pose.pivot.z);
    this.#forward.set(pose.forward.x, pose.forward.y, pose.forward.z);

    if (player.cameraMode === 'third-person') {
      this.#resolveCameraWallCollision();
    }

    // Keep camera rotation exactly parallel to the authoritative player view.
    // The UI projects the real eye-ray hit point instead of pretending that
    // the center of an offset third-person camera is the interaction ray.
    this.#forward.scaleToRef(10, this.#target);
    this.#target.addInPlace(this.#desiredPosition);
    this.#camera.position.copyFrom(this.#desiredPosition);
    this.#camera.setTarget(this.#target);
  }

  #resolveCameraWallCollision(): void {
    this.#desiredPosition.subtractToRef(this.#pivot, this.#cameraOffset);
    const distance = this.#cameraOffset.length();
    if (distance <= 0.001) {
      return;
    }

    this.#cameraOffset.scaleInPlace(1 / distance);
    const hit = this.#scene.pickWithRay(
      new Ray(this.#pivot, this.#cameraOffset, distance),
      isCameraBlocker,
    );

    if (hit?.hit !== true || hit.distance <= 0) {
      return;
    }

    const safeDistance = Math.max(0.35, hit.distance - 0.2);
    this.#cameraOffset.scaleToRef(safeDistance, this.#desiredPosition);
    this.#desiredPosition.addInPlace(this.#pivot);
  }
}
