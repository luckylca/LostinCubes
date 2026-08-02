# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: degrade quality and view distance rather than crash.

## Current voxel pipeline

Each visible chunk is one Babylon mesh built by this pipeline:

1. Reconstruct deterministic terrain from the world seed.
2. Overlay sparse player-authored block modifications.
3. Cull faces against the same and neighboring chunks.
4. Greedily merge coplanar faces sharing material and normal.
5. Build typed position, normal, color, and index buffers in a Web Worker.
6. Transfer buffers without structured-clone copies.
7. Upload at most two completed chunk meshes per rendered frame.

A full 16×1×16 slab has 576 exposed source faces but collapses to six rendered quads.

## Streaming and worker budgets

- Chunk dimensions: 16×32×16 blocks.
- Current radius: two chunks, producing a 5×5 desired window.
- Worker pool: one or two workers, bounded by logical processor count.
- Main-thread mesh uploads: maximum two chunks per frame.
- Every build has a stable chunk key and Manhattan-distance priority.
- Scheduling is nearest-first and stable for equal priorities.
- Scheduling a newer revision for the same key cancels the old queued or active build.
- Moving the desired window cancels builds whose keys are no longer visible.
- Active cancellation terminates the occupied Worker and immediately creates a replacement slot.
- Revision numbers still reject any result that races with an edit or view change.
- Cancellation is expected control flow and is not printed as an error.

Terminating a Worker is more expensive than dropping a queued array entry, so cancellation occurs only for stable-key replacement and desired-window removal. This is preferable to spending a full terrain and greedy-mesh pass on a chunk that cannot be displayed.

## Collision budget

Full player collision samples only voxels overlapped by the compact player body.

- Typical overlap checks inspect roughly a 2×3×2 neighborhood.
- X and Z resolve independently for wall sliding.
- Movement substeps are at most 0.2 block.
- Step candidates come from nearby voxel top surfaces.
- Vertical contacts use a bounded 12-iteration binary search only after blocking.
- Support probes are short local checks rather than scene raycasts.

Walls, ceilings, caves, overhangs, and player structures therefore work without one physics body per block.

## Dropped-item budget

Drops use a fixed-capacity entity pool rather than unrestricted mesh creation.

- Maximum visible drop entities: 96.
- Maximum count per drop entity: 64.
- Nearby same-block drops merge before another pooled mesh is activated.
- Meshes and four shared frozen materials are reused.
- Physics clamps frame time and subdivides vertical motion to avoid falling through a surface.
- Ground checks sample only the voxel directly under the small item cube.
- Attraction and pickup operate only inside a 2.5-block radius.
- Inventory overflow remains attached to the same drop entity.
- Drops older than five minutes or below the world floor are recycled.

The pool intentionally limits draw calls before hostile entities, particles, vegetation, and combat effects are added. Ground drops are session-only and are not serialized yet.

## Persistence and memory

Generated terrain is never stored in IndexedDB. Only sparse differences from deterministic generation are retained in maps and one record per changed block. Worker snapshots include only the target chunk and immediate-neighbor modifications.

Inventory is a fixed nine-slot structure. Blocks, tools, counts, durability, and selection serialize only when the inventory revision changes. Normal frames perform an integer comparison rather than rebuilding DOM or writing storage.

## Frame and allocation rules

Simulation uses a fixed step with bounded catch-up. Chunk generation and meshing do not run in the render callback. Hot meshing loops reuse masks and emit typed arrays only at completion. Shared world materials and chunk matrices are frozen. Interaction uses voxel DDA rather than triangle picking.

Input handlers reuse held-state sets. Hotbar buttons are created once and updated in place. Drop meshes are pooled and mutate existing transforms. The third-person projected target reuses vectors and avoids DOM writes below a pixel threshold.

## Runtime validation

CI has two validation levels:

1. Vitest verifies collision, meshing, inventory migration, tool durability, mining multipliers, drop merging/pickup, worker cancellation, persistence, and camera helpers.
2. Playwright launches the production preview in Chromium with software WebGL, waits for the first playable chunk, rejects page/console errors, and checks HUD, block/tool hotbar state, camera switching, and canvas rendering.

## Runtime diagnostics

The HUD exposes smoothed FPS, loaded/desired chunks, pending builds/uploads, rendered greedy quads, active ground drops, held item, camera mode, and mining progress. The renderer also tracks total cancelled builds, source faces, and average worker build duration for future profiling panels.

## Next performance work

- Capture representative Chrome desktop and Android frame-time profiles.
- Add distance-tiered rendering or LOD before increasing view radius.
- Persist or unload ground drops by chunk before multiple save slots.
- Profile drop draw calls and collision query counts after structures and combat are added.
- Add automatic quality scaling based on sustained frame time and queue pressure.
