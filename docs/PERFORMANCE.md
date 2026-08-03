# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: reduce view distance and visual effects before risking a crash.

## Voxel and structure pipeline

Each visible 16×32×16 chunk remains one Babylon mesh:

1. Reconstruct deterministic surface terrain, protected underground shell, caves, ore veins, and oak structures from the world seed.
2. Overlay sparse player-authored modifications.
3. Sample same-chunk and neighboring voxels for hidden-face removal.
4. Greedily merge coplanar faces with the same block type and normal.
5. Build typed position, normal, color, and index buffers in a Worker.
6. Transfer buffers without copying and upload at most two chunk meshes per frame.

Caves and ores are sampled directly from deterministic 3D value noise. They do not create cave objects, ore entities, physics bodies, or persistent generation records. Trees remain ordinary log and leaf voxels and also introduce no per-tree meshes.

## Streaming and Worker budgets

- View radius: two chunks, producing a 5×5 desired window.
- Worker pool: one or two Workers, bounded by logical processor count.
- Scheduling: stable nearest-first Manhattan priority.
- Newer builds replace older builds for the same chunk key.
- Moving the desired window removes queued obsolete jobs and terminates active obsolete jobs.
- Runtime Worker errors migrate active and queued work to deterministic synchronous generation instead of aborting startup.
- Revision checks reject any result that races an edit or view change.
- Cancellation is expected control flow and is excluded from error logs.

## Collision, targeting, and survival budgets

- Player collision samples only integer voxels overlapped by the compact body.
- Typical overlap checks inspect roughly a 2×3×2 neighborhood.
- Movement substeps are at most 0.2 block.
- X and Z resolve independently for sliding.
- Vertical binary search runs only after blocked movement.
- Trees, ores, furnaces, caves, and player structures use the same voxel collision query.
- Interaction uses voxel DDA from the player eye rather than triangle picking.
- Fall damage stores only the maximum downward speed during the current airborne interval and resolves once on landing.
- Health, respawn, and the three-minute day clock advance in the existing fixed-step session without separate timers.

## Lighting budget

Day/night uses the existing scene lights rather than creating dynamic lights:

- one hemispheric light
- one directional sun
- one sky/fog color update per rendered frame
- no shadow maps, skybox textures, volumetric lighting, or post-processing pipeline

The update mutates existing colors, intensity, and direction values. It does not allocate a new light or material every frame.

## Inventory, crafting, and furnace budgets

The inventory is a fixed 36-slot array: 27 storage slots and nine hotbar slots.

- Normal frames compare a monotonically increasing inventory revision.
- Hotbar DOM, inventory DOM, and local-storage serialization update only after a real mutation.
- The overlay creates at most 36 slot buttons plus the currently visible recipe cards.
- Closing performs a bounded 36-slot cursor-return scan.
- Recipe availability scans at most 36 slots per ingredient.
- Furnace smelting uses the same atomic ingredient aggregation as crafting; it does not run a background furnace simulation.
- Legacy saves are normalized once and written back as version 3.

## Drop, particle, and audio budgets

### Ground drops

- Maximum visible entities: 96.
- Maximum items represented per entity follows the item definition: 64 for blocks/materials and one for tools.
- Nearby identical items merge within 1.25 blocks before another mesh activates.
- Physics clamps frame time and subdivides vertical movement.
- Pickup attraction only runs within 2.5 blocks.
- Drop snapshots save at most 96 records every two seconds and on page exit.
- Each snapshot stores only item identity, count, position, and grounded state.
- Materials are created lazily per encountered item and shared by all drops of that item.

### Break particles

- Maximum particle meshes: 48.
- A normal break requests nine particles.
- Particles live for approximately 0.52 seconds and reuse meshes and shared frozen materials.
- Particles have no collision or persistence.

### Audio

Break, placement, pickup, and crafting/smelting sounds use short Web Audio oscillator envelopes. There are no downloaded sound assets, decode queues, or long-lived source nodes. Audio creation is lazy after a user gesture and safely becomes a no-op when unsupported.

## Persistence and memory

- Generated terrain, caves, ore veins, and trees are never stored.
- IndexedDB stores only sparse voxel differences from deterministic generation.
- Inventory and drop snapshots are small world-scoped local-storage values.
- Ground-drop persistence migrated from numeric block IDs to item identities while retaining legacy restore support.
- Invalid persisted item, block, voxel, and drop identifiers are ignored.
- Modifications matching generated terrain are deleted from the sparse delta layer.
- Health, day time, and death count are session-only and do not add storage writes yet.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Chunk generation and meshing do not normally run in the render callback.
- Shared block, player, held-item, drop, and particle materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory slot elements rebuild only while the inventory is open and its revision changes.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for deterministic terrain/caves/ores, surface protection, greedy meshing, collision, targeting, inventory and drop migration, crafting/smelting, harvest tiers, held items, fall damage, respawn, day time, and Worker cancellation/fallback.
3. A Vite production build including the terrain Worker.
4. Playwright Chromium runs with software WebGL that restore a 36-slot survival inventory, verify iron-tool rendering and health/time diagnostics, craft and store an output, preserve downward targeting/camera switching, and force Worker runtime failure without preventing startup.

## Next performance work

- Profile 3D cave/ore sampling and mesh size on representative Android hardware.
- Add distance-tiered foliage or chunk LOD before increasing view radius.
- Record main-thread frame-time percentiles while rapidly crossing chunk boundaries.
- Measure local-storage write cost after large mixed-item drop populations.
- Add quality settings for particles, fog distance, render scale, view radius, and day/night updates.
