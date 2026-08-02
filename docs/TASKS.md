# Tasks

## Milestone 0

- [x] Inspect repository state, default branch, issues, pull requests, and actions baseline
- [x] Create initial `main` commit and `feat/mvp-vertical-slice` branch
- [x] Initialize TypeScript, Vite, and Babylon.js project files
- [x] Enable strict TypeScript settings
- [x] Configure ESLint and Prettier
- [x] Add Vitest foundation tests
- [x] Configure `base: '/LostinCubes/'`
- [x] Add CI workflow
- [x] Add GitHub Pages workflow
- [x] Add minimal Babylon.js voxel-fragment scene
- [x] Add architecture, design, lore, story, save, controls, and performance documents
- [x] Confirm CI passes on GitHub-hosted runner
- [x] Merge milestone 0 pull request into `main`
- [x] Confirm deployed Pages URL after merge

## Milestone 1

- [x] Implement fixed-step simulation clock
- [x] Implement command-based input manager
- [x] Add kinematic player movement and collision
- [x] Add gravity, ground detection, jump, and sprint
- [x] Add first-person camera
- [x] Add third-person camera and wall collision
- [x] Add smooth camera switching without replacing player state
- [x] Add desktop bindings and basic touch controls
- [x] Add pause/settings input context
- [x] Add movement and camera tests
- [x] Replace prototype capsule with an original multi-part voxel character
- [x] Add idle, walk, sprint, jump, and fall presentation poses
- [x] Hide the third-person body cleanly in first-person view
- [x] Confirm TypeScript, ESLint, Vitest, and production build pass in CI

## Milestone 2

- [x] Introduce seeded chunk data structures
- [x] Generate terrain data from a deterministic world seed
- [x] Render generated chunks in the playable scene
- [x] Stream a 5×5 chunk window around the player
- [x] Implement cross-chunk hidden-face culling
- [x] Implement greedy meshing with typed output buffers
- [x] Move generation and meshing work into a bounded Web Worker pool
- [x] Limit main-thread mesh uploads per frame
- [x] Reject stale worker results after edits or chunk movement
- [x] Connect player grounding and step limits to voxel terrain
- [ ] Add full body collision against voxel walls and ceilings
- [x] Add deterministic voxel targeting
- [x] Make first- and third-person interaction originate from the player eye
- [x] Align the centered third-person camera with the player view ray
- [x] Add pointer-lock mouse look with Escape pause/resume behavior
- [x] Add held mining progress with target-change reset
- [x] Add bounded held-placement repetition
- [x] Add block breaking and placement on desktop and touch controls
- [x] Prevent placement inside the player body
- [x] Persist sparse block modifications with IndexedDB
- [x] Restore persisted edits before the first chunk is shown
- [x] Add chunk queue, greedy quad, mining progress, and FPS diagnostics to the HUD
- [x] Add meshing, worker task, persistence, raycast, view, and interaction timing tests

## Milestone 3

- [ ] Add complete voxel body collision and safe depenetration
- [ ] Add an inventory and hotbar instead of direct block selection
- [ ] Add tools, block-specific drops, and collection
- [ ] Add world save metadata and multiple save slots
- [ ] Add biome and structure generation
- [ ] Add LOD or distance-tiered chunk rendering
- [ ] Add worker-side cancellation or priority replacement
- [ ] Add automated browser runtime smoke tests
