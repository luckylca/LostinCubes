import { CHUNK_SIZE } from './VoxelChunk';
import { VoxelWorldRenderer } from './VoxelWorldRenderer';

interface TravelState {
  x: number;
  z: number;
  directionX: number;
  directionZ: number;
  lastPrefetchX: number;
  lastPrefetchZ: number;
}

const STATE = new WeakMap<VoxelWorldRenderer, TravelState>();
const LOOKAHEAD_BLOCKS = CHUNK_SIZE * 0.95;
const MINIMUM_FRAME_TRAVEL = 0.003;
const MINIMUM_PREFETCH_SHIFT = 2.2;
let installed = false;

/**
 * Continuously promotes the 3x3 near-field in front of a moving player.
 *
 * VoxelWorldRenderer already has a low-priority forward row, but that row is
 * recomputed mainly when the center chunk changes. This runtime makes the
 * safety near-field proactive: while the player is still well inside the
 * current chunk we use recent world-space travel to request the next area at
 * critical worker priority. By the time the movement gate reaches it, the mesh
 * is normally already CPU-built and GPU-uploaded.
 */
export function installForwardChunkPrefetchRuntime(): void {
  if (installed) return;
  installed = true;

  const originalUpdate = VoxelWorldRenderer.prototype.update;
  VoxelWorldRenderer.prototype.update = function prefetchingUpdate(
    playerX: number,
    playerZ: number,
  ) {
    const previous = STATE.get(this);
    if (previous === undefined) {
      STATE.set(this, {
        x: playerX,
        z: playerZ,
        directionX: 0,
        directionZ: 0,
        lastPrefetchX: playerX,
        lastPrefetchZ: playerZ,
      });
    } else {
      const deltaX = playerX - previous.x;
      const deltaZ = playerZ - previous.z;
      const travel = Math.hypot(deltaX, deltaZ);
      previous.x = playerX;
      previous.z = playerZ;

      if (travel >= MINIMUM_FRAME_TRAVEL) {
        const frameDirectionX = deltaX / travel;
        const frameDirectionZ = deltaZ / travel;
        previous.directionX = previous.directionX * 0.72 + frameDirectionX * 0.28;
        previous.directionZ = previous.directionZ * 0.72 + frameDirectionZ * 0.28;
        const directionLength = Math.hypot(
          previous.directionX,
          previous.directionZ,
        );
        const shifted = Math.hypot(
          playerX - previous.lastPrefetchX,
          playerZ - previous.lastPrefetchZ,
        );
        if (directionLength > 0.18 && shifted >= MINIMUM_PREFETCH_SHIFT) {
          const directionX = previous.directionX / directionLength;
          const directionZ = previous.directionZ / directionLength;
          this.ensureNearFieldReady(
            playerX + directionX * LOOKAHEAD_BLOCKS,
            playerZ + directionZ * LOOKAHEAD_BLOCKS,
          );
          previous.lastPrefetchX = playerX;
          previous.lastPrefetchZ = playerZ;
        }
      }
    }

    return originalUpdate.call(this, playerX, playerZ);
  };
}
