# Tasks

## Milestone 0

- [x] Initialize strict TypeScript, Vite, Babylon.js, Vitest, ESLint, CI, and Pages
- [x] Configure the Pages base path and validate deployment
- [x] Add architecture, design, lore, save, control, and performance documents

## Milestone 1

- [x] Implement fixed-step simulation and command-based input
- [x] Add kinematic movement, sprinting, jumping, gravity, and pause contexts
- [x] Add first- and third-person cameras with wall collision
- [x] Add desktop and touch controls
- [x] Build and animate an original voxel player model
- [x] Add visible held blocks and tools in both camera modes
- [x] Support effectively vertical look and downward mining

## Milestone 2

- [x] Add deterministic seeded terrain and chunk structures
- [x] Stream a 5×5 chunk window
- [x] Implement cross-chunk culling and six-axis greedy meshing
- [x] Move generation and meshing into a bounded Worker pool
- [x] Add nearest-first jobs, stable keys, revision rejection, active cancellation, and runtime fallback
- [x] Add full voxel body collision, wall sliding, ceilings, step candidates, and depenetration
- [x] Add deterministic eye-origin voxel targeting
- [x] Add held mining, bounded placement, projected third-person targeting, and placement safety
- [x] Persist sparse world edits with IndexedDB
- [x] Add Chromium production runtime tests

## Milestone 3

- [x] Add a nine-slot finite hotbar
- [x] Add pooled visible drops with gravity, merging, attraction, and overflow safety
- [x] Add wooden shovel and pickaxe speed, durability, and save migration
- [x] Add improved player proportions, sky lighting, and fog
- [x] Add generated 16×16 nearest-neighbor block textures with face-specific materials
- [x] Keep leaves as individually tiled alpha-cutout voxel faces instead of merged slabs
- [x] Add eight-stage mining cracks and immediate owning-chunk visual updates
- [x] Add pooled break particles and synthesized interaction audio
- [x] Persist bounded ground-drop snapshots

## Milestone 4 — survival progression

- [x] Expand inventory to 27 storage slots plus nine hotbar slots
- [x] Add whole-stack, half-stack, single-item, merge, and swap interactions
- [x] Migrate legacy nine-slot saves into the expanded hotbar
- [x] Generate deterministic oak trees with real log and leaf voxels
- [x] Add oak logs, leaves, planks, sticks, and crafting tables
- [x] Add placed crafting-table interaction and tool recipes
- [x] Add wooden axes and full stone and iron tool tiers
- [x] Add tier- and material-aware mining speeds and durability
- [x] Add deterministic underground caves with a protected surface shell
- [x] Add coal and iron ore depth bands with tool-tier harvest rules
- [x] Generalize pooled drops and save migration to blocks, materials, food, and durability-preserving tools
- [x] Add coordinate-scoped furnaces with fuel, timed smelting, output storage, persistence, and break recovery
- [x] Add fixed-step health, fall damage, void death, automatic respawn, and full inventory death drops
- [x] Add deterministic apples, consumption, and healing
- [x] Add a fixed-step day/night cycle with dynamic sky, fog, and sunlight
- [x] Add pooled night enemies, pursuit, attack cooldowns, melee combat, and loot

## Classic survival rebuild — three compressed batches

### Batch 1 — core rules, crafting, and voxel light

- [x] Centralize block collision, targeting, render shape, hardness, resistance, tool requirement, opacity, and luminance in one registry
- [x] Preserve existing numeric block identifiers and append save-compatible cobblestone and torch blocks
- [x] Make mined stone drop cobblestone and use cobblestone in stone-tool and furnace recipes
- [x] Replace instant recipe-button crafting with real interactive 2×2 and 3×3 grids
- [x] Match shaped recipes at any valid offset and support mirrored axe recipes
- [x] Require players to take items from a real output slot; keep the recipe book only as an optional placement helper
- [x] Return crafting-grid and cursor stacks safely when closing, blocking close instead of deleting overflow
- [x] Add classic coal-over-stick torch crafting
- [x] Add bounded 0–15 sky light and block light with opacity-aware six-neighbor propagation
- [x] Bake voxel light into chunk vertex colors in the terrain Worker
- [x] Add targetable, non-solid, alpha-tested cross-quad torches with level-14 emission
- [x] Add rune-stone emission and transition-driven level-13 burning-furnace light
- [x] Rebuild affected neighboring chunks when light sources or opacity change
- [x] Preserve legacy inventory, voxel, drop, furnace, and survival snapshots

### Batch 2 — world generation and complete survival movement

- [ ] Add a deterministic biome climate map and classic grassland, forest, desert, and snowy surface rules
- [ ] Add sea level, bounded water and lava blocks, fluid surfaces, and fluid-aware light opacity
- [ ] Add beaches, clay/sand/gravel deposits, flowers, tall grass, and biome-specific tree density
- [ ] Add classic-style cave carving, ore passes, springs, dungeons, and cross-chunk structures under one population pipeline
- [ ] Add swimming, buoyancy, water drag, drowning, lava damage, extinguishing, and air supply
- [ ] Add sneaking with ledge prevention, ladders, suffocation, knockback, and hurt invulnerability frames
- [ ] Add leaf decay, saplings, deterministic tree regrowth, and scheduled/random block ticks
- [ ] Add quality controls and representative Android performance profiles for fluids and voxel lighting

### Batch 3 — unified entities and persistent worlds

- [ ] Replace separate enemy/drop/projectile lifecycles with one bounded entity registry and spatial query layer
- [ ] Add zombie, skeleton, spider, and creeper behavior plus passive animals
- [ ] Add arrows, bows, TNT, explosions, entity collision, knockback, drops, and damage attribution
- [ ] Add classic hostile/passive spawn caps, light-level rules, despawn rules, and daytime burning
- [ ] Add world selection, seed entry, metadata, rename/delete, and multiple isolated save slots
- [ ] Persist player position/state, furnaces, scheduled ticks, and persistent entities with version migration
- [ ] Add hunger, armor, ranged combat, and death/respawn options
- [ ] Add full drag distribution, double-click collection, and shift-click inventory shortcuts
- [ ] Add distance-tiered chunk rendering or LOD and final desktop/Android performance captures
