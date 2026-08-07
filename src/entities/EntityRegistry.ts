export type EntityKind =
  | 'zombie'
  | 'skeleton'
  | 'spider'
  | 'creeper'
  | 'cow'
  | 'pig'
  | 'sheep'
  | 'arrow'
  | 'tnt'
  | 'dropped-item';

export interface EntityVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EntitySnapshot {
  readonly id: string;
  readonly kind: EntityKind;
  readonly position: EntityVector;
  readonly velocity: EntityVector;
  readonly health: number;
  readonly maximumHealth: number;
  readonly collisionRadius: number;
  readonly persistent: boolean;
  readonly ageSeconds: number;
  readonly ownerId: string | null;
  readonly state: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SpawnEntityOptions {
  readonly id?: string;
  readonly kind: EntityKind;
  readonly position: EntityVector;
  readonly velocity?: EntityVector;
  readonly health?: number;
  readonly maximumHealth?: number;
  readonly collisionRadius?: number;
  readonly persistent?: boolean;
  readonly ageSeconds?: number;
  readonly ownerId?: string | null;
  readonly state?: Readonly<Record<string, string | number | boolean | null>>;
}

interface MutableEntity {
  id: string;
  kind: EntityKind;
  position: EntityVector;
  velocity: EntityVector;
  health: number;
  maximumHealth: number;
  collisionRadius: number;
  persistent: boolean;
  ageSeconds: number;
  ownerId: string | null;
  state: Record<string, string | number | boolean | null>;
  spatialKey: string;
}

const DEFAULT_MAXIMUM_ENTITIES = 160;
const DEFAULT_SPATIAL_CELL_SIZE = 8;
const ZERO_VECTOR: EntityVector = { x: 0, y: 0, z: 0 };

function cloneVector(vector: EntityVector): EntityVector {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value: number, fallback: number): number {
  const normalized = finite(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function snapshotOf(entity: MutableEntity): EntitySnapshot {
  return {
    id: entity.id,
    kind: entity.kind,
    position: cloneVector(entity.position),
    velocity: cloneVector(entity.velocity),
    health: entity.health,
    maximumHealth: entity.maximumHealth,
    collisionRadius: entity.collisionRadius,
    persistent: entity.persistent,
    ageSeconds: entity.ageSeconds,
    ownerId: entity.ownerId,
    state: { ...entity.state },
  };
}

/**
 * Central bounded entity store with a small X/Z spatial hash. Entity-specific
 * renderers and AI own presentation only; identity, lifetime, persistence and
 * nearby queries live here so mobs, projectiles and TNT share one lifecycle.
 */
export class EntityRegistry {
  readonly #maximumEntities: number;
  readonly #cellSize: number;
  readonly #entities = new Map<string, MutableEntity>();
  readonly #cells = new Map<string, Set<string>>();
  #nextId = 1;

  public constructor(
    maximumEntities = DEFAULT_MAXIMUM_ENTITIES,
    spatialCellSize = DEFAULT_SPATIAL_CELL_SIZE,
  ) {
    if (!Number.isInteger(maximumEntities) || maximumEntities <= 0) {
      throw new RangeError('maximumEntities must be a positive integer.');
    }
    if (!Number.isFinite(spatialCellSize) || spatialCellSize <= 0) {
      throw new RangeError('spatialCellSize must be positive.');
    }
    this.#maximumEntities = maximumEntities;
    this.#cellSize = spatialCellSize;
  }

  public spawn(options: SpawnEntityOptions): EntitySnapshot | null {
    const requestedId = options.id?.trim();
    const id =
      requestedId === undefined || requestedId.length === 0
        ? this.#allocateId(options.kind)
        : requestedId;
    if (this.#entities.has(id)) return null;
    if (this.#entities.size >= this.#maximumEntities) return null;

    const maximumHealth = positive(options.maximumHealth ?? 20, 20);
    const health = Math.min(
      Math.max(finite(options.health ?? maximumHealth, maximumHealth), 0),
      maximumHealth,
    );
    const position = {
      x: finite(options.position.x, 0),
      y: finite(options.position.y, 0),
      z: finite(options.position.z, 0),
    };
    const entity: MutableEntity = {
      id,
      kind: options.kind,
      position,
      velocity:
        options.velocity === undefined
          ? ZERO_VECTOR
          : {
              x: finite(options.velocity.x, 0),
              y: finite(options.velocity.y, 0),
              z: finite(options.velocity.z, 0),
            },
      health,
      maximumHealth,
      collisionRadius: positive(options.collisionRadius ?? 0.4, 0.4),
      persistent: options.persistent ?? false,
      ageSeconds: Math.max(finite(options.ageSeconds ?? 0, 0), 0),
      ownerId: options.ownerId ?? null,
      state: { ...(options.state ?? {}) },
      spatialKey: this.#spatialKey(position.x, position.z),
    };
    this.#entities.set(id, entity);
    this.#addToCell(entity.spatialKey, id);
    return snapshotOf(entity);
  }

  public restore(snapshots: readonly EntitySnapshot[]): number {
    let restored = 0;
    for (const snapshot of snapshots) {
      if (this.#entities.size >= this.#maximumEntities) break;
      if (
        this.spawn({
          id: snapshot.id,
          kind: snapshot.kind,
          position: snapshot.position,
          velocity: snapshot.velocity,
          health: snapshot.health,
          maximumHealth: snapshot.maximumHealth,
          collisionRadius: snapshot.collisionRadius,
          persistent: snapshot.persistent,
          ageSeconds: snapshot.ageSeconds,
          ownerId: snapshot.ownerId,
          state: snapshot.state,
        }) !== null
      ) {
        restored += 1;
      }
    }
    return restored;
  }

  public get(id: string): EntitySnapshot | null {
    const entity = this.#entities.get(id);
    return entity === undefined ? null : snapshotOf(entity);
  }

  public update(
    id: string,
    patch: {
      readonly position?: EntityVector;
      readonly velocity?: EntityVector;
      readonly health?: number;
      readonly ageSeconds?: number;
      readonly state?: Readonly<Record<string, string | number | boolean | null>>;
    },
  ): EntitySnapshot | null {
    const entity = this.#entities.get(id);
    if (entity === undefined) return null;

    if (patch.position !== undefined) {
      const position = {
        x: finite(patch.position.x, entity.position.x),
        y: finite(patch.position.y, entity.position.y),
        z: finite(patch.position.z, entity.position.z),
      };
      const nextSpatialKey = this.#spatialKey(position.x, position.z);
      if (nextSpatialKey !== entity.spatialKey) {
        this.#removeFromCell(entity.spatialKey, id);
        this.#addToCell(nextSpatialKey, id);
        entity.spatialKey = nextSpatialKey;
      }
      entity.position = position;
    }
    if (patch.velocity !== undefined) {
      entity.velocity = {
        x: finite(patch.velocity.x, entity.velocity.x),
        y: finite(patch.velocity.y, entity.velocity.y),
        z: finite(patch.velocity.z, entity.velocity.z),
      };
    }
    if (patch.health !== undefined && Number.isFinite(patch.health)) {
      entity.health = Math.min(Math.max(patch.health, 0), entity.maximumHealth);
    }
    if (patch.ageSeconds !== undefined && Number.isFinite(patch.ageSeconds)) {
      entity.ageSeconds = Math.max(patch.ageSeconds, 0);
    }
    if (patch.state !== undefined) entity.state = { ...patch.state };
    return snapshotOf(entity);
  }

  public damage(id: string, amount: number): number {
    const entity = this.#entities.get(id);
    if (entity === undefined || !Number.isFinite(amount) || amount <= 0) return 0;
    const before = entity.health;
    entity.health = Math.max(entity.health - Math.floor(amount), 0);
    return before - entity.health;
  }

  public remove(id: string): EntitySnapshot | null {
    const entity = this.#entities.get(id);
    if (entity === undefined) return null;
    this.#entities.delete(id);
    this.#removeFromCell(entity.spatialKey, id);
    return snapshotOf(entity);
  }

  public queryRadius(
    position: EntityVector,
    radius: number,
    kinds?: ReadonlySet<EntityKind>,
  ): EntitySnapshot[] {
    if (!Number.isFinite(radius) || radius < 0) return [];
    const minimumCellX = Math.floor((position.x - radius) / this.#cellSize);
    const maximumCellX = Math.floor((position.x + radius) / this.#cellSize);
    const minimumCellZ = Math.floor((position.z - radius) / this.#cellSize);
    const maximumCellZ = Math.floor((position.z + radius) / this.#cellSize);
    const radiusSquared = radius * radius;
    const result: EntitySnapshot[] = [];
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const ids = this.#cells.get(`${String(cellX)},${String(cellZ)}`);
        if (ids === undefined) continue;
        for (const id of ids) {
          const entity = this.#entities.get(id);
          if (
            entity === undefined ||
            (kinds !== undefined && !kinds.has(entity.kind))
          ) {
            continue;
          }
          const deltaX = entity.position.x - position.x;
          const deltaY = entity.position.y - position.y;
          const deltaZ = entity.position.z - position.z;
          if (
            deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <=
            radiusSquared
          ) {
            result.push(snapshotOf(entity));
          }
        }
      }
    }
    return result;
  }

  public queryAabb(
    minimum: EntityVector,
    maximum: EntityVector,
  ): EntitySnapshot[] {
    const center = {
      x: (minimum.x + maximum.x) / 2,
      y: (minimum.y + maximum.y) / 2,
      z: (minimum.z + maximum.z) / 2,
    };
    const radius =
      Math.hypot(
        maximum.x - minimum.x,
        maximum.y - minimum.y,
        maximum.z - minimum.z,
      ) / 2;
    return this.queryRadius(center, radius).filter(
      (entity) =>
        entity.position.x >= minimum.x &&
        entity.position.x <= maximum.x &&
        entity.position.y >= minimum.y &&
        entity.position.y <= maximum.y &&
        entity.position.z >= minimum.z &&
        entity.position.z <= maximum.z,
    );
  }

  public advanceAge(stepSeconds: number): void {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) return;
    for (const entity of this.#entities.values()) {
      entity.ageSeconds += stepSeconds;
    }
  }

  public clear(): void {
    this.#entities.clear();
    this.#cells.clear();
  }

  public countByKind(kind: EntityKind): number {
    let count = 0;
    for (const entity of this.#entities.values()) {
      if (entity.kind === kind) count += 1;
    }
    return count;
  }

  public get snapshots(): EntitySnapshot[] {
    return [...this.#entities.values()].map(snapshotOf);
  }

  public get persistentSnapshots(): EntitySnapshot[] {
    return [...this.#entities.values()]
      .filter((entity) => entity.persistent)
      .map(snapshotOf);
  }

  public get size(): number {
    return this.#entities.size;
  }

  public get capacity(): number {
    return this.#maximumEntities;
  }

  #allocateId(kind: EntityKind): string {
    let id = `${kind}-${String(this.#nextId)}`;
    this.#nextId += 1;
    while (this.#entities.has(id)) {
      id = `${kind}-${String(this.#nextId)}`;
      this.#nextId += 1;
    }
    return id;
  }

  #spatialKey(worldX: number, worldZ: number): string {
    return `${String(Math.floor(worldX / this.#cellSize))},${String(
      Math.floor(worldZ / this.#cellSize),
    )}`;
  }

  #addToCell(key: string, id: string): void {
    let ids = this.#cells.get(key);
    if (ids === undefined) {
      ids = new Set<string>();
      this.#cells.set(key, ids);
    }
    ids.add(id);
  }

  #removeFromCell(key: string, id: string): void {
    const ids = this.#cells.get(key);
    if (ids === undefined) return;
    ids.delete(id);
    if (ids.size === 0) this.#cells.delete(key);
  }
}
