import type { FurnacePosition } from '../crafting/FurnaceManager';

interface RuntimeLightWorld {
  setDynamicLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    level: number,
  ): boolean;
}

interface RuntimeLightRenderer {
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

/** Registers the active single-player world and renderer for source transitions. */
export function registerFurnaceLightRuntime(
  nextWorld: RuntimeLightWorld,
  nextRenderer: RuntimeLightRenderer,
): void {
  world = nextWorld;
  renderer = nextRenderer;
  applied.clear();
  reconcile();
}

export function unregisterFurnaceLightRuntime(
  currentRenderer: RuntimeLightRenderer,
): void {
  if (renderer !== currentRenderer) return;
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
