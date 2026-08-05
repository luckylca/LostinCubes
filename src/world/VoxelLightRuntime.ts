export interface DynamicLightPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface LightWorld {
  setDynamicLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    level: number,
  ): boolean;
}

interface LightRenderer {
  invalidateLightEmitter(worldX: number, worldZ: number): void;
}

let activeWorld: LightWorld | null = null;
let activeRenderer: LightRenderer | null = null;
const activeFurnaceKeys = new Set<string>();

function keyOf(position: DynamicLightPosition): string {
  return `${String(position.x)},${String(position.y)},${String(position.z)}`;
}

function parseKey(key: string): DynamicLightPosition | null {
  const parts = key.split(',').map(Number);
  const x = parts[0];
  const y = parts[1];
  const z = parts[2];
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
    ? { x, y, z }
    : null;
}

export function registerLightWorld(world: LightWorld | null): void {
  activeWorld = world;
  if (world === null) activeFurnaceKeys.clear();
}

export function registerLightRenderer(renderer: LightRenderer | null): void {
  activeRenderer = renderer;
}

/** Applies only source transitions, so burning progress does not remesh chunks. */
export function syncFurnaceLightSources(
  positions: readonly DynamicLightPosition[],
  lightLevel: number,
): void {
  if (activeWorld === null) return;
  const nextKeys = new Set(positions.map(keyOf));

  for (const key of activeFurnaceKeys) {
    if (nextKeys.has(key)) continue;
    const position = parseKey(key);
    if (
      position !== null &&
      activeWorld.setDynamicLight(position.x, position.y, position.z, 0)
    ) {
      activeRenderer?.invalidateLightEmitter(position.x, position.z);
    }
  }

  for (const position of positions) {
    const key = keyOf(position);
    if (activeFurnaceKeys.has(key)) continue;
    if (activeWorld.setDynamicLight(position.x, position.y, position.z, lightLevel)) {
      activeRenderer?.invalidateLightEmitter(position.x, position.z);
    }
  }

  activeFurnaceKeys.clear();
  for (const key of nextKeys) activeFurnaceKeys.add(key);
}
