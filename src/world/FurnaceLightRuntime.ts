import type { FurnacePosition } from '../crafting/FurnaceManager';
import type { BiomeType } from './BiomeDefinition';
import type { BlockType as BlockTypeValue } from './BlockType';
import {
  registerSurvivalWorldRuntime,
  unregisterSurvivalWorldRuntime,
} from './SurvivalWorldRuntime';

interface RuntimeLightWorld {
  readonly worldSeed: string;
  sampleBlock(worldX: number, worldY: number, worldZ: number): BlockTypeValue;
  sampleBiome(worldX: number, worldZ: number): BiomeType;
  isSolidAt(worldX: number, worldY: number, worldZ: number): boolean;
  isWaterAt(worldX: number, worldY: number, worldZ: number): boolean;
  isLavaAt(worldX: number, worldY: number, worldZ: number): boolean;
  isClimbableAt(worldX: number, worldY: number, worldZ: number): boolean;
  setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    block: BlockTypeValue,
  ): boolean;
  setDynamicLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    level: number,
  ): boolean;
}

interface RuntimeLightRenderer {
  invalidateBlock(worldX: number, worldY: number, worldZ: number): void;
  invalidateLightEmitter(worldX: number, worldZ: number): void;
}

let world: RuntimeLightWorld | null = null;
let renderer: RuntimeLightRenderer | null = null;
let desiredLevel = 0;
const desired = new Map<string, FurnacePosition>();
const applied = new Map<string, FurnacePosition>();

function keyOf(position: FurnacePosition): string {
  return `${String(position.x)},${String(position.y)},${String(position.z)}`;
}

function reconcile(): void {
  if (world === null) return;

  for (const [key, position] of applied) {
    if (desired.has(key)) continue;
    if (world.setDynamicLight(position.x, position.y, position.z, 0)) {
      renderer?.invalidateLightEmitter(position.x, position.z);
    }
    applied.delete(key);
  }

  for (const [key, position] of desired) {
    if (applied.has(key)) continue;
    if (world.setDynamicLight(position.x, position.y, position.z, desiredLevel)) {
      renderer?.invalidateLightEmitter(position.x, position.z);
    }
    applied.set(key, position);
  }
}

/** Registers the active single-player world and renderer for runtime bridges. */
export function registerFurnaceLightRuntime(
  nextWorld: RuntimeLightWorld,
  nextRenderer: RuntimeLightRenderer,
): void {
  world = nextWorld;
  renderer = nextRenderer;
  applied.clear();
  registerSurvivalWorldRuntime(nextWorld, nextRenderer);
  reconcile();
}

export function unregisterFurnaceLightRuntime(
  currentRenderer: RuntimeLightRenderer,
): void {
  if (renderer !== currentRenderer) return;
  unregisterSurvivalWorldRuntime(currentRenderer);
  world = null;
  renderer = null;
  desired.clear();
  applied.clear();
  desiredLevel = 0;
}

/** Publishes only on/off coordinate transitions, not every burn-progress tick. */
export function syncBurningFurnaceLights(
  positions: readonly FurnacePosition[],
  lightLevel: number,
): void {
  desired.clear();
  desiredLevel = lightLevel;
  for (const position of positions) desired.set(keyOf(position), position);
  reconcile();
}
