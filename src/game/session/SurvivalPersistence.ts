import type { VectorState } from './GameSession';

const STORAGE_PREFIX = 'lost-in-cubes:survival:';
const DEFAULT_MAXIMUM_HUNGER = 20;

export interface SurvivalSnapshot {
  readonly version: 2;
  readonly health: number;
  readonly dayTime: number;
  readonly deathCount: number;
  readonly position: VectorState | null;
  readonly yaw: number;
  readonly pitch: number;
  readonly hunger: number;
  readonly armorPoints: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeDayTime(value: number): number {
  return value >= 0 && value < 1 ? value : ((value % 1) + 1) % 1;
}

function readFinite(
  candidate: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = candidate[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readPosition(value: unknown): VectorState | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.x !== 'number' ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== 'number' ||
    !Number.isFinite(candidate.y) ||
    typeof candidate.z !== 'number' ||
    !Number.isFinite(candidate.z)
  ) {
    return null;
  }
  return { x: candidate.x, y: candidate.y, z: candidate.z };
}

export function loadSurvivalSnapshot(
  worldId: string,
  storage: Storage | null,
  maximumHealth: number,
  maximumHunger = DEFAULT_MAXIMUM_HUNGER,
): SurvivalSnapshot | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${worldId}`);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.health !== 'number' ||
      !Number.isFinite(candidate.health) ||
      typeof candidate.dayTime !== 'number' ||
      !Number.isFinite(candidate.dayTime) ||
      typeof candidate.deathCount !== 'number' ||
      !Number.isInteger(candidate.deathCount)
    ) {
      return null;
    }
    return {
      version: 2,
      health: Math.round(clamp(candidate.health, 1, maximumHealth)),
      dayTime: normalizeDayTime(candidate.dayTime),
      deathCount: Math.max(candidate.deathCount, 0),
      position: readPosition(candidate.position),
      yaw: readFinite(candidate, 'yaw', Math.PI),
      pitch: clamp(readFinite(candidate, 'pitch', -0.12), -Math.PI / 2, Math.PI / 2),
      hunger: clamp(
        readFinite(candidate, 'hunger', maximumHunger),
        0,
        maximumHunger,
      ),
      armorPoints: Math.round(clamp(readFinite(candidate, 'armorPoints', 0), 0, 20)),
    };
  } catch (error: unknown) {
    console.warn('Survival state could not be restored.', error);
    return null;
  }
}

export function saveSurvivalSnapshot(
  worldId: string,
  snapshot: SurvivalSnapshot,
  storage: Storage | null,
): void {
  if (storage === null) return;
  try {
    storage.setItem(`${STORAGE_PREFIX}${worldId}`, JSON.stringify(snapshot));
  } catch (error: unknown) {
    console.warn('Survival state could not be saved.', error);
  }
}

export function deleteSurvivalSnapshot(
  worldId: string,
  storage: Storage | null,
): void {
  try {
    storage?.removeItem(`${STORAGE_PREFIX}${worldId}`);
  } catch (error: unknown) {
    console.warn('Survival state could not be deleted.', error);
  }
}
