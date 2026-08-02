import type { Engine } from '@babylonjs/core';
import { BabylonEngine } from '../engine/BabylonEngine';
import { RenderLoop } from '../engine/RenderLoop';
import { LocalGameSession } from '../game/session/LocalGameSession';
import type { PlayerState } from '../game/session/GameSession';
import { InputManager } from '../input/InputManager';
import { PlayerCameraController } from '../player/PlayerCameraController';

export interface GameUiElements {
  readonly touchControls: HTMLElement | null;
  readonly status: HTMLElement;
  readonly viewMode: HTMLElement;
  readonly position: HTMLElement;
}

export class GameApp {
  readonly #engineHost: BabylonEngine;
  readonly #canvas: HTMLCanvasElement;
  readonly #ui: GameUiElements;
  #renderLoop: RenderLoop | null = null;
  #input: InputManager | null = null;
  #session: LocalGameSession | null = null;

  public constructor(canvas: HTMLCanvasElement, ui: GameUiElements) {
    this.#engineHost = new BabylonEngine(canvas);
    this.#canvas = canvas;
    this.#ui = ui;
  }

  public start(): void {
    const { scene, playerMesh } = this.#engineHost.createPrototypeScene();
    const session = new LocalGameSession('world-fragment-01');
    const input = new InputManager(this.#canvas, this.#ui.touchControls);
    const cameraController = new PlayerCameraController(scene);

    this.#session = session;
    this.#input = input;
    void session.start();

    const applyPlayerState = (player: PlayerState, frameSeconds: number): void => {
      playerMesh.position.set(
        player.position.x,
        player.position.y,
        player.position.z,
      );
      playerMesh.rotation.y = player.yaw;
      playerMesh.visibility = player.cameraMode === 'first-person' ? 0 : 1;
      cameraController.update(player, frameSeconds);
      this.#updateHud(player);
    };

    applyPlayerState(session.getWorldState().player, 1 / 60);
    scene.render();

    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene, {
      beforeFrame: () => {
        const worldState = session.getWorldState();
        session.submitCommand(input.poll(worldState.tick));
      },
      fixedUpdate: (stepSeconds) => session.step(stepSeconds),
      renderUpdate: (frameSeconds) => {
        applyPlayerState(session.getWorldState().player, frameSeconds);
      },
    });
    this.#renderLoop.start();
  }

  public dispose(): void {
    this.#input?.dispose();
    this.#input = null;

    if (this.#session !== null) {
      void this.#session.stop();
      this.#session = null;
    }

    this.#renderLoop?.stop();
    this.#renderLoop = null;
    this.#engineHost.dispose();
  }

  public get engine(): Engine {
    return this.#engineHost.engine;
  }

  #updateHud(player: PlayerState): void {
    this.#ui.status.textContent = player.paused ? '已暂停' : '探索中';
    this.#ui.viewMode.textContent =
      player.cameraMode === 'first-person' ? '第一人称' : '第三人称';
    this.#ui.position.textContent = [
      player.position.x.toFixed(1),
      player.position.y.toFixed(1),
      player.position.z.toFixed(1),
    ].join(', ');
  }
}
