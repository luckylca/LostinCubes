import {
  PLAYER_COLLISION_RADIUS,
  type PlayerEnvironmentState,
  type PlayerVector,
} from '../player/KinematicPlayerMotor';
import { getBiomeLabel } from './BiomeDefinition';
import type { BiomeType } from './BiomeDefinition';
import {
  CHUNK_SECTION_HEIGHT,
  CHUNK_SIZE,
  worldToChunkCoordinate,
  worldToLocalCoordinate,
  worldYToSectionIndex,
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

const BODY_SAMPLE_RADIUS = PLAYER_COLLISION_RADIUS * 0.82;
const BODY_SAMPLE_OFFSETS = [
  [0, 0],
  [-BODY_SAMPLE_RADIUS, 0],
  [BODY_SAMPLE_RADIUS, 0],
  [0, -BODY_SAMPLE_RADIUS],
  [0, BODY_SAMPLE_RADIUS],
] as const;

let world: SurvivalRuntimeWorld | null = null;
let renderer: SurvivalRuntimeRenderer | null = null;
let ticks: WorldTickManager | null = null;
const changes: WorldTickChange[] = [];

function blockCoordinate(value: number): number {
  return Math.floor(value + 0.5);
}

function sampleBodyLevels(position: PlayerVector): readonly number[] {
  return [
    blockCoordinate(position.y - 0.68),
    blockCoordinate(position.y),
    blockCoordinate(position.y + 0.52),
  ];
}

function sectionEdge(worldY: number): -1 | 0 | 1 {
  const localY = ((worldY % CHUNK_SECTION_HEIGHT) + CHUNK_SECTION_HEIGHT) % CHUNK_SECTION_HEIGHT;
  if (localY === 0) return -1;
  if (localY === CHUNK_SECTION_HEIGHT - 1) return 1;
  return 0;
}

function chunkEdge(localCoordinate: number): -1 | 0 | 1 {
  if (localCoordinate === 0) return -1;
  if (localCoordinate === CHUNK_SIZE - 1) return 1;
  return 0;
}

/**
 * Collapse many simulation changes into the minimum set of section rebuild
 * triggers. One representative is enough for interior edits because a section
 * rebuild reads the world's latest state for every voxel. Boundary direction is
 * part of the key so a changed face still rebuilds the correct neighbouring
 * chunk/section when necessary.
 */
export function compactRuntimeRenderChanges(
  source: readonly WorldTickChange[],
): readonly WorldTickChange[] {
  const representatives = new Map<string, WorldTickChange>();
  for (const change of source) {
    const chunkX = worldToChunkCoordinate(change.worldX);
    const chunkZ = worldToChunkCoordinate(change.worldZ);
    const localX = worldToLocalCoordinate(change.worldX);
    const localZ = worldToLocalCoordinate(change.worldZ);
    const key = [
      chunkX,
      chunkZ,
      worldYToSectionIndex(change.worldY),
      chunkEdge(localX),
      sectionEdge(change.worldY),
      chunkEdge(localZ),
    ].join(':');
    if (!representatives.has(key)) representatives.set(key, change);
  }
  return [...representatives.values()];
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

/** Wakes a changed voxel and its six neighbors for support/fluid scheduled ticks. */
export function notifySurvivalBlockChanged(
  worldX: number,
  worldY: number,
  worldZ: number,
): void {
  ticks?.notifyBlockChanged(worldX, worldY, worldZ);
}

export function getSurvivalBiomeLabel(position: PlayerVector): string {
  if (world === null) return '未知区域';
  return getBiomeLabel(world.sampleBiome(position.x, position.z));
}

export function sampleSurvivalEnvironment(
  position: PlayerVector,
): PlayerEnvironmentState {
  if (world === null) return EMPTY_ENVIRONMENT;
  let inWater = false;
  let inLava = false;
  let onLadder = false;

  for (const [offsetX, offsetZ] of BODY_SAMPLE_OFFSETS) {
    const worldX = blockCoordinate(position.x + offsetX);
    const worldZ = blockCoordinate(position.z + offsetZ);
    for (const worldY of sampleBodyLevels(position)) {
      inWater = inWater || world.isWaterAt(worldX, worldY, worldZ);
      inLava = inLava || world.isLavaAt(worldX, worldY, worldZ);
      onLadder = onLadder || world.isClimbableAt(worldX, worldY, worldZ);
    }
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

/** Runs bounded random/scheduled ticks and coalesces their render invalidation. */
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

  // The old code converted every touched chunk to its artificial origin
  // (chunkX*16, y=0, chunkZ*16). That coordinate is always on two chunk borders,
  // so VoxelWorldRenderer rebuilt the current, west and north chunks and always
  // section 0 even when the real change was elsewhere. Use real representative
  // coordinates instead and let the renderer's existing latest-job coalescing
  // collapse repeated edits further.
  for (const change of compactRuntimeRenderChanges(changes)) {
    renderer.invalidateBlock(change.worldX, change.worldY, change.worldZ);
  }
  return changed;
}
