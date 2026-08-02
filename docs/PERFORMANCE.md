# Performance

## Targets

- Typical desktop: aim for 60 FPS.
- Typical phone in landscape: stable 30 FPS.
- Low-end devices: degrade quality and view distance rather than crash.

## Voxel rules

Never create one mesh per persistent block in production. Chunks build merged visible surfaces, skip hidden faces, use a texture atlas, and rebuild only affected chunks. Generation and meshing move to workers once the data contracts are stable.

## Frame budgets

Chunk creation/destruction is capped per frame. Simulation uses a fixed step with bounded catch-up. Expensive AI and world queries are distributed over ticks where gameplay allows.

## Allocation rules

Hot loops reuse vectors, rays, result objects, buffers, and collections. Touch-move handlers do not allocate on every event. Entities, projectiles, drops, and particles use pools where profiling proves value.

## Quality levels

Low, medium, high, and auto adjust render scale, view distance, shadows, particles, vegetation, post-processing, and dynamic lights. Auto starts conservatively using device signals and may later use measured frame time.

## Measurement

Maintain counters for FPS, simulation time, render time, active chunks, triangles, draw calls, worker queue depth, and memory estimates. Record representative desktop and mobile profiles before increasing content scale.
