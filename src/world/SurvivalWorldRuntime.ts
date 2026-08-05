import type {
  PlayerEnvironmentState,
  PlayerVector,
} from '../player/KinematicPlayerMotor';
import { getBiomeLabel } from './BiomeDefinition';
import type { BiomeType } from './BiomeDefinition';
import {
  CHUNK_SIZE,
  createChunkKey,
  worldToChunkCoordinate,
} from './VoxelChunk';
import {
  WorldTickManager,
  type RandomTickWorld,
  type WorldTickChange,
} from './WorldTickManager';

interface SurvivalRuntimeWorld extends RandomTickWorld {
  sampleBiome(worldX: number, worldZ: number): BiomeType;
  isWaterAt(worldX: number, worldY: number, worldZ: number): boolean;
  isLavaAt(worldX: number, worldY: number, worldZ: number): boolean;
  isClimbableAt(worldX: number, worldY: number, worldZ: number): boolean;
}

interface SurvivalRuntimeRenderer {
  invalidateBlock(worldX: number, worldY: number, worldZ: number): void;
}

const EMPTY_ENVIRONMENT: PlayerEnvironmentState = {
  inWater: false,
  inLava: false,
  onLadder: false,
};

let world: SurvivalRuntimeWorld | null = null;
let renderer: SurvivalRuntimeRenderer | null = null;
let ticks: WorldTickManager | null = null;
const changes: WorldTickChange[] = [];

function blockCoordinate(value: number): number {
  return Math.floor(value + 0.5);
}

function sampleBodyLevels(position: PlayerVector): readonly number[] {
  return [
    blockCoordinate(position.y - 0.65),
    blockCoordinate(position.y + 0.05),
  ];
}

/** Registers the active single-player world without coupling GameApp to it. */
export function registerSurvivalWorldRuntime(
  nextWorld: SurvivalRuntimeWorld,
  nextRenderer: SurvivalRuntimeRenderer,
): void {
  world = nextWorld;
  renderer = nextRenderer;
  changes.length = 0;
  ticks = new WorldTickManager(nextWorld, {
    onBlockChanged: (change) => changes.push(change),
  });
}

export function unregisterSurvivalWorldRuntime(
  currentRenderer: SurvivalRuntimeRenderer,
): void {
  if (renderer !== currentRenderer) return;
  world = null;
  renderer = null;
  ticks = null;
  changes.length = 0;
}

export function getSurvivalBiomeLabel(position: PlayerVector): string {
  if (world === null) return '未知区域';
  return getBiomeLabel(world.sampleBiome(position.x, position.z));
}

export function sampleSurvivalEnvironment(
  position: PlayerVector,
): PlayerEnvironmentState {
  if (world === null) return EMPTY_ENVIRONMENT;
  const worldX = blockCoordinate(position.x);
  const worldZ = blockCoordinate(position.z);
  let inWater = false;
  let inLava = false;
  let onLadder = false;
  for (const worldY of sampleBodyLevels(position)) {
    inWater = inWater || world.isWaterAt(worldX, worldY, worldZ);
    inLava = inLava || world.isLavaAt(worldX, worldY, worldZ);
    onLadder = onLadder || world.isClimbableAt(worldX, worldY, worldZ);
  }
  return { inWater, inLava, onLadder };
}

export function isPlayerHeadSubmerged(position: PlayerVector): boolean {
  if (world === null) return false;
  return world.isWaterAt(
    blockCoordinate(position.x),
    blockCoordinate(position.y + 0.72),
    blockCoordinate(position.z),
  );
}

export function isPlayerHeadSuffocating(position: PlayerVector): boolean {
  if (world === null) return false;
  return world.isSolidAt(
    blockCoordinate(position.x),
    blockCoordinate(position.y + 0.72),
    blockCoordinate(position.z),
  );
}

/** Runs bounded random ticks and rebuilds each touched chunk at most once. */
export function updateSurvivalWorld(
  position: PlayerVector,
  stepSeconds: number,
): number {
  if (ticks === null || renderer === null) return 0;
  changes.length = 0;
  const changed = ticks.update(
    position.x,
    position.y,
    position.z,
    stepSeconds,
  );
  if (changed <= 0) return 0;

  const touchedChunks = new Set<string>();
  for (const change of changes) {
    touchedChunks.add(
      createChunkKey(
        worldToChunkCoordinate(change.worldX),
        worldToChunkCoordinate(change.worldZ),
      ),
    );
  }
  for (const key of touchedChunks) {
    const separator = key.indexOf(',');
    const chunkX = Number(key.slice(0, separator));
    const chunkZ = Number(key.slice(separator + 1));
    renderer.invalidateBlock(
      chunkX * CHUNK_SIZE,
      0,
      chunkZ * CHUNK_SIZE,
    );
  }
  return changed;
}
