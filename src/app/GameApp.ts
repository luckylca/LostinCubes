import type { Engine } from '@babylonjs/core';
import { BabylonEngine } from '../engine/BabylonEngine';
import { RenderLoop } from '../engine/RenderLoop';
import { LocalGameSession } from '../game/session/LocalGameSession';
import type { PlayerState } from '../game/session/GameSession';
import { InputManager } from '../input/InputManager';
import {
  loadPlayerInventory,
  savePlayerInventory,
} from '../inventory/InventoryPersistence';
import type { PlayerInventory } from '../inventory/PlayerInventory';
import { PlayerCameraController } from '../player/PlayerCameraController';
import { VoxelPlayerModel } from '../player/VoxelPlayerModel';
import { HotbarView } from '../ui/HotbarView';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';
import { VoxelInteractionController } from '../world/VoxelInteractionController';
import { VoxelWorldData } from '../world/VoxelWorldData';
import { VoxelWorldRenderer } from '../world/VoxelWorldRenderer';
import type { VoxelWorldStats } from '../world/VoxelWorldRenderer';

const WORLD_SEED = 'world-fragment-01';
const SPAWN_X = 0;
const SPAWN_Z = 3.5;

export interface GameUiElements {
  readonly touchControls: HTMLElement | null;
  readonly status: HTMLElement;
  readonly viewMode: HTMLElement;
  readonly position: HTMLElement;
  readonly hotbar: HTMLElement;
}

function formatCount(value: number): string {
  if (value < 1_000) {
    return String(value);
  }
  return `${(value / 1_000).toFixed(1)}k`;
}

function getBlockLabel(block: BlockTypeValue | null): string {
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
    case null:
      return '空手';
  }
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
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
  #inventory: PlayerInventory | null = null;
  #hotbar: HotbarView | null = null;
  #inventoryStorage: Storage | null = null;
  #smoothedFps = 60;

  public constructor(canvas: HTMLCanvasElement, ui: GameUiElements) {
    this.#engineHost = new BabylonEngine(canvas);
    this.#canvas = canvas;
    this.#ui = ui;
  }

  public async start(): Promise<void> {
    const { scene } = this.#engineHost.createWorldScene();
    const worldData = new VoxelWorldData(WORLD_SEED);
    this.#worldData = worldData;
    await worldData.initialize();

    const session = new LocalGameSession(WORLD_SEED, {
      isSolidAt: (worldX, worldY, worldZ) =>
        worldData.isSolidAt(worldX, worldY, worldZ),
      spawnPosition: {
        x: SPAWN_X,
        y: worldData.sampleStandingY(SPAWN_X, SPAWN_Z),
        z: SPAWN_Z,
      },
    });
    const input = new InputManager(this.#canvas, this.#ui.touchControls);
    const inventoryStorage = getLocalStorage();
    const inventory = loadPlayerInventory(WORLD_SEED, inventoryStorage);
    input.selectHotbarSlot(inventory.selectedSlot);
    const hotbar = new HotbarView(this.#ui.hotbar, (slot) => {
      input.selectHotbarSlot(slot);
    });
    let renderedInventoryRevision = -1;
    const syncInventory = (): void => {
      if (inventory.revision === renderedInventoryRevision) {
        return;
      }
      hotbar.render(inventory.snapshot);
      savePlayerInventory(WORLD_SEED, inventory, inventoryStorage);
      renderedInventoryRevision = inventory.revision;
    };
    syncInventory();

    const cameraController = new PlayerCameraController(scene);
    const playerModel = new VoxelPlayerModel(scene);
    const worldRenderer = new VoxelWorldRenderer(scene, worldData, 2);
    const interaction = new VoxelInteractionController(scene, worldData, {
      onBlockChanged: (worldX, worldY, worldZ) =>
        worldRenderer.invalidateBlock(worldX, worldY, worldZ),
      onBlockBroken: (block) => {
        inventory.add(block, 1);
        syncInventory();
      },
      canPlaceBlock: (block) => inventory.canConsumeSelected(block),
      onBlockPlaced: () => {
        inventory.consumeSelected(1);
        syncInventory();
      },
    });
    interaction.setSelectedBlock(inventory.selectedBlock);
    let breakHeld = false;
    let placeHeld = false;

    this.#session = session;
    this.#input = input;
    this.#playerModel = playerModel;
    this.#worldRenderer = worldRenderer;
    this.#interaction = interaction;
    this.#inventory = inventory;
    this.#hotbar = hotbar;
    this.#inventoryStorage = inventoryStorage;

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
      interaction.update(
        player,
        frameSeconds,
        !player.paused && breakHeld,
        !player.paused && placeHeld,
      );
      this.#updateHud(
        player,
        worldStats,
        inventory.selectedBlock,
        interaction.breakProgress,
        input.usesPointerLock && !input.pointerLocked,
        frameSeconds,
      );
    };

    applyPlayerState(initialPlayer, 1 / 60);
    scene.render();

    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene, {
      beforeFrame: () => {
        const worldState = session.getWorldState();
        const command = input.poll(worldState.tick);
        inventory.selectSlot(command.selectedHotbarSlot);
        interaction.setSelectedBlock(inventory.selectedBlock);
        syncInventory();
        breakHeld = command.breakBlock;
        placeHeld = command.placeBlock;
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
    if (this.#inventory !== null) {
      savePlayerInventory(
        WORLD_SEED,
        this.#inventory,
        this.#inventoryStorage,
      );
      this.#inventory = null;
    }
    this.#inventoryStorage = null;

    this.#hotbar?.dispose();
    this.#hotbar = null;

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

  #updateHud(
    player: PlayerState,
    world: VoxelWorldStats,
    selectedBlock: BlockTypeValue | null,
    breakProgress: number,
    awaitingPointerLock: boolean,
    frameSeconds: number,
  ): void {
    if (frameSeconds > 0) {
      const instantaneousFps = Math.min(240, 1 / frameSeconds);
      this.#smoothedFps += (instantaneousFps - this.#smoothedFps) * 0.08;
    }

    const worldProgress = `${String(world.loadedChunks)}/${String(world.desiredChunks)}`;
    const queueLabel =
      world.pendingChunks > 0 ? ` · 队列 ${String(world.pendingChunks)}` : '';
    const breakLabel =
      breakProgress > 0
        ? ` · 挖掘 ${Math.round(breakProgress * 100).toString()}%`
        : '';

    if (awaitingPointerLock) {
      this.#ui.status.textContent = player.paused
        ? '已暂停 · 点击画面继续'
        : '点击锁定鼠标，或按住画面拖动观察';
    } else {
      this.#ui.status.textContent = player.paused
        ? '已暂停'
        : [
            '探索中',
            `${worldProgress} 区块${queueLabel}`,
            `${formatCount(world.visibleQuads)} 四边形`,
            `${Math.round(this.#smoothedFps).toString()} FPS${breakLabel}`,
          ].join(' · ');
    }

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
