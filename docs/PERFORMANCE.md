# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: reduce view distance and visual effects before risking a crash.

## Voxel, texture, and structure pipeline

Each visible 16×32×16 chunk remains one Babylon mesh:

1. Reconstruct deterministic surface terrain, protected underground shell, caves, ore veins, and oak structures from the world seed.
2. Overlay sparse player-authored modifications.
3. Sample same-chunk and neighboring voxels for hidden-face removal.
4. Greedily merge coplanar opaque faces with the same block type and normal. Leaf faces intentionally remain one tile per exposed voxel so foliage reads as separate cubes.
5. Build typed position, normal, UV, color, and index buffers, grouped into texture material ranges.
6. Transfer Worker buffers without copying and upload at most two normally streamed chunk meshes per frame.
7. Apply shared nearest-neighbor pixel materials through bounded Babylon submeshes; no per-block mesh or per-chunk texture is created.

Caves and ores come directly from deterministic 3D value noise. Trees and leaves remain ordinary voxels. These features create no cave objects, ore entities, per-tree meshes, physics bodies, or generated-world save records.

The block texture library contains 17 generated 16×16 RGBA textures. Grass, logs, workbenches, and furnaces select different textures by face direction. Leaves use alpha testing rather than blended transparency, avoiding depth-sorting allocations. Textures and StandardMaterials are created once, shared by all chunks, use nearest-neighbor sampling, and are frozen after setup.

## Streaming, editing, and Worker budgets

- View radius: two chunks, producing a 5×5 desired window.
- Worker pool: one or two Workers, bounded by logical processor count.
- Scheduling: stable nearest-first Manhattan priority.
- Newer builds replace older builds for the same chunk key.
- Moving the desired window removes queued obsolete jobs and terminates active obsolete jobs.
- Runtime Worker errors migrate active and queued work to deterministic synchronous generation instead of aborting startup.
- Revision checks reject any result that races an edit or view change.
- Cancellation is expected control flow and is excluded from error logs.
- A block edit immediately rebuilds only its owning 16×32×16 chunk on the interaction call so disappearance, particles, drops, and final break audio share one visible frame.
- Boundary-neighbor chunks still rebuild asynchronously because they only need to expose or hide a seam face.
- This synchronous edit path is intentionally bounded to one chunk and replaces an older visible delay where the stale chunk stayed on screen until a Worker upload completed.

## Collision, targeting, and survival budgets

- Player collision samples only integer voxels overlapped by the compact body.
- Typical overlap checks inspect roughly a 2×3×2 neighborhood.
- Movement substeps are at most 0.2 block.
- X and Z resolve independently for sliding.
- Vertical binary search runs only after blocked movement.
- Trees, ores, furnaces, caves, and player structures use the same voxel collision query.
- Block interaction uses voxel DDA from the player eye rather than triangle picking.
- Mining cracks use one reusable overlay mesh and eight generated 16×16 alpha-test textures.
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

## Inventory, shaped crafting, food, and furnace budgets

The inventory is a fixed 36-slot array: 27 storage slots and nine hotbar slots.

- Normal frames compare a monotonically increasing inventory revision.
- Hotbar DOM, inventory DOM, and inventory serialization update only after a real mutation.
- The overlay creates at most 36 slot buttons plus the visible recipe or furnace controls.
- Recipe patterns are static 2×2 or 3×3 arrays and render at most nine small cells per recipe card.
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

Break, placement, pickup, crafting, eating, attack, kill, and hurt sounds use short Web Audio oscillator envelopes. The final break sound occurs after the owning chunk has visibly removed the block. There are no downloaded sound assets, decode queues, or long-lived source nodes. Audio creation is lazy after a user gesture and becomes a no-op when unsupported.

## Persistence and memory

- Generated terrain, caves, ore veins, trees, textures, and deterministic leaf-drop decisions are never stored.
- IndexedDB stores only sparse voxel differences from deterministic generation.
- Inventory writes occur after inventory mutation.
- Ground drops, furnace states, health, day time, and respawn count are checkpointed together every two seconds and on exit.
- Ground-drop persistence retains damaged-tool durability and still migrates numeric block-only records.
- Furnace records are coordinate-scoped and return their contents before deletion when the voxel is broken.
- Invalid persisted inventory, survival, furnace, item, block, voxel, and drop values are clamped or ignored.
- Modifications matching generated terrain are deleted from the sparse delta layer.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Normal chunk generation and meshing do not run in the render callback; only the owning chunk of a direct player edit uses the bounded synchronous path.
- Shared block, player, held-item, enemy, drop, particle, and pixel-texture materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory slot elements rebuild only while the inventory is open and its revision changes.
- Furnace UI refresh is throttled independently from rendering.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for deterministic terrain/caves/ores, alpha-cutout texture generation, face-specific texture selection, repeated UVs, texture material ranges, individual leaf tiles, greedy opaque meshing, collision, targeting, shaped 2×2/3×3 recipes, inventory/drop migration, durability-preserving death stacks, timed furnace fuel/progress/persistence/drain, food healing, survival persistence, external lethal damage, held food, night enemy pooling, cooldowns, melee selection, loot, fall damage, respawn, day time, and Worker cancellation/fallback.
3. A Vite production build including the terrain Worker, UV transfer, texture material library, and survival modules.
4. Playwright Chromium runs with software WebGL that verify the visible workbench/furnace guide, shaped personal recipes, generated material startup, restored survival inventory, downward targeting/camera switching, and forced Worker runtime failure without preventing startup.

## Next performance work

- Profile the bounded synchronous edit rebuild and transparent foliage on representative Android hardware.
- Add distance-tiered foliage or chunk LOD before increasing view radius.
- Record main-thread frame-time percentiles while rapidly mining and crossing chunk boundaries at night.
- Measure local-storage write cost with 96 mixed drops and 128 furnace records.
- Add quality settings for particles, fog distance, render scale, view radius, lighting updates, and enemy count.
