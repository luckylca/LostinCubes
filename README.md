# Lost in Cubes

**Lost in Cubes** is an original browser-based 3D voxel action RPG. The project combines a destructible block world, stamina-driven action combat, exploration, crafting, building, and an original mythic world built around fractured world-tree realms.

> Current status: Milestone 0 foundation. The repository contains a runnable Babylon.js prototype scene, strict TypeScript tooling, tests, CI, GitHub Pages deployment, and the initial design/architecture documents.

## Technology

- TypeScript + Vite
- Babylon.js
- Vitest
- ESLint + Prettier
- IndexedDB planned through a repository boundary
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

The current scene renders a small voxel island and central rune monolith. Drag to orbit the camera and use the mouse wheel to zoom. It is an engine-validation scene, not yet the complete gameplay vertical slice.

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
