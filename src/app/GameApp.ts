import type { Engine } from '@babylonjs/core';
import { GameAudio } from '../audio/GameAudio';
import { FurnaceManager } from '../crafting/FurnaceManager';
import type { FurnacePosition } from '../crafting/FurnaceManager';
import type { CraftingStation } from '../crafting/CraftingRecipes';
import { BabylonEngine } from '../engine/BabylonEngine';
import { NightStalkerManager } from '../entities/NightStalkerManager';
import { RenderLoop } from '../engine/RenderLoop';
import {
  LocalGameSession,
  PLAYER_MAXIMUM_HEALTH,
} from '../game/session/LocalGameSession';
import type { PlayerState, WorldState } from '../game/session/GameSession';
import {
  loadSurvivalSnapshot,
  saveSurvivalSnapshot,
} from '../game/session/SurvivalPersistence';
import { InputManager } from '../input/InputManager';
import {
  loadPlayerInventory,
  savePlayerInventory,
} from '../inventory/InventoryPersistence';
import {
  getArmorPoints,
  getBlockDropItem,
  getFoodHealing,
  getFoodHunger,
  getItemLabel,
  isBowItem,
  isTntItem,
  ItemType,
} from '../inventory/ItemDefinitions';
import type { ItemType as ItemTypeValue } from '../inventory/ItemDefinitions';
import type {
  InventorySlotSnapshot,
  PlayerInventory,
} from '../inventory/PlayerInventory';
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
const SAVE_INTERVAL_SECONDS = 2;
const FURNACE_REFRESH_SECONDS = 0.12;
const WALK_STREAMING_LOOKAHEAD = 1.65;
const SPRINT_STREAMING_LOOKAHEAD = 2.45;
const RUNTIME_LOADING_DELAY_MILLISECONDS = 140;

type CameraMode = PlayerState['cameraMode'];

