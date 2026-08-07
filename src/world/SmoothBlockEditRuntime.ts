import { VoxelWorldRenderer } from './VoxelWorldRenderer';

let installed = false;

/**
 * The original edit path rebuilt the complete owning chunk synchronously in
 * VoxelWorldRenderer.invalidateBlock(). That makes the final mining frame pay
 * for greedy meshing + GPU upload before input/rendering can continue.
 *
 * The renderer already has a worker-backed invalidation path through
 * invalidateLightEmitter(): it invalidates the owning chunk and neighboring
 * light chunks, then schedules them through ChunkWorkerPool. Reusing that path
 * removes the final-hit main-thread spike while preserving the same world data
 * and accurate lighting rebuild.
 */
export function installSmoothBlockEditRuntime(): void {
  if (installed) return;
  installed = true;

  VoxelWorldRenderer.prototype.invalidateBlock = function smoothInvalidateBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    if (!Number.isInteger(worldY)) {
      throw new RangeError('worldY must be an integer.');
    }
    this.invalidateLightEmitter(worldX, worldZ);
  };
}
