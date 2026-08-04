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
- [x] Add block-face palettes, improved player proportions, sky lighting, and fog
- [x] Add pooled break particles and synthesized interaction audio
- [x] Persist bounded ground-drop snapshots

## Milestone 4 — survival progression

- [x] Expand inventory to 27 storage slots plus nine hotbar slots
- [x] Add whole-stack, half-stack, single-item, merge, and swap interactions
- [x] Migrate legacy nine-slot saves into the expanded hotbar
- [x] Generate deterministic oak trees with real log and leaf voxels
- [x] Add oak logs, leaves, planks, sticks, and crafting tables
- [x] Add personal recipe-book crafting for planks, sticks, and crafting tables
- [x] Add placed crafting-table interaction and tool recipes
- [x] Add wooden axes and full stone tool tier
- [x] Add tier- and material-aware mining speeds and durability
- [x] Add deterministic underground caves with a protected surface shell
- [x] Add coal and iron ore depth bands with tool-tier harvest rules
- [x] Generalize pooled drops and save migration to blocks, materials, food, and durability-preserving tools
- [x] Add coordinate-scoped furnaces with fuel, timed smelting, output storage, persistence, and break recovery
- [x] Add full iron tools
- [x] Add fixed-step health, fall damage, void death, and automatic respawn
- [x] Persist health, world time, and respawn count per world
- [x] Drop the complete inventory at the recorded death position without repairing tools
- [x] Add deterministic apples, held-food presentation, consumption, and healing
- [x] Add a fixed-step day/night cycle with dynamic sky, fog, and sunlight
- [x] Add pooled night enemies, terrain pursuit, attack cooldowns, melee combat, and loot
- [ ] Add save metadata and multiple world slots
- [ ] Add additional biomes and structures
- [ ] Add leaf decay, saplings, and tree regrowth
- [ ] Add full drag distribution and shift-click inventory shortcuts
- [ ] Add distance-tiered chunk rendering or LOD
- [ ] Capture representative desktop and Android performance profiles
- [ ] Add hunger, armor, ranged combat, and additional enemy types
