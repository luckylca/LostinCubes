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

Caves and ores come directly from deterministic 3D value noise. Trees and leaves remain ordinary voxels. These features create no cave objects, ore entities, per-tree meshes, physics bodies, or generated-world save records.

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
- Block interaction uses voxel DDA from the player eye rather than triangle picking.
- Fall damage stores only the maximum downward speed during the current airborne interval and resolves once on landing.
- Health, respawn, and the three-minute day clock advance in the existing fixed-step session without separate browser timers.
- External damage and healing update one scalar health value and publish a new immutable world-state snapshot.
- Death inventory transfer scans the fixed 36-slot array once and then uses the bounded ground-drop pool.

## Night enemy and combat budget

Night stalkers use a fixed pool rather than creating and destroying models repeatedly.

- Maximum active enemies: 10.
- Spawn check: once every four active gameplay seconds during night.
- Each stalker uses one transform root with a small fixed set of box meshes and shared frozen materials.
- Daylight and distance despawn only disable pooled roots.
- AI is O(active enemies) per fixed step.
- Pursuit computes one horizontal direction and one deterministic standing-height sample; there is no navigation mesh, A*, dynamic rigid body, or per-enemy raycast.
- Enemy attacks use scalar radius and cooldown checks.
- Player melee scans at most ten enemies and performs projection/distance checks against the view direction.
- Hit flashes swap between two shared materials instead of allocating effects.
- Enemies are intentionally not persisted or simulated while the page is closed.

## Lighting budget

Day/night uses the existing scene lights:

- one hemispheric light
- one directional sun
- one sky/fog color update per rendered frame
- no shadow maps, skybox textures, volumetric lighting, or post-processing pipeline

The update mutates existing colors, intensity, and direction. It allocates no new light or material per frame.

## Inventory, crafting, food, and furnace budgets

The inventory is a fixed 36-slot array: 27 storage slots and nine hotbar slots.

- Normal frames compare a monotonically increasing inventory revision.
- Hotbar DOM, inventory DOM, and inventory serialization update only after a real mutation.
- The overlay creates at most 36 slot buttons plus the visible recipe or furnace controls.
- Closing performs a bounded 36-slot cursor-return scan.
- Recipe availability scans at most 36 slots per ingredient.
- Food consumption checks only the selected hotbar stack.
- Death draining and durability-preserving restoration remain bounded by 36 slots.

Furnaces:

- Maximum persisted coordinate records: 128 per world.
- Each record stores six scalar state values plus its integer coordinate.
- Fixed-step processing is O(stored furnaces) and allocates no new objects during normal updates.
- Burn and smelt integration clamps a submitted update to 0.25 seconds.
- Input, fuel, and output counts are capped at 64.
- The open furnace panel refreshes at most about eight times per second rather than rebuilding every rendered frame.
- Furnace processing stops with the rest of world simulation while menus or pause are active.

## Drop, particle, and audio budgets

### Ground drops

- Maximum visible entities: 96.
- Maximum count follows the item definition: 64 for most blocks/materials, 16 for apples, and one for tools.
- Nearby items merge within 1.25 blocks only when item identity and durability are equal.
- Physics clamps frame time and subdivides vertical movement.
- Pickup attraction only runs within 2.5 blocks.
- Drop snapshots save at most 96 records every two seconds and on page exit.
- Each snapshot stores item identity, count, optional tool durability, position, and grounded state.
- Materials are created lazily per encountered item and shared by every drop of that item.

### Break particles

- Maximum particle meshes: 48.
- A normal break requests nine particles.
- Particles live for approximately 0.52 seconds and reuse meshes and shared frozen materials.
- Particles have no collision or persistence.

### Audio

Break, placement, pickup, crafting, eating, attack, kill, and hurt sounds use short Web Audio oscillator envelopes. There are no downloaded sound assets, decode queues, or long-lived source nodes. Audio creation is lazy after a user gesture and becomes a no-op when unsupported.

## Persistence and memory

- Generated terrain, caves, ore veins, trees, and deterministic leaf-drop decisions are never stored.
- IndexedDB stores only sparse voxel differences from deterministic generation.
- Inventory writes occur after inventory mutation.
- Ground drops, furnace states, health, day time, and respawn count are checkpointed together every two seconds and on exit.
- Ground-drop persistence retains damaged-tool durability and still migrates numeric block-only records.
- Furnace records are coordinate-scoped and return their contents before deletion when the voxel is broken.
- Invalid persisted inventory, survival, furnace, item, block, voxel, and drop values are clamped or ignored.
- Modifications matching generated terrain are deleted from the sparse delta layer.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Chunk generation and meshing do not normally run in the render callback.
- Shared block, player, held-item, enemy, drop, and particle materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory slot elements rebuild only while the inventory is open and its revision changes.
- Furnace UI refresh is throttled independently from rendering.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for deterministic terrain/caves/ores, surface protection, greedy meshing, collision, targeting, inventory/drop migration, durability-preserving death stacks, timed furnace fuel/progress/persistence/drain, food healing, survival persistence, external lethal damage, held food, night enemy pooling, cooldowns, melee selection, loot, fall damage, respawn, day time, and Worker cancellation/fallback.
3. A Vite production build including the terrain Worker and survival modules.
4. Playwright Chromium runs with software WebGL that restore damaged health, world time, death count, apples, coal, rough iron, iron ingots, an iron tool, and a furnace item; verify runtime survival/enemy/furnace diagnostics; craft and store output; preserve downward targeting/camera switching; and force Worker runtime failure without preventing startup.

## Next performance work

- Profile cave sampling, enemy meshes, and fixed-step AI on representative Android hardware.
- Add distance-tiered foliage or chunk LOD before increasing view radius.
- Record main-thread frame-time percentiles while rapidly crossing chunk boundaries at night.
- Measure local-storage write cost with 96 mixed drops and 128 furnace records.
- Add quality settings for particles, fog distance, render scale, view radius, lighting updates, and enemy count.
