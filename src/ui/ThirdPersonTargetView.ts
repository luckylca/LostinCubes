import { Matrix, Vector3, Viewport } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { PlayerState } from '../game/session/GameSession';
import type { InteractionTargetPoint } from '../world/VoxelInteractionController';

const POSITION_EPSILON_PX = 0.25;

/**
 * Projects the authoritative player-eye voxel hit onto the real camera view.
 * This is deliberately separate from the fixed first-person crosshair because
 * an offset third-person camera and the player's interaction ray are not the
 * same line in screen space.
 */
export class ThirdPersonTargetView {
  readonly #element: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #scene: Scene;
  readonly #source = new Vector3();
  readonly #identity = Matrix.Identity();
  readonly #viewport = new Viewport(0, 0, 1, 1);
  #visible = false;
  #lastX = Number.NaN;
  #lastY = Number.NaN;

  public constructor(
    element: HTMLElement,
    canvas: HTMLCanvasElement,
    scene: Scene,
  ) {
    this.#element = element;
    this.#canvas = canvas;
    this.#scene = scene;
    this.#setVisible(false);
  }

  public update(
    player: PlayerState,
    target: InteractionTargetPoint | null,
  ): void {
    const camera = this.#scene.activeCamera;
    if (
      player.cameraMode !== 'third-person' ||
      target === null ||
      camera === null
    ) {
      this.#setVisible(false);
      return;
    }

    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      this.#setVisible(false);
      return;
    }

    this.#viewport.width = bounds.width;
    this.#viewport.height = bounds.height;
    this.#source.set(target.x, target.y, target.z);
    const projected = Vector3.Project(
      this.#source,
      this.#identity,
      this.#scene.getTransformMatrix(),
      this.#viewport,
    );
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      projected.z < 0 ||
      projected.z > 1
    ) {
      this.#setVisible(false);
      return;
    }

    const x = bounds.left + projected.x;
    const y = bounds.top + projected.y;
    if (
      !this.#visible ||
      Math.abs(x - this.#lastX) > POSITION_EPSILON_PX ||
      Math.abs(y - this.#lastY) > POSITION_EPSILON_PX
    ) {
      this.#element.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
        'translate(-50%, -50%)';
      this.#lastX = x;
      this.#lastY = y;
    }
    this.#setVisible(true);
  }

  public dispose(): void {
    this.#setVisible(false);
    this.#element.style.removeProperty('transform');
  }

  #setVisible(visible: boolean): void {
    if (visible === this.#visible) {
      return;
    }
    this.#visible = visible;
    this.#element.hidden = !visible;
  }
}
