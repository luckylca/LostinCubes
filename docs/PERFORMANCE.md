# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: reduce view distance and visual effects before risking a crash.

## Voxel and structure pipeline

Each visible 16×32×16 chunk is one Babylon mesh:

1. Reconstruct deterministic terrain and oak tree structures from the world seed.
2. Overlay sparse player-authored modifications.
3. Sample same-chunk and neighboring voxels for hidden-face removal.
4. Greedily merge coplanar faces with the same block type and normal.
5. Build typed position, normal, color, and index buffers in a Worker.
6. Transfer buffers without copying and upload at most two chunk meshes per frame.

Trees remain ordinary log and leaf voxels. They do not create individual Babylon meshes, physics bodies, or persistent structure records. Tree sampling is skipped for all voxels at or below the local terrain surface, avoiding the structure-neighborhood search in most underground generation work.

## Streaming and Worker budgets

- View radius: two chunks, producing a 5×5 desired window.
- Worker pool: one or two Workers, bounded by logical processor count.
- Scheduling: stable nearest-first Manhattan priority.
- Newer builds replace older builds for the same chunk key.
- Moving the desired window removes queued obsolete jobs and terminates active obsolete jobs.
- Terminated Worker slots are replaced immediately.
- Revision checks reject any result that races an edit or view change.
- Cancellation is expected control flow and is excluded from error logs.

## Collision and targeting budgets

- Player collision samples only integer voxels overlapped by the compact body.
- Typical overlap checks inspect roughly a 2×3×2 neighborhood.
- Movement substeps are at most 0.2 block.
- X and Z resolve independently for sliding.
- Vertical binary search runs only after blocked movement.
- Trees, crafting tables, caves, and player structures automatically participate in collision.
- Interaction uses voxel DDA from the player eye rather than triangle picking.

## Inventory and crafting budgets

The inventory is a fixed 36-slot array: 27 storage slots and nine hotbar slots.

- Normal gameplay frames compare a monotonically increasing inventory revision.
- Hotbar DOM, inventory DOM, and local-storage serialization update only after a real mutation.
- The inventory overlay creates at most 36 slot buttons and nine recipe buttons while open.
- Closing the overlay performs a bounded 36-slot cursor-return scan.
- Recipe availability scans at most 36 slots per ingredient; current recipes contain small ingredient lists.
- Legacy saves are normalized once and written back as version 3.

## Drop, particle, and audio budgets

### Ground drops

- Maximum visible entities: 96.
- Maximum items represented per entity: 64.
- Same-block entities merge within 1.25 blocks before another mesh activates.
- Physics clamps frame time and subdivides vertical movement.
- Pickup attraction only runs within 2.5 blocks.
- Drop snapshots save at most 96 records every two seconds and on page exit.
- Each snapshot stores only block, count, position, and grounded state.

### Break particles

- Maximum particle meshes: 48.
- A normal break requests nine particles.
- Particles live for approximately 0.52 seconds and reuse meshes and shared frozen materials.
- Particles have no collision or persistence.

### Audio

Break, placement, pickup, and crafting sounds use short Web Audio oscillator envelopes. There are no downloaded sound assets, decode queues, or long-lived source nodes. Audio creation is lazy after a user gesture and safely becomes a no-op when unsupported.

## Persistence and memory

- Generated terrain and trees are never stored.
- IndexedDB stores only sparse voxel differences from deterministic generation.
- Inventory and drop snapshots are small world-scoped local-storage values.
- Invalid persisted items and drops are clamped or ignored.
- Modifications matching generated terrain are deleted from the sparse delta layer.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Chunk generation and meshing do not run in the render callback.
- Shared block, player, held-item, drop, and particle materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory slot elements rebuild only while the inventory is open and its revision changes.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for terrain, deterministic forests, greedy meshing, collision, targeting, inventory migration and manipulation, crafting, drops, persistence, held items, and Worker cancellation.
3. A Vite production build including the terrain Worker.
4. A Playwright Chromium run with software WebGL that boots the production page, restores a 36-slot inventory, opens the inventory with E, crafts and stores an output, closes the menu, verifies downward targeting, switches camera mode, and rejects page or console errors.

## Next performance work

- Profile deterministic tree sampling and mesh size on representative Android hardware.
- Add distance-tiered foliage or chunk LOD before increasing view radius.
- Record main-thread frame-time percentiles while rapidly crossing chunk boundaries.
- Measure local-storage write cost after large drop populations.
- Add quality settings for particles, fog distance, render scale, and view radius.
