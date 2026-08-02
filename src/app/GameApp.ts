import type { Engine } from '@babylonjs/core';
import { BabylonEngine } from '../engine/BabylonEngine';
import { RenderLoop } from '../engine/RenderLoop';
import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';
import { LocalGameSession } from '../game/session/LocalGameSession';
import type { PlayerState } from '../game/session/GameSession';
import { InputManager } from '../input/InputManager';
import { PlayerCameraController } from '../player/PlayerCameraController';
import { VoxelPlayerModel } from '../player/VoxelPlayerModel';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';
import { VoxelInteractionController } from '../world/VoxelInteractionController';
import { VoxelWorldData } from '../world/VoxelWorldData';
import { VoxelWorldRenderer } from '../world/VoxelWorldRenderer';
import type { VoxelWorldStats } from '../world/VoxelWorldRenderer';

const WORLD_SEED = 'world-fragment-01';

export interface GameUiElements {
  readonly touchControls: HTMLElement | null;
  readonly status: HTMLElement;
  readonly viewMode: HTMLElement;
  readonly position: HTMLElement;
}

function formatCount(value: number): string {
  if (value < 1_000) {
    return String(value);
  }
  return `${(value / 1_000).toFixed(1)}k`;
}

function getBlockLabel(block: BlockTypeValue): string {
  switch (block) {
    case BlockType.Grass:
      return '草方块';
    case BlockType.Dirt:
      return '泥土';
    case BlockType.Stone:
      return '石头';
    case BlockType.RuneStone:
      return '符文石';
    case BlockType.Air:
      return '空气';
  }
}

export class GameApp {
  readonly #engineHost: BabylonEngine;
  readonly #canvas: HTMLCanvasElement;
  readonly #ui: GameUiElements;
  #renderLoop: RenderLoop | null = null;
  #input: InputManager | null = null;
  #session: LocalGameSession | null = null;
  #playerModel: VoxelPlayerModel | null = null;
  #worldData: VoxelWorldData | null = null;
  #worldRenderer: VoxelWorldRenderer | null = null;
  #interaction: VoxelInteractionController | null = null;
  #smoothedFps = 60;

  public constructor(canvas: HTMLCanvasElement, ui: GameUiElements) {
    this.#engineHost = new BabylonEngine(canvas);
    this.#canvas = canvas;
    this.#ui = ui;
  }

  public async start(): Promise<void> {
    const { scene } = this.#engineHost.createWorldScene();
    const worldData = new VoxelWorldData(WORLD_SEED);
    const session = new LocalGameSession(
      WORLD_SEED,
      (worldX, worldZ) => worldData.sampleStandingY(worldX, worldZ),
    );
    const input = new InputManager(this.#canvas, this.#ui.touchControls);
    const cameraController = new PlayerCameraController(scene);
    const playerModel = new VoxelPlayerModel(scene);
    const worldRenderer = new VoxelWorldRenderer(scene, worldData, 2);
    const interaction = new VoxelInteractionController(
      scene,
      worldData,
      (worldX, worldY, worldZ) =>
        worldRenderer.invalidateBlock(worldX, worldY, worldZ),
    );

    this.#session = session;
    this.#input = input;
    this.#playerModel = playerModel;
    this.#worldData = worldData;
    this.#worldRenderer = worldRenderer;
    this.#interaction = interaction;

    await worldData.initialize();
    await session.start();
    const initialPlayer = session.getWorldState().player;
    await worldRenderer.initialize(
      initialPlayer.position.x,
      initialPlayer.position.z,
    );

    const applyPlayerState = (
      player: PlayerState,
      frameSeconds: number,
    ): void => {
      const worldStats = worldRenderer.update(
        player.position.x,
        player.position.z,
      );
      playerModel.update(player, frameSeconds);
      cameraController.update(player, frameSeconds);
      interaction.update(cameraController.createInteractionRay());
      this.#updateHud(
        player,
        worldStats,
        interaction.selectedBlock,
        frameSeconds,
      );
    };

    applyPlayerState(initialPlayer, 1 / 60);
    scene.render();

    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene, {
      beforeFrame: () => {
        const worldState = session.getWorldState();
        const command = input.poll(worldState.tick);
        this.#handleWorldInteraction(command, worldState.player, interaction);
        session.submitCommand(command);
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

    this.#interaction?.dispose();
    this.#interaction = null;

    this.#playerModel?.dispose();
    this.#playerModel = null;

    this.#worldRenderer?.dispose();
    this.#worldRenderer = null;

    this.#worldData?.dispose();
    this.#worldData = null;

    this.#renderLoop?.stop();
    this.#renderLoop = null;
    this.#engineHost.dispose();
  }

  public get engine(): Engine {
    return this.#engineHost.engine;
  }

  #handleWorldInteraction(
    command: PlayerInputCommand,
    player: PlayerState,
    interaction: VoxelInteractionController,
  ): void {
    interaction.setSelectedBlock(command.selectedBlock);
    if (player.paused) {
      return;
    }
    if (command.breakBlock) {
      interaction.breakTarget();
    }
    if (command.placeBlock) {
      interaction.placeTarget(player);
    }
  }

  #updateHud(
    player: PlayerState,
    world: VoxelWorldStats,
    selectedBlock: BlockTypeValue,
    frameSeconds: number,
  ): void {
    if (frameSeconds > 0) {
      const instantaneousFps = Math.min(240, 1 / frameSeconds);
      this.#smoothedFps += (instantaneousFps - this.#smoothedFps) * 0.08;
    }

    const worldProgress = `${String(world.loadedChunks)}/${String(world.desiredChunks)}`;
    const queueLabel =
      world.pendingChunks > 0 ? ` · 队列 ${String(world.pendingChunks)}` : '';
    this.#ui.status.textContent = player.paused
      ? '已暂停'
      : [
          '探索中',
          `${worldProgress} 区块${queueLabel}`,
          `${formatCount(world.visibleQuads)} 四边形`,
          `${Math.round(this.#smoothedFps).toString()} FPS`,
        ].join(' · ');
    this.#ui.viewMode.textContent = `${
      player.cameraMode === 'first-person' ? '第一人称' : '第三人称'
    } · ${getBlockLabel(selectedBlock)}`;
    this.#ui.position.textContent = [
      player.position.x.toFixed(1),
      player.position.y.toFixed(1),
      player.position.z.toFixed(1),
    ].join(', ');
  }
}
