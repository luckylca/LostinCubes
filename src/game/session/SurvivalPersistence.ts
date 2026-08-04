const STORAGE_PREFIX = 'lost-in-cubes:survival:';

export interface SurvivalSnapshot {
  readonly version: 1;
  readonly health: number;
  readonly dayTime: number;
  readonly deathCount: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function loadSurvivalSnapshot(
  worldSeed: string,
  storage: Storage | null,
  maximumHealth: number,
): SurvivalSnapshot | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${worldSeed}`);
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
      version: 1,
      health: Math.round(clamp(candidate.health, 1, maximumHealth)),
      dayTime: ((candidate.dayTime % 1) + 1) % 1,
      deathCount: Math.max(candidate.deathCount, 0),
    };
  } catch (error: unknown) {
    console.warn('Survival state could not be restored.', error);
    return null;
  }
}

export function saveSurvivalSnapshot(
  worldSeed: string,
  snapshot: SurvivalSnapshot,
  storage: Storage | null,
): void {
  if (storage === null) return;
  try {
    storage.setItem(`${STORAGE_PREFIX}${worldSeed}`, JSON.stringify(snapshot));
  } catch (error: unknown) {
    console.warn('Survival state could not be saved.', error);
  }
}
