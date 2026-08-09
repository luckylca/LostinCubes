import { describe, expect, it, vi } from 'vitest';
import { executeChunkBuild } from '../src/world/ChunkBuildTask';
import { TerrainGenerator } from '../src/world/TerrainGenerator';

describe('chunk terrain column memoization', () => {
  it('does not recompute expensive X/Z terrain fields once per Y voxel', () => {
    const surfaceSpy = vi.spyOn(TerrainGenerator.prototype, 'sampleSurfaceHeight');
    const biomeSpy = vi.spyOn(TerrainGenerator.prototype, 'sampleBiome');

    try {
      const result = executeChunkBuild({
        type: 'build-chunk',
        requestId: 91_001,
        worldSeed: 'column-memoization-regression-seed',
        chunkX: 3,
        chunkZ: -2,
        modifications: [],
        lightEmitters: [],
        mode: 'full',
      });

      expect(result.sections.length).toBeGreaterThan(0);
      // A full lighting cache contains 46×46×32 = 67,712 voxels. Before this
      // optimization surface height and biome were recalculated for nearly every
      // Y sample. Column-first filling plus a tiny worker-local LRU must keep the
      // expensive base calls comfortably below one eighth of that volume.
      expect(surfaceSpy.mock.calls.length).toBeLessThan(8_500);
      expect(biomeSpy.mock.calls.length).toBeLessThan(8_500);
    } finally {
      surfaceSpy.mockRestore();
      biomeSpy.mockRestore();
    }
  });
});
