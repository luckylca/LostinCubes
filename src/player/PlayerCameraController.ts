import { FreeCamera, Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';

const THIRD_PERSON_DISTANCE = 5;
const THIRD_PERSON_HEIGHT = 1.25;
const HEAD_HEIGHT = 0.62;

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
  readonly #lookDirection = new Vector3();

  public constructor(scene: Scene) {
    this.#scene = scene;
    this.#camera = new FreeCamera('player-camera', this.#currentPosition, scene);
    this.#camera.minZ = 0.05;
    this.#camera.fov = 0.92;
    scene.activeCamera = this.#camera;
  }

  public update(player: PlayerState, frameSeconds: number): void {
    const horizontalCosine = Math.cos(player.pitch);
    this.#lookDirection.set(
      Math.sin(player.yaw) * horizontalCosine,
      Math.sin(player.pitch),
      Math.cos(player.yaw) * horizontalCosine,
    );

    this.#target.set(
      player.position.x,
      player.position.y + HEAD_HEIGHT,
      player.position.z,
    );

    if (player.cameraMode === 'first-person') {
      this.#desiredPosition.copyFrom(this.#target);
    } else {
      const backward = new Vector3(
        -Math.sin(player.yaw) * THIRD_PERSON_DISTANCE,
        THIRD_PERSON_HEIGHT,
        -Math.cos(player.yaw) * THIRD_PERSON_DISTANCE,
      );
      this.#desiredPosition.copyFrom(this.#target).addInPlace(backward);
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

    const lookTarget = this.#target.add(this.#lookDirection.scale(10));
    this.#camera.setTarget(lookTarget);
  }

  #resolveCameraWallCollision(): void {
    const offset = this.#desiredPosition.subtract(this.#target);
    const distance = offset.length();
    if (distance <= 0.001) {
      return;
    }

    const direction = offset.scale(1 / distance);
    const hit = this.#scene.pickWithRay(
      new Ray(this.#target, direction, distance),
      isCameraBlocker,
    );

    if (hit?.hit !== true || hit.distance <= 0) {
      return;
    }

    const safeDistance = Math.max(0.55, hit.distance - 0.25);
    this.#desiredPosition
      .copyFrom(this.#target)
      .addInPlace(direction.scale(safeDistance));
  }
}
