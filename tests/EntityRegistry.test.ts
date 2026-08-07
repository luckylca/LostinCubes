import { describe, expect, it } from 'vitest';
import { EntityRegistry } from '../src/entities/EntityRegistry';

describe('EntityRegistry', () => {
  it('bounds entity count and allocates stable unique ids', () => {
    const registry = new EntityRegistry(2, 4);
    const first = registry.spawn({
      kind: 'zombie',
      position: { x: 0, y: 2, z: 0 },
    });
    const second = registry.spawn({
      kind: 'cow',
      position: { x: 3, y: 2, z: 0 },
    });
    const rejected = registry.spawn({
      kind: 'spider',
      position: { x: 5, y: 2, z: 0 },
    });

    expect(first?.id).toBe('zombie-1');
    expect(second?.id).toBe('cow-2');
    expect(rejected).toBeNull();
    expect(registry.size).toBe(2);
  });

  it('updates spatial buckets and filters radius queries by kind', () => {
    const registry = new EntityRegistry(8, 4);
    const zombie = registry.spawn({
      kind: 'zombie',
      position: { x: 1, y: 2, z: 1 },
    });
    registry.spawn({
      kind: 'cow',
      position: { x: 2, y: 2, z: 1 },
    });
    expect(zombie).not.toBeNull();
    if (zombie === null) return;

    const hostileKinds = new Set(['zombie', 'skeleton'] as const);
    expect(
      registry.queryRadius({ x: 0, y: 2, z: 0 }, 4, hostileKinds).map((entity) => entity.kind),
    ).toEqual(['zombie']);

    registry.update(zombie.id, { position: { x: 20, y: 2, z: 20 } });
    expect(registry.queryRadius({ x: 0, y: 2, z: 0 }, 4)).toHaveLength(1);
    expect(registry.queryRadius({ x: 20, y: 2, z: 20 }, 1)).toHaveLength(1);
  });

  it('persists only entities explicitly marked persistent', () => {
    const registry = new EntityRegistry();
    registry.spawn({
      id: 'cow-home',
      kind: 'cow',
      position: { x: 1, y: 3, z: 4 },
      persistent: true,
      state: { variant: 'brown' },
    });
    registry.spawn({
      kind: 'arrow',
      position: { x: 2, y: 3, z: 4 },
      persistent: false,
    });

    expect(registry.persistentSnapshots.map((entity) => entity.id)).toEqual([
      'cow-home',
    ]);
  });
});
