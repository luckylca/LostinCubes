const CATALOG_KEY = 'lost-in-cubes:world-catalog:v1';
const ACTIVE_WORLD_KEY = 'lost-in-cubes:active-world:v1';
const DEFAULT_WORLD_ID = 'world-fragment-01';
const DEFAULT_WORLD_NAME = '世界碎片 01';
const DEFAULT_WORLD_SEED = 'world-fragment-01';
const MAXIMUM_WORLDS = 24;

export interface WorldMetadata {
  readonly id: string;
  readonly name: string;
  readonly seed: string;
  readonly createdAt: number;
  readonly lastPlayedAt: number;
}

interface CatalogPayload {
  readonly version: 1;
  readonly worlds: readonly WorldMetadata[];
}

function safeNow(now: number): number {
  return Number.isFinite(now) && now > 0 ? Math.floor(now) : Date.now();
}

function sanitizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length === 0 ? '新世界' : name.slice(0, 32);
}

function sanitizeSeed(value: string): string {
  const seed = value.trim();
  if (seed.length > 0) return seed.slice(0, 96);
  return `${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugBase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return normalized.length === 0 ? 'world' : normalized;
}

function isWorldMetadata(value: unknown): value is WorldMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.seed === 'string' &&
    candidate.seed.length > 0 &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.lastPlayedAt === 'number' &&
    Number.isFinite(candidate.lastPlayedAt)
  );
}

function defaultWorld(now = Date.now()): WorldMetadata {
  const time = safeNow(now);
  return {
    id: DEFAULT_WORLD_ID,
    name: DEFAULT_WORLD_NAME,
    seed: DEFAULT_WORLD_SEED,
    createdAt: time,
    lastPlayedAt: time,
  };
}

function parseCatalog(storage: Storage | null): WorldMetadata[] {
  if (storage === null) return [defaultWorld()];
  try {
    const raw = storage.getItem(CATALOG_KEY);
    if (raw === null) return [defaultWorld()];
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return [defaultWorld()];
    const payload = parsed as Record<string, unknown>;
    if (!Array.isArray(payload.worlds)) return [defaultWorld()];
    const worlds = payload.worlds.filter(isWorldMetadata).slice(0, MAXIMUM_WORLDS);
    return worlds.length === 0 ? [defaultWorld()] : worlds;
  } catch (error: unknown) {
    console.warn('World catalog could not be restored.', error);
    return [defaultWorld()];
  }
}

function saveCatalog(storage: Storage | null, worlds: readonly WorldMetadata[]): void {
  if (storage === null) return;
  const payload: CatalogPayload = { version: 1, worlds };
  try {
    storage.setItem(CATALOG_KEY, JSON.stringify(payload));
  } catch (error: unknown) {
    console.warn('World catalog could not be saved.', error);
  }
}

export class WorldCatalog {
  readonly #storage: Storage | null;
  #worlds: WorldMetadata[];

  public constructor(storage: Storage | null) {
    this.#storage = storage;
    this.#worlds = parseCatalog(storage);
    saveCatalog(storage, this.#worlds);
  }

  public list(): WorldMetadata[] {
    return [...this.#worlds]
      .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
      .map((world) => ({ ...world }));
  }

  public create(name: string, seed: string, now = Date.now()): WorldMetadata | null {
    if (this.#worlds.length >= MAXIMUM_WORLDS) return null;
    const time = safeNow(now);
    const safeName = sanitizeName(name);
    const safeSeed = sanitizeSeed(seed);
    const base = slugBase(safeName);
    let suffix = 1;
    let id = `${base}-${time.toString(36)}`;
    while (this.#worlds.some((world) => world.id === id)) {
      suffix += 1;
      id = `${base}-${time.toString(36)}-${String(suffix)}`;
    }
    const world: WorldMetadata = {
      id,
      name: safeName,
      seed: safeSeed,
      createdAt: time,
      lastPlayedAt: time,
    };
    this.#worlds.push(world);
    this.#persist();
    return { ...world };
  }

  public rename(id: string, name: string): WorldMetadata | null {
    const index = this.#worlds.findIndex((world) => world.id === id);
    if (index < 0) return null;
    const world = { ...this.#worlds[index], name: sanitizeName(name) };
    this.#worlds[index] = world;
    this.#persist();
    return { ...world };
  }

  public delete(id: string): boolean {
    if (this.#worlds.length <= 1) return false;
    const next = this.#worlds.filter((world) => world.id !== id);
    if (next.length === this.#worlds.length) return false;
    this.#worlds = next;
    if (this.getActiveId() === id) {
      this.setActive(next[0]?.id ?? DEFAULT_WORLD_ID);
    }
    this.#persist();
    return true;
  }

  public touch(id: string, now = Date.now()): WorldMetadata | null {
    const index = this.#worlds.findIndex((world) => world.id === id);
    if (index < 0) return null;
    const world = { ...this.#worlds[index], lastPlayedAt: safeNow(now) };
    this.#worlds[index] = world;
    this.#persist();
    return { ...world };
  }

  public setActive(id: string): WorldMetadata | null {
    const world = this.#worlds.find((candidate) => candidate.id === id);
    if (world === undefined) return null;
    try {
      this.#storage?.setItem(ACTIVE_WORLD_KEY, id);
    } catch (error: unknown) {
      console.warn('Active world could not be saved.', error);
    }
    return { ...world };
  }

  public getActive(): WorldMetadata {
    const activeId = this.getActiveId();
    const world = this.#worlds.find((candidate) => candidate.id === activeId);
    return { ...(world ?? this.#worlds[0] ?? defaultWorld()) };
  }

  public getActiveId(): string {
    try {
      const active = this.#storage?.getItem(ACTIVE_WORLD_KEY);
      if (active !== null && active !== undefined) return active;
    } catch {
      // Fall through to the first catalog entry.
    }
    return this.#worlds[0]?.id ?? DEFAULT_WORLD_ID;
  }

  public get maximumWorlds(): number {
    return MAXIMUM_WORLDS;
  }

  #persist(): void {
    saveCatalog(this.#storage, this.#worlds);
  }
}
