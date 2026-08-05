# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: reduce view distance and visual effects before risking a crash.

## Voxel, texture, registry, and structure pipeline

Each visible 16×32×16 chunk remains one Babylon mesh:

1. Reconstruct deterministic surface terrain, protected underground shell, caves, ore veins, and oak structures from the world seed.
2. Overlay sparse player-authored modifications.
3. Read collision, targetability, render shape, face-merging, opacity, luminance, hardness, and tool requirements from the central block registry.
4. Build a bounded 0–15 sky-light and block-light field.
5. Sample same-chunk and neighboring voxels for hidden-face removal.
6. Greedily merge coplanar full-cube faces with the same block and normal. Leaves remain one tile per exposed voxel; torches use two crossed quads.
7. Build typed position, normal, UV, color, and index buffers grouped into texture material ranges.
8. Transfer Worker buffers without copying and upload at most two normally streamed chunks per frame.
9. Apply shared nearest-neighbor pixel materials through bounded Babylon submeshes; no per-block mesh or per-chunk texture is created.

Generated caves, ores, trees, and lighting create no cave objects, ore entities, per-tree physics bodies, or generated-world save records.

The block texture library contains 19 generated 16×16 RGBA textures, including separate cobblestone and alpha-tested torch textures. Grass, logs, workbenches, and furnaces select textures by face direction. Leaves and torches use alpha testing rather than blended transparency, avoiding sorting allocations. Textures and StandardMaterials are created once, shared, nearest-neighbor sampled, and frozen.

## Voxel-light budget

For one requested chunk, lighting is computed over the 16×32×16 owning volume plus a 15-block horizontal border. The working field is therefore 46×32×46, or 67,712 cells per channel.

- Sky light and block light each use one `Uint8Array`.
- Light levels are integers from 0 to 15.
- Vertical sky initialization is followed by bounded six-neighbor propagation.
- A source can influence at most 15 open voxels, so no unbounded world flood fill is required.
- Static sources come from block luminance in the registry: torch 14 and rune stone 10.
- Burning furnaces publish coordinate-scoped dynamic level-13 sources.
- Final mesh brightness uses `max(skyLight, blockLight)` and is baked into vertex color.
- Normal rendered frames do not traverse or update the light field.
- A furnace remesh occurs only when its burning state changes, not on every burn-progress tick.
- Adding/removing a source or changing opacity invalidates the affected 3×3 chunk neighborhood; owning block edits still rebuild their own chunk immediately.

This first implementation prioritizes deterministic behavior and Worker isolation. Android profiling is required before increasing chunk height, render radius, or fluid-light complexity.

## Streaming, editing, and Worker budgets

- View radius: two chunks, producing a 5×5 desired window.
- Worker pool: one or two Workers, bounded by logical processor count.
- Scheduling: stable nearest-first Manhattan priority.
- Newer builds replace older builds for the same chunk key.
- Moving the window removes queued obsolete jobs and terminates active obsolete jobs.
- Runtime Worker errors migrate active and queued work to deterministic synchronous generation instead of aborting startup.
- Revision checks reject results racing edits, light changes, or view changes.
- Cancellation is expected control flow and is excluded from error logs.
- A direct block edit immediately rebuilds only its owning chunk so visual disappearance, particles, drops, and final break audio share one frame.
- Neighbor and light-propagation chunks rebuild asynchronously.

## Collision, targeting, and survival budgets

- Player collision samples only integer voxels overlapped by the compact body.
- Collision solidity comes from the registry; non-solid torches do not obstruct the player.
- Typical overlap checks inspect roughly a 2×3×2 neighborhood.
- Movement substeps are at most 0.2 block.
- X and Z resolve independently for sliding.
- Vertical binary search runs only after blocked movement.
- Block targeting uses voxel DDA from the player eye and registry targetability, so a non-solid torch remains selectable.
- Mining cracks use one reusable overlay mesh and eight generated 16×16 alpha-test textures.
- Fall damage stores only the maximum downward speed per airborne interval and resolves on landing.
- Health, respawn, and the three-minute day clock advance in the existing fixed-step session.
- Death inventory transfer scans the fixed 36-slot array once and uses the bounded drop pool.

## Inventory and real crafting budgets

The inventory remains a fixed 36-slot array: 27 storage slots and nine hotbar slots.

