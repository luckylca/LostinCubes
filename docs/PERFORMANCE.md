# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: degrade quality and view distance rather than crash.

## Current voxel pipeline

The playable world never creates one Babylon mesh per block. Each visible chunk is one mesh built by this pipeline:

1. Reconstruct deterministic terrain from the world seed.
2. Overlay only sparse player-authored block modifications.
3. Cull faces against blocks in the same chunk and neighboring chunks.
4. Greedily merge coplanar faces that share a block material and normal.
5. Return typed position, normal, color, and index arrays from a Web Worker.
6. Transfer the underlying buffers without structured-clone copies.
7. Upload at most two completed chunk meshes on the main thread per frame.

A full 16×1×16 slab has 576 exposed source faces but collapses to six rendered quads. The HUD reports rendered greedy quads instead of only raw face counts so regressions are visible while playing.

## Streaming budgets

- Chunk dimensions: 16×32×16 blocks.
- Current radius: two chunks from the player, producing a 5×5 desired window.
- Worker pool: one or two workers, bounded by available logical processors.
- Main-thread mesh uploads: maximum two chunks per rendered frame.
- Scheduling: nearest chunks are requested first.
- Stale work: revision numbers prevent old worker results replacing newer edits.
- Unloading: meshes outside the desired window are disposed immediately.

The first center chunk is awaited before the loading overlay is removed. The remaining chunks stream progressively so startup does not require building the entire 5×5 window.

## Persistence and memory

Generated terrain is not stored in IndexedDB and is not duplicated in long-lived JavaScript objects. Only sparse differences from deterministic generation are kept:

- one map for changed block values;
- per-chunk maps for worker snapshots;
- one IndexedDB record per modified block;
- modifications are removed again when a block matches generated terrain.

Worker requests include only modifications in the target chunk and its immediate neighbors, because only those edits can affect cross-boundary face visibility.

## Frame and allocation rules

Simulation uses a fixed step with bounded catch-up. Chunk generation and meshing never run in the normal render callback. Hot meshing loops reuse a fixed mask and emit typed arrays only once at completion. Shared world materials are frozen, chunk world matrices are frozen after placement, and interaction uses a deterministic voxel DDA ray rather than Babylon mesh picking.

Touch-move handlers reuse input state and do not allocate command queues. Entities, drops, particles, and combat effects should use pools only after profiling shows allocation pressure.

## Quality levels

Low, medium, high, and auto should eventually adjust render scale, view distance, shadows, particles, vegetation, post-processing, and dynamic lights. Auto should start conservatively using device signals and later use measured frame time and worker queue depth.

## Runtime diagnostics

The current HUD exposes:

- smoothed FPS;
- loaded versus desired chunks;
- pending chunk builds/uploads;
- rendered greedy quad count;
- selected block and camera mode.

The renderer also tracks source face count and average worker build duration for future profiling panels.

## Next performance work

- Full voxel wall and ceiling collision without per-frame broad scans.
- Worker job cancellation or priority replacement when the player moves quickly.
- Distance-tiered rendering or LOD before increasing view radius further.
- Browser smoke tests that verify worker startup and first-chunk rendering.
- Representative Chrome desktop and Android profiles before adding structures, vegetation, drops, or combat effects.
