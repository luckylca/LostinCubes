import { resolveRuntimeWorldId } from '../world/ActiveWorldRuntime';
import type { EntityKind, EntitySnapshot } from './EntityRegistry';

const STORAGE_PREFIX = 'lost-in-cubes:entities:v1:';
const MAXIMUM_PERSISTED_ENTITIES = 128;
const VALID_KINDS = new Set<EntityKind>([
  'zombie',
  'skeleton',
  'spider',
  'creeper',
  'cow',
  'pig',
  'sheep',
  'arrow',
  'tnt',
  'dropped-item',
]);

interface EntitySavePayload {
  readonly version: 1;
  readonly entities: readonly EntitySnapshot[];
}

function finiteVector(value: unknown): value is EntitySnapshot['position'] {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y) &&
    typeof candidate.z === 'number' &&
    Number.isFinite(candidate.z)
  );
}

function validState(
  value: unknown,
): value is Readonly<Record<string, string | number | boolean | null>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (
      entry !== null &&
      typeof entry !== 'string' &&
      typeof entry !== 'number' &&
      typeof entry !== 'boolean'
    ) {
      return false;
    }
    if (typeof entry === 'number' && !Number.isFinite(entry)) return false;
  }
  return true;
}

function validSnapshot(value: unknown): value is EntitySnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.kind === 'string' &&
    VALID_KINDS.has(candidate.kind as EntityKind) &&
    finiteVector(candidate.position) &&
    finiteVector(candidate.velocity) &&
    typeof candidate.health === 'number' &&
    Number.isFinite(candidate.health) &&
    typeof candidate.maximumHealth === 'number' &&
    Number.isFinite(candidate.maximumHealth) &&
    candidate.maximumHealth > 0 &&
    typeof candidate.collisionRadius === 'number' &&
    Number.isFinite(candidate.collisionRadius) &&
    candidate.collisionRadius > 0 &&
    typeof candidate.persistent === 'boolean' &&
    typeof candidate.ageSeconds === 'number' &&
    Number.isFinite(candidate.ageSeconds) &&
    candidate.ageSeconds >= 0 &&
    (candidate.ownerId === null || typeof candidate.ownerId === 'string') &&
    validState(candidate.state)
  );
}

function entityStorageKey(worldId: string): string {
  return `${STORAGE_PREFIX}${resolveRuntimeWorldId(worldId)}`;
}

export function loadEntitySnapshots(
  worldId: string,
  storage: Storage | null,
): EntitySnapshot[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(entityStorageKey(worldId));
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return [];
    const payload = parsed as Record<string, unknown>;
    if (!Array.isArray(payload.entities)) return [];
    return payload.entities
      .filter(validSnapshot)
      .filter((entity) => entity.persistent)
      .slice(0, MAXIMUM_PERSISTED_ENTITIES)
      .map((entity) => ({
        ...entity,
        position: { ...entity.position },
        velocity: { ...entity.velocity },
        state: { ...entity.state },
      }));
  } catch (error: unknown) {
    console.warn('Entity state could not be restored.', error);
    return [];
  }
}

export function saveEntitySnapshots(
  worldId: string,
  snapshots: readonly EntitySnapshot[],
  storage: Storage | null,
): void {
  if (storage === null) return;
  const entities = snapshots
    .filter((entity) => entity.persistent)
    .slice(0, MAXIMUM_PERSISTED_ENTITIES);
  const payload: EntitySavePayload = { version: 1, entities };
  try {
    storage.setItem(entityStorageKey(worldId), JSON.stringify(payload));
  } catch (error: unknown) {
    console.warn('Entity state could not be saved.', error);
  }
}

export function deleteEntitySnapshots(
  worldId: string,
  storage: Storage | null,
): void {
  try {
    storage?.removeItem(`${STORAGE_PREFIX}${worldId}`);
  } catch (error: unknown) {
    console.warn('Entity state could not be deleted.', error);
  }
}