export interface GameUiElements {
  readonly touchControls: HTMLElement | null;
  readonly status: HTMLElement;
  readonly viewMode: HTMLElement;
  readonly position: HTMLElement;
  readonly hotbar: HTMLElement;
  readonly targetReticle: HTMLElement;
  readonly inventoryRoot: HTMLElement;
  readonly loadingScreen: HTMLElement;
  readonly loadingMessage: HTMLElement;
  readonly loadingSpinner: HTMLElement;
  readonly loadingAction: HTMLButtonElement;
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

function formatDayTime(dayTime: number): string {
  const totalMinutes = Math.floor((((dayTime % 1) + 1) % 1) * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}

function shouldDropApple(x: number, y: number, z: number): boolean {
  const hash =
    Math.imul(x, 73_856_093) ^
    Math.imul(y, 19_349_663) ^
    Math.imul(z, 83_492_791);
  return (hash >>> 0) % 8 === 0;
}

function getInventoryArmorPoints(inventory: PlayerInventory): number {
  const armorItems = [
    ItemType.IronHelmet,
    ItemType.IronChestplate,
    ItemType.IronLeggings,
    ItemType.IronBoots,
  ] as const;
  return armorItems.reduce(
    (total, item) =>
      total + (inventory.countItem(item) > 0 ? getArmorPoints(item) : 0),
    0,
  );
}

function movementProbe(
  player: PlayerState,
  moveX: number,
  moveZ: number,
  sprint: boolean,
): PlayerState['position'] {
  const length = Math.hypot(moveX, moveZ);
  if (length <= 0.001) return player.position;
  const normalizedX = moveX / Math.max(length, 1);
  const normalizedZ = moveZ / Math.max(length, 1);
  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);
  const distance = sprint ? SPRINT_STREAMING_LOOKAHEAD : WALK_STREAMING_LOOKAHEAD;
  return {
    x:
      player.position.x +
      (rightX * normalizedX + forwardX * normalizedZ) * distance,
    y: player.position.y,
    z:
      player.position.z +
      (rightZ * normalizedX + forwardZ * normalizedZ) * distance,
  };
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
  #enemies: NightStalkerManager | null = null;
  #furnaces: FurnaceManager | null = null;
  #effects: VoxelBreakEffects | null = null;
  #audio: GameAudio | null = null;
  #inventory: PlayerInventory | null = null;
  #hotbar: HotbarView | null = null;
  #inventoryView: InventoryView | null = null;
  #targetView: ThirdPersonTargetView | null = null;
  #localStorage: Storage | null = null;
  #lastCameraMode: CameraMode | null = null;
  #lastHeldItem: ItemTypeValue | null | undefined;
  #saveElapsed = 0;
  #furnaceRefreshElapsed = 0;
  #smoothedFps = 60;
  #respawning = false;
  #nearFieldBlockedAt: number | null = null;

  public constructor(canvas: HTMLCanvasElement, ui: GameUiElements) {
    this.#engineHost = new BabylonEngine(canvas);
    this.#canvas = canvas;
    this.#ui = ui;
  }

  public async start(): Promise<void> {
    const { scene, updateLighting } = this.#engineHost.createWorldScene();
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
    const localStorage = getLocalStorage();
    const inventory = loadPlayerInventory(WORLD_SEED, localStorage);
    const furnaces = new FurnaceManager(WORLD_SEED, localStorage);
    input.selectHotbarSlot(inventory.selectedSlot);
    const hotbar = new HotbarView(this.#ui.hotbar, (slot) =>
      input.selectHotbarSlot(slot),
    );
    const audio = new GameAudio();
    const inventoryViewHolder: { current: InventoryView | null } = {
      current: null,
    };
    let renderedInventoryRevision = -1;
    const syncInventory = (): void => {
      if (inventory.revision === renderedInventoryRevision) return;
      hotbar.render(inventory.snapshot);
      inventoryViewHolder.current?.render();
      savePlayerInventory(WORLD_SEED, inventory, localStorage);
      renderedInventoryRevision = inventory.revision;
    };

    const showLoading = (
      message: string,
      mode: 'runtime' | 'death' | 'respawn',
    ): void => {
      this.#ui.loadingMessage.textContent = message;
      this.#ui.loadingScreen.dataset.runtimeMode = mode;
      this.#ui.loadingScreen.classList.toggle('runtime-wait', mode === 'runtime');
      this.#ui.loadingScreen.classList.toggle('death-screen', mode === 'death');
      this.#ui.loadingScreen.classList.remove('is-hidden');
      this.#ui.loadingSpinner.hidden = mode === 'death';
      this.#ui.loadingAction.hidden = mode !== 'death';
    };
    const hideRuntimeLoading = (): void => {
      if (this.#ui.loadingScreen.dataset.runtimeMode !== 'runtime') return;
      this.#ui.loadingScreen.classList.add('is-hidden');
      this.#ui.loadingScreen.classList.remove('runtime-wait');
      delete this.#ui.loadingScreen.dataset.runtimeMode;
      this.#ui.loadingSpinner.hidden = false;
      this.#nearFieldBlockedAt = null;
    };
    const finishLoadingOverlay = (): void => {
      this.#ui.loadingScreen.classList.add('is-hidden');
      this.#ui.loadingScreen.classList.remove('runtime-wait', 'death-screen');
      delete this.#ui.loadingScreen.dataset.runtimeMode;
      this.#ui.loadingSpinner.hidden = false;
      this.#ui.loadingAction.hidden = true;
      this.#nearFieldBlockedAt = null;
    };

    let breakHeld = false;
    let placeHeld = false;
    let activeFurnace: FurnacePosition | null = null;
    const closeMenuState = (): void => {
      input.setUiOpen(false);
      session.setMenuOpen(false);
      activeFurnace = null;
      this.#canvas.dataset.inventoryOpen = 'false';
    };
    const inventoryView = new InventoryView(this.#ui.inventoryRoot, inventory, {
      onChanged: syncInventory,
      onClose: closeMenuState,
      onCrafted: () => audio.playCraft(),
      getFurnaceState: () =>
        activeFurnace === null ? null : furnaces.getState(activeFurnace),
      onFurnaceInsertInput: () =>
        activeFurnace === null
          ? 0
          : furnaces.insertInput(activeFurnace, inventory),
      onFurnaceInsertFuel: () =>
        activeFurnace === null
          ? 0
          : furnaces.insertFuel(activeFurnace, inventory),
      onFurnaceTakeOutput: () =>
        activeFurnace === null
          ? 0
          : furnaces.takeOutput(activeFurnace, inventory),
    });
    inventoryViewHolder.current = inventoryView;
    const openInventory = (
      station: CraftingStation,
      position: FurnacePosition | null = null,
    ): void => {
      breakHeld = false;
      placeHeld = false;
      activeFurnace = station === 'furnace' ? position : null;
      inventoryView.open(station);
      input.setUiOpen(true);
      session.setMenuOpen(true);
      this.#canvas.dataset.inventoryOpen = 'true';
    };
    this.#canvas.dataset.inventoryOpen = 'false';
    syncInventory();

    const cameraController = new PlayerCameraController(scene);
    const playerModel = new VoxelPlayerModel(scene);
    const targetView = new ThirdPersonTargetView(
      this.#ui.targetReticle,
      this.#canvas,
      scene,
    );
    const worldRenderer = new VoxelWorldRenderer(scene, worldData, 2);
    const effects = new VoxelBreakEffects(scene);
    const drops = new DroppedItemManager(scene, worldData, {
      onPickup: (stack) => {
        const remaining = inventory.addStack(stack);
        syncInventory();
        return remaining;
      },
      onPickupSucceeded: () => audio.playPickup(),
    });
    drops.restore(loadDroppedItems(WORLD_SEED, localStorage));

    const spawnStack = (
      stack: InventorySlotSnapshot,
      worldX: number,
      worldY: number,
      worldZ: number,
    ): void => {
      if (stack.item === null || stack.count <= 0) return;
      const remainingCount = drops.spawn(
        stack.item,
        worldX,
        worldY,
        worldZ,
        stack.count,
        stack.durability,
      );
      if (remainingCount <= 0) return;
      inventory.addStack({ ...stack, count: remainingCount });
      syncInventory();
    };

    const enemies = new NightStalkerManager(scene, worldData, {
      onPlayerDamage: (amount, source) => {
        const beforeHealth = session.getWorldState().player.health;
        session.damagePlayer(amount, source);
        if (session.getWorldState().player.health !== beforeHealth) {
          audio.playMonsterAttack();
          audio.playPlayerHurt();
        }
      },
      onDrop: (item, count, x, y, z) => {
        spawnStack({ item, count, durability: null }, x, y, z);
      },
      onEnemyHit: (_damage, killed) => {
        audio.playAttack(true, killed);
        if (!killed) audio.playMonsterHurt();
      },
      onBlockChanged: (worldX, worldY, worldZ) =>
        worldRenderer.invalidateBlock(worldX, worldY, worldZ),
      onMonsterAmbient: () => audio.playMonsterAmbient(),
    });

    const interaction = new VoxelInteractionController(scene, worldData, {
      onBlockChanged: (worldX, worldY, worldZ) =>
        worldRenderer.invalidateBlock(worldX, worldY, worldZ),
      onBlockBroken: (block, position) => {
        effects.spawn(block, position.x, position.y, position.z);
        audio.playBreak(block);
        if (block === BlockType.Furnace) {
          for (const stack of furnaces.drain(position)) {
            spawnStack(stack, position.x, position.y, position.z);
          }
        }
        const dropItem = getBlockDropItem(block, inventory.selectedItem);
        if (dropItem !== null) {
          spawnStack(
            { item: dropItem, count: 1, durability: null },
            position.x,
            position.y,
            position.z,
          );
        }
        if (
          block === BlockType.OakLeaves &&
          shouldDropApple(position.x, position.y, position.z)
        ) {
          spawnStack(
            { item: ItemType.Apple, count: 1, durability: null },
            position.x,
            position.y + 0.15,
            position.z,
          );
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
      onUseBlock: (block, position) => {
        if (block === BlockType.CraftingTable) {
          openInventory('crafting-table');
          return true;
        }
        if (block === BlockType.Furnace) {
          openInventory('furnace', position);
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
    this.#enemies = enemies;
    this.#furnaces = furnaces;
    this.#effects = effects;
    this.#audio = audio;
    this.#inventory = inventory;
    this.#hotbar = hotbar;
    this.#inventoryView = inventoryView;
    this.#targetView = targetView;
    this.#localStorage = localStorage;

    await session.start();
    session.restoreSurvival(
      loadSurvivalSnapshot(
        WORLD_SEED,
        localStorage,
        PLAYER_MAXIMUM_HEALTH,
      ),
    );
    session.setArmorPoints(getInventoryArmorPoints(inventory));
    let observedDeathCount = session.getWorldState().player.deathCount;
    const initialWorldState = session.getWorldState();
    const initialPlayer = initialWorldState.player;
    await worldRenderer.initialize(
      initialPlayer.position.x,
      initialPlayer.position.z,
    );

    const respawn = async (): Promise<void> => {
      if (!session.isDead || this.#respawning) return;
      this.#respawning = true;
      this.#ui.loadingAction.hidden = true;
      this.#ui.loadingSpinner.hidden = false;
      showLoading('正在加载出生点附近区块……', 'respawn');
      try {
        await worldRenderer.prepareNearField(SPAWN_X, SPAWN_Z);
        if (!session.respawnPlayer()) return;
        session.setMenuOpen(false);
        input.setUiOpen(false);
        breakHeld = false;
        placeHeld = false;
        finishLoadingOverlay();
      } finally {
        this.#respawning = false;
      }
    };
    this.#ui.loadingAction.onclick = () => {
      void respawn();
    };

    const handleDeath = (worldState: Readonly<WorldState>): void => {
      if (worldState.player.deathCount <= observedDeathCount) return;
      observedDeathCount = worldState.player.deathCount;
      audio.playPlayerDeath();
      const position = worldState.lastDeathPosition ?? worldState.player.position;
      for (const stack of inventory.drainAllItems()) {
        spawnStack(stack, position.x, position.y, position.z);
      }
      interaction.setHeldItem(inventory.selectedItem);
      syncInventory();
      breakHeld = false;
      placeHeld = false;
      input.setUiOpen(true);
      session.setMenuOpen(true);
      if (document.pointerLockElement !== null) document.exitPointerLock();
      showLoading('你死了', 'death');
      this.#ui.loadingAction.textContent = '重生';
    };

    const saveWorldState = (): void => {
      saveDroppedItems(WORLD_SEED, drops.snapshots, localStorage);
      furnaces.save();
      enemies.save();
      saveSurvivalSnapshot(
        WORLD_SEED,
        session.getSurvivalSnapshot(),
        localStorage,
      );
    };

    const applyWorldState = (
      player: PlayerState,
      dayTime: number,
      frameSeconds: number,
    ): void => {
      updateLighting(dayTime);
      const worldStats = worldRenderer.update(
        player.position.x,
        player.position.z,
      );
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
        breaking: !player.paused && breakHeld,
        placing: !player.paused && placeHeld,
        breakProgress: interaction.breakProgress,
        heldItem: inventory.selectedItem,
      });
      this.#syncCameraMode(player.cameraMode);
      this.#syncPresentationDiagnostics(
        player,
        dayTime,
        inventory.selectedItem,
        interaction.hasTarget,
        enemies.activeCount,
        furnaces.furnaceCount,
      );
      this.#updateHud(
        player,
        dayTime,
        worldStats,
        inventory.selectedItem,
        interaction.breakProgress,
        drops.activeCount,
        enemies.activeCount,
        input.usesPointerLock && !input.pointerLocked,
        inventoryView.isOpen,
        frameSeconds,
      );

      this.#saveElapsed += frameSeconds;
      if (this.#saveElapsed >= SAVE_INTERVAL_SECONDS) {
        this.#saveElapsed = 0;
        saveWorldState();
      }
      if (inventoryView.isOpen && inventoryView.station === 'furnace') {
        this.#furnaceRefreshElapsed += frameSeconds;
        if (this.#furnaceRefreshElapsed >= FURNACE_REFRESH_SECONDS) {
          this.#furnaceRefreshElapsed = 0;
          inventoryView.refreshFurnace();
        }
      } else {
        this.#furnaceRefreshElapsed = 0;
      }
    };

    applyWorldState(initialPlayer, initialWorldState.dayTime, 1 / 60);
    scene.render();

    this.#renderLoop = new RenderLoop(this.#engineHost.engine, scene, {
      beforeFrame: () => {
        const worldState = session.getWorldState();
        const command = input.poll(worldState.tick);
        if (command.toggleInventory && !session.isDead) {
          if (inventoryView.isOpen) inventoryView.close();
          else openInventory('inventory');
        }
        if (!inventoryView.isOpen && !session.isDead) {
          inventory.selectSlot(command.selectedHotbarSlot);
          interaction.setHeldItem(inventory.selectedItem);
          const attackPressed = command.breakBlock && !breakHeld;
          const usePressed = command.placeBlock && !placeHeld;
          const selectedItem = inventory.selectedItem;
          let firedBow = false;
          let meleeHit = false;

          if (attackPressed) {
            if (
              isBowItem(selectedItem) &&
              !interaction.hasTarget &&
              inventory.countItem(ItemType.Arrow) > 0 &&
              enemies.shootArrow(worldState.player, selectedItem) &&
              inventory.consumeItems([{ item: ItemType.Arrow, count: 1 }])
            ) {
              firedBow = true;
              syncInventory();
            } else if (!isBowItem(selectedItem)) {
              const result = enemies.attack(worldState.player, selectedItem);
              meleeHit = result.hit;
              if (!result.hit && !interaction.hasTarget) audio.playAttack(false);
              if (result.hit) {
                inventory.damageSelectedTool(1);
                syncInventory();
              }
            }
          }

          let consumedFood = false;
          const healing = getFoodHealing(selectedItem);
          const hungerRestore = getFoodHunger(selectedItem);
          if (
            usePressed &&
            !interaction.hasTarget &&
            selectedItem !== null &&
            (healing > 0 || hungerRestore > 0) &&
            (worldState.player.health < worldState.player.maximumHealth ||
              worldState.player.hunger < worldState.player.maximumHunger) &&
            inventory.consumeSelectedItem(selectedItem, 1)
          ) {
            if (healing > 0) session.healPlayer(healing);
            if (hungerRestore > 0) session.feedPlayer(hungerRestore);
            audio.playEat();
            consumedFood = true;
            syncInventory();
          }

          let primedTnt = false;
          if (
            usePressed &&
            isTntItem(selectedItem) &&
            interaction.targetPoint !== null
          ) {
            const point = interaction.targetPoint;
            if (
              enemies.primeTnt(point.x, point.y + 0.45, point.z) &&
              inventory.consumeSelectedItem(ItemType.Tnt, 1)
            ) {
              primedTnt = true;
              syncInventory();
            }
          }

          breakHeld = firedBow || meleeHit ? false : command.breakBlock;
          placeHeld = consumedFood || primedTnt ? false : command.placeBlock;
        } else {
          breakHeld = false;
          placeHeld = false;
        }
        syncInventory();

        let submittedCommand = command;
        if (
          !inventoryView.isOpen &&
          !session.isDead &&
          Math.hypot(command.moveX, command.moveZ) > 0.001
        ) {
          const probe = movementProbe(
            worldState.player,
            command.moveX,
            command.moveZ,
            command.sprint,
          );
          const terrainReady = worldRenderer.ensureNearFieldReady(probe.x, probe.z);
          const creatureClear = enemies.canPlayerOccupy(probe);
          if (!terrainReady) {
            const now = performance.now();
            this.#nearFieldBlockedAt ??= now;
            if (
              now - this.#nearFieldBlockedAt >= RUNTIME_LOADING_DELAY_MILLISECONDS &&
              !this.#respawning
            ) {
              showLoading('正在加载前方区块……', 'runtime');
            }
          } else {
            hideRuntimeLoading();
          }
          if (!terrainReady || !creatureClear) {
            submittedCommand = {
              ...command,
              moveX: 0,
              moveZ: 0,
              sprint: false,
            };
          }
        } else if (!session.isDead) {
          this.#nearFieldBlockedAt = null;
          hideRuntimeLoading();
        }
        session.submitCommand(submittedCommand);
      },
      fixedUpdate: (stepSeconds) => {
        session.setArmorPoints(getInventoryArmorPoints(inventory));
        session.step(stepSeconds);
        let worldState = session.getWorldState();
        if (!worldState.player.paused) {
          furnaces.update(stepSeconds);
          enemies.update(worldState.player, worldState.dayTime, stepSeconds);
          worldState = session.getWorldState();
        }
        handleDeath(worldState);
      },
      renderUpdate: (frameSeconds) => {
        const worldState = session.getWorldState();
        applyWorldState(
          worldState.player,
          worldState.dayTime,
          frameSeconds,
        );
      },
    });
    this.#renderLoop.start();
  }

  public dispose(): void {
    this.#ui.loadingAction.onclick = null;
    document.body.classList.remove(
      'camera-third-person',
      'inventory-open',
      'player-damaged',
    );
    this.#canvas.removeAttribute('data-camera-mode');
    this.#canvas.removeAttribute('data-held-item');
    this.#canvas.removeAttribute('data-player-pitch');
    this.#canvas.removeAttribute('data-has-target');
    this.#canvas.removeAttribute('data-inventory-open');
    this.#canvas.removeAttribute('data-player-health');
    this.#canvas.removeAttribute('data-player-hunger');
    this.#canvas.removeAttribute('data-player-armor');
    this.#canvas.removeAttribute('data-day-time');
    this.#canvas.removeAttribute('data-death-count');
    this.#canvas.removeAttribute('data-enemy-count');
    this.#canvas.removeAttribute('data-furnace-count');
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
    this.#enemies?.dispose();
    this.#enemies = null;
    this.#furnaces?.save();
    this.#furnaces = null;
    this.#effects?.dispose();
    this.#effects = null;
    this.#audio?.dispose();
    this.#audio = null;
    if (this.#inventory !== null) {
      savePlayerInventory(WORLD_SEED, this.#inventory, this.#localStorage);
      this.#inventory = null;
    }
    if (this.#session !== null) {
      saveSurvivalSnapshot(
        WORLD_SEED,
        this.#session.getSurvivalSnapshot(),
        this.#localStorage,
      );
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
    dayTime: number,
    heldItem: ItemTypeValue | null,
    hasTarget: boolean,
    enemyCount: number,
    furnaceCount: number,
  ): void {
    this.#canvas.dataset.playerPitch = player.pitch.toFixed(4);
    this.#canvas.dataset.hasTarget = String(hasTarget);
    this.#canvas.dataset.playerHealth = String(player.health);
    this.#canvas.dataset.playerHunger = player.hunger.toFixed(1);
    this.#canvas.dataset.playerArmor = String(player.armorPoints);
    this.#canvas.dataset.dayTime = dayTime.toFixed(4);
    this.#canvas.dataset.deathCount = String(player.deathCount);
    this.#canvas.dataset.enemyCount = String(enemyCount);
    this.#canvas.dataset.furnaceCount = String(furnaceCount);
    document.body.classList.toggle('player-damaged', player.damageTaken > 0);
    if (heldItem !== this.#lastHeldItem) {
      this.#lastHeldItem = heldItem;
      this.#canvas.dataset.heldItem = heldItem ?? 'empty';
    }
  }

  #updateHud(
    player: PlayerState,
    dayTime: number,
    world: VoxelWorldStats,
    selectedItem: ItemTypeValue | null,
    breakProgress: number,
    activeDrops: number,
    activeEnemies: number,
    awaitingPointerLock: boolean,
    inventoryOpen: boolean,
    frameSeconds: number,
  ): void {
    if (frameSeconds > 0) {
      const instantaneousFps = Math.min(240, 1 / frameSeconds);
      this.#smoothedFps +=
        (instantaneousFps - this.#smoothedFps) * 0.08;
    }
    const worldProgress = `${String(world.loadedChunks)}/${String(
      world.desiredChunks,
    )}`;
    const queueLabel =
      world.criticalPendingChunks > 0
        ? ` · 近场 ${String(world.criticalPendingChunks)} 待加载`
        : world.pendingChunks > 0
          ? ` · 队列 ${String(world.pendingChunks)}`
          : '';
    const dropLabel =
      activeDrops > 0 ? ` · 掉落 ${String(activeDrops)}` : '';
    const enemyLabel =
      activeEnemies > 0 ? ` · 生物 ${String(activeEnemies)}` : '';
    const breakLabel =
      breakProgress > 0
        ? ` · 挖掘 ${Math.round(breakProgress * 100).toString()}%`
        : '';
    const survivalLabel = `生命 ${String(player.health)}/${String(
      player.maximumHealth,
    )} · 饥饿 ${Math.ceil(player.hunger).toString()}/${String(
      player.maximumHunger,
    )} · 护甲 ${String(player.armorPoints)} · ${formatDayTime(dayTime)}`;
    if (player.health === 0) {
      this.#ui.status.textContent = '你死了 · 点击重生后会先加载出生点区块';
    } else if (inventoryOpen) {
      this.#ui.status.textContent = `界面已打开 · ${survivalLabel} · E 或 Esc 关闭`;
    } else if (awaitingPointerLock) {
      this.#ui.status.textContent = player.paused
        ? `已暂停 · ${survivalLabel} · 点击画面继续`
        : `${survivalLabel}${enemyLabel} · 点击锁定鼠标，或按住画面拖动观察`;
    } else {
      this.#ui.status.textContent = player.paused
        ? `已暂停 · ${survivalLabel}`
        : [
            `${survivalLabel}${enemyLabel}`,
            `${worldProgress} 区块${queueLabel}`,
            `${formatCount(world.visibleQuads)} 四边形${dropLabel}`,
            `${Math.round(this.#smoothedFps).toString()} FPS${breakLabel}`,
          ].join(' · ');
    }
    this.#ui.viewMode.textContent = `${
      player.cameraMode === 'first-person' ? '第一人称' : '第三人称'
    } · ${getItemLabel(selectedItem)}${
      player.deathCount > 0 ? ` · 死亡 ${String(player.deathCount)}` : ''
    }`;
    this.#ui.position.textContent = [
      player.position.x.toFixed(1),
      player.position.y.toFixed(1),
      player.position.z.toFixed(1),
    ].join(', ');
  }
}
