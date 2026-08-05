# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: reduce view distance and visual effects before risking a crash.

## Chunk construction and streaming

Each visible 16×32×16 chunk remains one Babylon mesh.

1. Materialize the complete 46×32×46 bounded build volume once into a compact byte cache.
2. Reuse that cache for sky light, block light, propagation, hidden-face removal, and meshing.
3. Overlay sparse player-authored modifications without storing generated terrain.
4. Greedily merge compatible full-cube faces.
5. Emit separate bounded material ranges for pixel textures, alpha-tested blocks, and blended fluids.
6. Transfer typed position, normal, UV, color, and index buffers from the Worker.
7. Upload at most one completed chunk mesh per render frame.

The desired window remains 5×5 chunks. One or two Workers are selected from logical processor count. Jobs are keyed, nearest-first, biased toward recent movement direction, cancellable, revision-checked, and replace older requests for the same chunk.

The twelve most recently unloaded chunk meshes remain disabled in a bounded LRU cache. Returning to them re-enables the existing GPU mesh when its revision is still current. Worker runtime failure falls back to one synchronous chunk build per macrotask so input and rendering can run between builds.

## Biome and terrain generation

The generator derives biome climate, surface height, caves, ores, vegetation, oceans, seabeds, and deep lava directly from the seed. It creates no biome objects, tree entities, cave entities, water objects, or generated-world save records.

- Four deterministic biomes share one sampling pipeline.
- Spawn overrides are coordinate tests, not a stored structure.
- Sea level is a scalar constant.
- Water fills low generated columns while the bounded voxel cache is materialized.
- Deep lava is sampled only inside eligible carved cave cells.
- Trees and plants are coordinate-derived and remain cross-chunk deterministic.
- Existing sparse edits are overlaid after generation.

The terrain cache regression proves all 67,712 cells in one build volume are generated once; lighting and meshing reread bytes rather than recomputing climate, caves, ores, and trees.

## Voxel light budget

For one requested chunk, lighting covers the 16×32×16 owning volume plus a 15-block horizontal border: 46×32×46, or 67,712 cells per channel.

- Sky light and block light each use one `Uint8Array`.
- Levels are integers from 0 to 15.
- Propagation uses reusable `Int32Array` queues.
- Directly lit sky cells enter propagation only when they can improve a neighbor.
- Opaque blocks stop light; leaves reduce it; water reduces it by two levels.
- Torch light starts at 14, furnace light at 13, rune stone at 10, and lava at 15.
- Final visible brightness uses `max(skyLight, blockLight)` baked into vertex color.
- Normal render frames never traverse the light field.
- Furnace progress does not remesh; only burning on/off transitions update light.

Opacity or source changes invalidate the affected neighboring chunks. Direct edits still perform one lightweight owning-chunk visual rebuild first, followed by accurate Worker lighting.

## Shared fluid geometry

Water and lava do not create per-voxel meshes, materials, physics bodies, timers, or simulation objects.

- Fluid voxels are emitted into the same chunk mesh as terrain.
- Adjacent voxels of the same fluid omit their shared face.
- Faces completely covered by a solid cube are omitted.
- Exposed fluid tops are lowered below the block boundary.
- Water and lava use shared nearest-neighbor 16×16 textures.
- The two fluid materials are created once, use alpha blending and depth prepass, and are shared by all chunks.
- Water and lava state is sampled by the existing kinematic player body rather than a second physics engine.

Static generated fluids add geometry proportional to exposed surfaces, not fluid volume. Flowing source levels and scheduled propagation are intentionally absent because they require a separate bounded update design.

## Random block tick budget

World ecology uses no global scan and no per-block timers.

- One batch runs every 0.25 active gameplay seconds.
- Four nearby candidate coordinates are sampled per batch.
- Catch-up is capped at two batches per session step.
- At most eight candidate blocks are processed in one update regardless of world size.
- Leaf support, leaf decay, sapling growth, plant support, ladder support, covered grass, and grass spread share this budget.
- A tree growth operation can change many blocks, but renderer invalidation is deduplicated by touched chunk.
- Random ticks stop with menus and pause because they advance through the fixed-step session.

This keeps cost bounded as the world accumulates leaves, saplings, plants, and ladders.

## Collision and environmental survival budget

The player continues to use one compact kinematic voxel body.

