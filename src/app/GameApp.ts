import type { Engine } from '@babylonjs/core';
import { GameAudio } from '../audio/GameAudio';
import type { CraftingStation } from '../crafting/CraftingRecipes';
import { BabylonEngine } from '../engine/BabylonEngine';
import { RenderLoop } from '../engine/RenderLoop';
import { LocalGameSession } from '../game/session/LocalGameSession';
import type { PlayerState } from '../game/session/GameSession';
import { InputManager } from '../input/InputManager';
import {
  loadPlayerInventory,
  savePlayerInventory,
} from '../inventory/InventoryPersistence';
import {
  getBlockDropItem,
  getItemLabel,
} from '../inventory/ItemDefinitions';
import type { ItemType } from '../inventory/ItemDefinitions';
import type { PlayerInventory } from '../inventory/PlayerInventory';
import { PlayerCameraController } from '../player/PlayerCameraController';
import { VoxelPlayerModel } from '../player/VoxelPlayerModel';
import { HotbarView } from '../ui/HotbarView';
import { InventoryView } from '../ui/InventoryView';
import { ThirdPersonTargetView } from '../ui/ThirdPersonTargetView';
import { BlockType } from '../world/BlockType';
import {
  loadDroppedItems,
  saveDroppedItems,
} from '../world/DropPersistence';
import { DroppedItemManager } from '../world/DroppedItemManager';
import { VoxelBreakEffects } from '../world/VoxelBreakEffects';
import { VoxelInteractionController } from '../world/VoxelInteractionController';
import { VoxelWorldData } from '../world/VoxelWorldData';
import { VoxelWorldRenderer } from '../world/VoxelWorldRenderer';
import type { VoxelWorldStats } from '../world/VoxelWorldRenderer';

const WORLD_SEED = 'world-fragment-01';
const SPAWN_X = 0;
const SPAWN_Z = 3.5;
const DROP_SAVE_INTERVAL_SECONDS = 2;

type CameraMode = PlayerState['cameraMode'];

export interface GameUiElements {
  readonly touchControls: HTMLElement | null;
  readonly status: HTMLElement;
  readonly viewMode: HTMLElement;
  readonly position: HTMLElement;
  readonly hotbar: HTMLElement;
  readonly targetReticle: HTMLElement;
  readonly inventoryRoot: HTMLElement;
}

