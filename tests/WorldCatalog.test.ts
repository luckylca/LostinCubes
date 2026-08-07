import { describe, expect, it } from 'vitest';
import { WorldCatalog } from '../src/world/WorldCatalog';

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  public get length(): number {
    return this.#values.size;
  }

  public clear(): void {
    this.#values.clear();
  }

  public getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.#values.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

describe('WorldCatalog', () => {
  it('migrates the original fragment into a default selectable world', () => {
    const catalog = new WorldCatalog(new MemoryStorage());
    const worlds = catalog.list();

    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.id).toBe('world-fragment-01');
    expect(worlds[0]?.seed).toBe('world-fragment-01');
  });

  it('creates seeded worlds and keeps the active world by stable id', () => {
    const storage = new MemoryStorage();
    const catalog = new WorldCatalog(storage);
    const created = catalog.create('雪原测试', 'my-seed-42', 1_000);

    expect(created).not.toBeNull();
    if (created === null) return;
    expect(created.seed).toBe('my-seed-42');
    expect(catalog.setActive(created.id)?.id).toBe(created.id);
    expect(new WorldCatalog(storage).getActive().id).toBe(created.id);
  });

  it('renames and deletes worlds without changing their seed identity', () => {
    const storage = new MemoryStorage();
    const catalog = new WorldCatalog(storage);
    const created = catalog.create('测试世界', 'fixed-seed', 2_000);
    expect(created).not.toBeNull();
    if (created === null) return;

    const renamed = catalog.rename(created.id, '新的名字');
    expect(renamed?.name).toBe('新的名字');
    expect(renamed?.seed).toBe('fixed-seed');
    expect(catalog.delete(created.id)).toBe(true);
    expect(catalog.list().some((world) => world.id === created.id)).toBe(false);
    expect(catalog.delete('world-fragment-01')).toBe(false);
  });
});