- Typical collision overlap is approximately a 2×3×2 voxel neighborhood.
- Movement substeps are at most 0.2 block.
- X and Z resolve independently.
- Vertical binary search runs only after a collision.
- Sneak ledge safety adds one support probe before accepting a horizontal substep.
- Water, lava, and ladder checks sample two body heights.
- Head submersion and suffocation each sample one head voxel.
- Oxygen is one scalar; no bubbles or breath entities are simulated.
- Fluid drag, climbing, gravity, and jumping remain branches in the existing motor state machine.
- Fall damage stores only maximum downward speed during one airborne interval.
- Falls, enemies, drowning, lava, and suffocation share one hurt-cooldown scalar.

The compact environment HUD updates text only when its rendered string changes. Body CSS classes change only when the environment category changes.

## Texture and material budget

The procedural texture library contains 29 generated 16×16 RGBA textures.

- Grass, logs, workbenches, and furnaces select textures by face direction.
- Leaves, torches, ladders, saplings, grass, and flowers use alpha testing.
- Water and lava use alpha blending and depth prepass.
- All textures and StandardMaterials are created once, nearest-neighbor sampled, shared, and frozen.
- Chunks use bounded Babylon submeshes rather than one material or mesh per block.
- Leaves remain one tile per visible voxel to preserve individual leaf-block silhouettes.

## Inventory, crafting, furnaces, and entities

- Inventory is a fixed 36-slot array: 27 storage plus nine hotbar.
- Personal crafting owns four slots; workbench crafting owns nine.
- Shaped matching checks at most nine cells per candidate offset.
- Recipe-book placement scans the fixed inventory only after explicit input.
- Output holding and Shift-crafting stop on material exhaustion or stack capacity.
- Furnace records are capped at 128 per world and processed without gameplay object allocation.
- Ground drops use a 96-entity pool.
- Break particles use a 48-mesh pool.
- Night enemies use a ten-entity pool and no navigation mesh.

## Persistence and compatibility

Generated climate, terrain, caves, water, lava, vegetation, textures, and deterministic light are never stored. IndexedDB stores only sparse differences from generation.

- Existing numeric block IDs 0–13 remain unchanged.
- Environmental IDs append 14–23.
- Inventory, drops, furnaces, health, time, and death count use bounded world-scoped snapshots.
- Oxygen is restored to full on reload rather than persisted.
- Invalid records are clamped or ignored.

The terrain algorithm now produces different generated blocks for an existing seed. Old sparse edits remain readable but may appear floating or embedded relative to the new regenerated terrain. A future multi-world migration layer should version generator rules per world.

## Frame and allocation rules

- Simulation uses a fixed step with bounded catch-up.
- Normal terrain generation, lighting, liquid geometry, and meshing run outside the render callback.
- Only one completed chunk mesh uploads per frame.
- Direct block edits use a lightweight immediate owning-chunk path.
- Random-tick edits are grouped by touched chunk.
- Shared block, player, item, enemy, drop, particle, and fluid materials are frozen.
- Chunk world matrices are frozen after placement.
- Held-item geometry rebuilds only when selection changes.
- Inventory/crafting DOM rebuilds only while open and after state revisions.
- Input uses held-state sets rather than per-event command queues.

## Runtime validation

CI performs:

1. Strict TypeScript and ESLint.
2. Vitest coverage for stable IDs, registry rules, all four biomes, sea-level fill, protected cave shells, coal and iron bands, deep lava, fluid face culling, lowered water surfaces, alpha environmental meshes, voxel light, collision, swimming, ladder movement, oxygen, drowning, lava damage, hurt invulnerability, bounded random ticks, sapling drops, ladder recipes, persistence, crafting, furnaces, enemies, and Worker fallback.
3. A production Vite build including the optimized terrain/light/fluid Worker and all survival presentation modules.
4. Playwright Chromium with software WebGL that restores existing survival data, exercises real crafting, camera and targeting, forces Worker runtime failure, validates biome/oxygen diagnostics, holds Ctrl to enter sneak state, opens the survival tutorial page, and checks for page/console errors.

## Remaining performance work

- Measure frame-time percentiles on representative Android devices while crossing ocean/land boundaries and viewing large transparent surfaces.
- Add render-scale, render-radius, particles, fluid, fog, and enemy quality presets.
- Add transparent-surface ordering diagnostics if overlapping water and lava expose artifacts on mobile GPUs.
- Version terrain generation per world before multi-world slots ship.
- Design bounded scheduled fluid flow before adding springs, buckets, and source levels.
- Add distance-tiered foliage or chunk LOD before increasing the render radius.
