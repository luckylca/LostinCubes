# Lost in Cubes

**Lost in Cubes** is an original browser-based 3D voxel action RPG. The project combines a destructible block world, action combat, exploration, crafting, building, and an original mythic world built around fractured world-tree realms.

> Current status: playable Milestone 2 prototype. It includes an animated voxel character, fixed-step movement, first/third-person cameras, deterministic terrain, worker-driven chunk streaming, greedy meshing, block editing, sparse IndexedDB persistence, tests, CI, and GitHub Pages deployment.

## Technology

- TypeScript + Vite
- Babylon.js
- Web Workers with transferable typed mesh buffers
- IndexedDB through `idb`
- Vitest
- ESLint + Prettier
- GitHub Actions + GitHub Pages

## Run locally

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## GitHub Pages

The Vite base path is configured for:

```text
https://luckylca.github.io/LostinCubes/
```

The deployment workflow publishes `dist/` after changes reach `main`.

## Current prototype

- Explore a deterministic voxel world generated from a stable seed.
- Stream a 5×5 chunk window around the player.
- Build greedy chunk meshes in a bounded worker pool.
- Switch between first- and third-person cameras.
- Walk, sprint, jump, climb one-block steps, and fall from drops.
- Target, break, and place blocks.
- Restore sparse world edits from IndexedDB on startup.
- Watch chunk queue, greedy quad, and FPS diagnostics in the HUD.

Desktop controls include WASD, drag to look, Shift to sprint, Space to jump, V to switch camera, Q/left click to break, E/right click to place, and 1–4 to select a block type. Touch layouts expose the same core movement and block interaction actions.

## Documentation

- [Game design](docs/GAME_DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Task tracker](docs/TASKS.md)
- [Lore](docs/LORE.md)
- [Chapter 1](docs/STORY_CHAPTER_01.md)
- [Save format](docs/SAVE_FORMAT.md)
- [Controls](docs/CONTROLS.md)
- [Performance](docs/PERFORMANCE.md)

## Licensing

No project-wide open-source license has been selected yet. Third-party dependencies and future assets are tracked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