- Personal crafting owns four mutable slots; workbench crafting owns nine.
- Shaped matching checks at most nine grid cells per candidate offset.
- Recipes can match at any valid offset; mirrored matching is enabled only where required.
- The recipe book scans the 36 inventory slots only when the player explicitly requests automatic placement.
- Recipe-book placement moves one recipe layer into an empty grid and does not create output.
- Taking output consumes one item from each matched grid cell.
- Closing returns grid and cursor stacks through bounded inventory scans and blocks close on overflow.
- Crafting UI rebuilds only while open after an inventory/grid mutation.
- Food consumption checks only the selected hotbar stack.
- Death draining and durability restoration remain bounded by 36 slots.

## Furnace budgets

- Maximum persisted coordinate records: 128 per world.
- Each record stores six scalar values plus coordinates.
- Fixed-step processing is O(stored furnaces) and allocates no gameplay objects.
- Burn/smelt integration clamps a submitted update to 0.25 seconds.
- Input, fuel, and output counts are capped at 64.
- The open furnace panel refreshes at most about eight times per second.
- Processing stops with world simulation while menus or pause are active.
- The burning-coordinate list is already produced during the bounded furnace scan.
- Light synchronization compares desired and applied coordinate sets; unchanged burning furnaces do not invalidate chunks.

## Night enemy and combat budget

Night stalkers use a fixed pool rather than repeated creation/disposal.

- Maximum active enemies: 10.
- Spawn check: once every four active gameplay seconds during night.
- Each stalker uses one root, a small fixed box set, and shared frozen materials.
- AI is O(active enemies) per fixed step.
- Pursuit uses one horizontal direction and one standing-height sample; there is no navigation mesh or A*.
- Player melee scans at most ten enemies with projection/distance checks.
- Enemies are not persisted or simulated while the page is closed.

## Drop, particle, and audio budgets

### Ground drops

- Maximum visible entities: 96.
- Stack maximum follows item definitions: 64 for most items, 16 for apples, and one for tools.
- Nearby drops merge only when identity and durability are equal.
- Physics clamps frame time and subdivides vertical movement.
- Pickup attraction only runs within 2.5 blocks.
- Snapshots store at most 96 records every two seconds and on exit.
- Old numeric block snapshots are runtime-validated before conversion to item identities.

### Break particles

- Maximum particle meshes: 48.
- A normal break requests nine particles.
- Particles live about 0.52 seconds and reuse meshes/materials.
- Cobblestone, ores, furnaces, and torches use the same bounded pool.
- Particles have no collision or persistence.

### Audio

Break, placement, pickup, crafting, eating, attack, kill, and hurt sounds use short Web Audio oscillator envelopes. Final break audio occurs after the owning chunk visibly removes the block. There are no downloaded audio assets or decode queues.

## Persistence and memory

- Generated terrain, caves, ore veins, trees, textures, and deterministic light are never stored.
- IndexedDB stores only sparse voxel differences from deterministic generation.
- Inventory writes occur after mutation.
- Drops, furnaces, health, day time, and respawn count checkpoint every two seconds and on exit.
- Dynamic furnace light is derived from restored burn state rather than stored separately.
- Existing block IDs 0–11 remain unchanged; cobblestone and torch append 12 and 13.
- Invalid inventory, survival, furnace, item, block, voxel, and drop values are clamped or ignored.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Normal chunk generation, lighting, and meshing do not run in the render callback.
- Only the owning chunk of a direct edit uses the bounded synchronous path.
- Shared block, player, held-item, enemy, drop, particle, and pixel materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory/crafting DOM rebuilds only while open and after state revision changes.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for the central block registry, stable IDs, classic stone-to-cobblestone harvesting, 2×2/3×3 offset and mirrored crafting, output consumption, safe grid return, sky/block propagation, torch attenuation, dynamic furnace-light transitions, deterministic terrain/caves/ores, textures/UV/material ranges, leaf tiles, collision, targeting, persistence migration, furnace timing, combat, food, fall damage, respawn, and Worker cancellation/fallback.
3. A Vite production build including the terrain/light Worker, UV transfer, pixel material library, manual crafting UI, and survival modules.
4. Playwright Chromium with software WebGL that restores survival inventory, verifies four personal recipes, confirms recipe-book placement does not create output, takes output from the real slot, preserves downward targeting/camera switching, and forces Worker runtime failure without preventing startup.

## Next performance work

- Profile the 46×32×46 light field and 3×3 light invalidation on representative Android hardware.
- Cache or incrementally update local light fields if profiling shows repeated full propagation is too expensive.
- Add quality controls before water/lava in batch 2: render radius, light updates, particles, fog, render scale, and enemy count.
- Add distance-tiered foliage or chunk LOD before increasing view radius.
- Record main-thread and Worker frame-time percentiles while mining across chunk boundaries near multiple lights.