function formatCount(value: number): string {
  if (value < 1_000) return String(value);
  return `${(value / 1_000).toFixed(1)}k`;
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
  #drops: DroppedItemManager | null = null;
  #effects: VoxelBreakEffects | null = null;
  #audio: GameAudio | null = null;
  #inventory: PlayerInventory | null = null;
  #hotbar: HotbarView | null = null;
  #inventoryView: InventoryView | null = null;
  #targetView: ThirdPersonTargetView | null = null;
  #localStorage: Storage | null = null;
  #lastCameraMode: CameraMode | null = null;
  #lastHeldItem: ItemType | null | undefined;
  #dropSaveElapsed = 0;
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
      isSolidAt: (worldX, worldY, worldZ) => worldData.isSolidAt(worldX, worldY, worldZ),
      spawnPosition: {
        x: SPAWN_X,
        y: worldData.sampleStandingY(SPAWN_X, SPAWN_Z),
        z: SPAWN_Z,
      },
    });
    const input = new InputManager(this.#canvas, this.#ui.touchControls);
    const localStorage = getLocalStorage();
    const inventory = loadPlayerInventory(WORLD_SEED, localStorage);
    input.selectHotbarSlot(inventory.selectedSlot);
    const hotbar = new HotbarView(this.#ui.hotbar, (slot) => input.selectHotbarSlot(slot));
    const audio = new GameAudio();
    const inventoryViewHolder: { current: InventoryView | null } = { current: null };
    let renderedInventoryRevision = -1;
    const syncInventory = (): void => {
      if (inventory.revision === renderedInventoryRevision) return;
      hotbar.render(inventory.snapshot);
      inventoryViewHolder.current?.render();
      savePlayerInventory(WORLD_SEED, inventory, localStorage);
      renderedInventoryRevision = inventory.revision;
    };

    let breakHeld = false;
    let placeHeld = false;
    const closeMenuState = (): void => {
      input.setUiOpen(false);
      session.setMenuOpen(false);
      this.#canvas.dataset.inventoryOpen = 'false';
    };
    const inventoryView = new InventoryView(this.#ui.inventoryRoot, inventory, {
      onChanged: syncInventory,
      onClose: closeMenuState,
      onCrafted: () => audio.playCraft(),
    });
    inventoryViewHolder.current = inventoryView;
    const openInventory = (station: CraftingStation): void => {
      breakHeld = false;
      placeHeld = false;
      inventoryView.open(station);
      input.setUiOpen(true);
      session.setMenuOpen(true);
      this.#canvas.dataset.inventoryOpen = 'true';
    };
    this.#canvas.dataset.inventoryOpen = 'false';
    syncInventory();

    const cameraController = new PlayerCameraController(scene);
    const playerModel = new VoxelPlayerModel(scene);
    const targetView = new ThirdPersonTargetView(this.#ui.targetReticle, this.#canvas, scene);
    const worldRenderer = new VoxelWorldRenderer(scene, worldData, 2);
    const effects = new VoxelBreakEffects(scene);
    const drops = new DroppedItemManager(scene, worldData, {
      onPickup: (item, count) => {
        const remaining = inventory.addItem(item, count);
        syncInventory();
        return remaining;
      },
      onPickupSucceeded: () => audio.playPickup(),
    });
    drops.restore(loadDroppedItems(WORLD_SEED, localStorage));

    const interaction = new VoxelInteractionController(scene, worldData, {
      onBlockChanged: (worldX, worldY, worldZ) => worldRenderer.invalidateBlock(worldX, worldY, worldZ),
      onBlockBroken: (block, position) => {
        effects.spawn(block, position.x, position.y, position.z);
        audio.playBreak(block);
        const dropItem = getBlockDropItem(block, inventory.selectedItem);
        if (dropItem === null) return;
        const remaining = drops.spawn(dropItem, position.x, position.y, position.z, 1);
        if (remaining > 0) {
          inventory.addItem(dropItem, remaining);
          syncInventory();
        }
      },
      canPlaceBlock: (block) => inventory.canConsumeSelectedBlock(block),
      onBlockPlaced: (block) => {
        inventory.consumeSelectedBlock(1);
        audio.playPlace(block);
        syncInventory();
      },
      onToolUsed: () => {
        inventory.damageSelectedTool(1);
        syncInventory();
      },
      onUseBlock: (block) => {
        if (block === BlockType.CraftingTable) {
          openInventory('crafting-table');
          return true;
        }
        if (block === BlockType.Furnace) {
          openInventory('furnace');
          return true;
        }
        return false;
      },
    });
    interaction.setHeldItem(inventory.selectedItem);

    this.#session = session;
    this.#input = input;
    this.#playerModel = playerModel;
    this.#worldRenderer = worldRenderer;
    this.#interaction = interaction;
    this.#drops = drops;
    this.#effects = effects;
    this.#audio = audio;
    this.#inventory = inventory;
    this.#hotbar = hotbar;
    this.#inventoryView = inventoryView;
    this.#targetView = targetView;
    this.#localStorage = localStorage;

    await session.start();
    const initialPlayer = session.getWorldState().player;
    await worldRenderer.initialize(initialPlayer.position.x, initialPlayer.position.z);

    const applyPlayerState = (player: PlayerState, frameSeconds: number): void => {
      const worldStats = worldRenderer.update(player.position.x, player.position.z);
      interaction.update(
        player,
        frameSeconds,
        !player.paused && breakHeld,
        !player.paused && placeHeld,
      );
      const simulationSeconds = player.paused ? 0 : frameSeconds;
      drops.update(player, simulationSeconds);
      effects.update(simulationSeconds);
      cameraController.update(player, frameSeconds);
      targetView.update(player, interaction.targetPoint);
      playerModel.update(player, frameSeconds, {
        breaking: !player.paused && breakHeld && interaction.hasTarget,
        placing: !player.paused && placeHeld && interaction.hasTarget,
        breakProgress: interaction.breakProgress,
        heldItem: inventory.selectedItem,
      });
      this.#syncCameraMode(player.cameraMode);
      this.#syncPresentationDiagnostics(player, inventory.selectedItem, interaction.hasTarget);
      this.#updateHud(
        player,
        worldStats,
        inventory.selectedItem,
        interaction.breakProgress,
        drops.activeCount,
        input.usesPointerLock && !input.pointerLocked,
        inventoryView.isOpen,
        frameSeconds,
      );

      this.#dropSaveElapsed += frameSeconds;
      if (this.#dropSaveElapsed >= DROP_SAVE_INTERVAL_SECONDS) {
        this.#dropSaveElapsed = 0;
        saveDroppedItems(WORLD_SEED, drops.snapshots, localStorage);
      }
    };

    applyPlayerState(initialPlayer, 1 / 60);
    scene.render();

    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene, {
      beforeFrame: () => {
        const worldState = session.getWorldState();
        const command = input.poll(worldState.tick);
        if (command.toggleInventory) {
          if (inventoryView.isOpen) inventoryView.close();
          else openInventory('inventory');
        }
        if (!inventoryView.isOpen) {
          inventory.selectSlot(command.selectedHotbarSlot);
          interaction.setHeldItem(inventory.selectedItem);
          breakHeld = command.breakBlock;
          placeHeld = command.placeBlock;
        } else {
          breakHeld = false;
          placeHeld = false;
        }
        syncInventory();
        session.submitCommand(command);
      },
      fixedUpdate: (stepSeconds) => session.step(stepSeconds),
      renderUpdate: (frameSeconds) => applyPlayerState(session.getWorldState().player, frameSeconds),
    });
    this.#renderLoop.start();
  }

  public dispose(): void {
    document.body.classList.remove('camera-third-person', 'inventory-open');
    this.#canvas.removeAttribute('data-camera-mode');
    this.#canvas.removeAttribute('data-held-item');
    this.#canvas.removeAttribute('data-player-pitch');
    this.#canvas.removeAttribute('data-has-target');
    this.#canvas.removeAttribute('data-inventory-open');
    this.#lastCameraMode = null;
    this.#lastHeldItem = undefined;
    this.#inventoryView?.dispose();
    this.#inventoryView = null;
    this.#targetView?.dispose();
    this.#targetView = null;
    if (this.#drops !== null) {
      saveDroppedItems(WORLD_SEED, this.#drops.snapshots, this.#localStorage);
      this.#drops.dispose();
      this.#drops = null;
    }
    this.#effects?.dispose();
    this.#effects = null;
    this.#audio?.dispose();
    this.#audio = null;
    if (this.#inventory !== null) {
      savePlayerInventory(WORLD_SEED, this.#inventory, this.#localStorage);
      this.#inventory = null;
    }
    this.#localStorage = null;
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

  #syncCameraMode(cameraMode: CameraMode): void {
    if (cameraMode === this.#lastCameraMode) return;
    this.#lastCameraMode = cameraMode;
    const thirdPerson = cameraMode === 'third-person';
    document.body.classList.toggle('camera-third-person', thirdPerson);
    this.#canvas.dataset.cameraMode = cameraMode;
  }

  #syncPresentationDiagnostics(
    player: PlayerState,
    heldItem: ItemType | null,
    hasTarget: boolean,
  ): void {
    this.#canvas.dataset.playerPitch = player.pitch.toFixed(4);
    this.#canvas.dataset.hasTarget = String(hasTarget);
    if (heldItem !== this.#lastHeldItem) {
      this.#lastHeldItem = heldItem;
      this.#canvas.dataset.heldItem = heldItem ?? 'empty';
    }
  }

  #updateHud(
    player: PlayerState,
    world: VoxelWorldStats,
    selectedItem: ItemType | null,
    breakProgress: number,
    activeDrops: number,
    awaitingPointerLock: boolean,
    inventoryOpen: boolean,
    frameSeconds: number,
  ): void {
    if (frameSeconds > 0) {
      const instantaneousFps = Math.min(240, 1 / frameSeconds);
      this.#smoothedFps += (instantaneousFps - this.#smoothedFps) * 0.08;
    }
    const worldProgress = `${String(world.loadedChunks)}/${String(world.desiredChunks)}`;
    const queueLabel = world.pendingChunks > 0 ? ` · 队列 ${String(world.pendingChunks)}` : '';
    const dropLabel = activeDrops > 0 ? ` · 掉落 ${String(activeDrops)}` : '';
    const breakLabel = breakProgress > 0 ? ` · 挖掘 ${Math.round(breakProgress * 100).toString()}%` : '';
    if (inventoryOpen) {
      this.#ui.status.textContent = '背包已打开 · E 或 Esc 关闭';
    } else if (awaitingPointerLock) {
      this.#ui.status.textContent = player.paused ? '已暂停 · 点击画面继续' : '点击锁定鼠标，或按住画面拖动观察';
    } else {
      this.#ui.status.textContent = player.paused
        ? '已暂停'
        : [
            '探索中',
            `${worldProgress} 区块${queueLabel}`,
            `${formatCount(world.visibleQuads)} 四边形${dropLabel}`,
            `${Math.round(this.#smoothedFps).toString()} FPS${breakLabel}`,
          ].join(' · ');
    }
    this.#ui.viewMode.textContent = `${player.cameraMode === 'first-person' ? '第一人称' : '第三人称'} · ${getItemLabel(selectedItem)}`;
    this.#ui.position.textContent = [
      player.position.x.toFixed(1),
      player.position.y.toFixed(1),
      player.position.z.toFixed(1),
    ].join(', ');
  }
}
