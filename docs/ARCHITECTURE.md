# Architecture

## Goals

The architecture must keep simulation state independent from Babylon.js render objects, remain deterministic where practical, support serialization, and preserve a clean boundary for a future authoritative network session without implementing networking in the first release.

## Application layers

1. **App/bootstrap** owns startup, shutdown, page lifecycle, and top-level dependency wiring.
2. **Engine** owns Babylon.js, the render loop, quality settings, assets, and scene disposal.
3. **Game session** owns commands and simulation state. `LocalGameSession` is the first implementation of `GameSession`.
4. **Simulation** advances at a fixed rate and never derives combat damage or cooldowns from display refresh rate.
5. **World** stores blocks, chunks, generation inputs, edits, and meshing data without using meshes as source-of-truth state.
6. **UI** observes public state and emits commands/events rather than mutating internal game systems directly.
7. **Save** serializes stable data contracts through `SaveRepository`; IndexedDB details stay behind `IndexedDbSaveRepository`.

## Render and simulation loops

The render loop may run at the browser refresh rate. The future simulation loop will accumulate elapsed time and advance at `60 Hz` with a bounded catch-up count. Rendering interpolates or reads the latest snapshot. Paused menus stop simulation commands while allowing the UI to remain responsive.

## Input command path

Keyboard, mouse, touch, and future gamepad adapters normalize raw input into actions. Actions become typed `GameCommand` values and are submitted to the active `GameSession`. Key bindings remain centralized.

## World chunks

The planned chunk baseline is `16 × 16` blocks with a world height of `64` or `96`. Chunk block data is separate from generated mesh buffers. Worker messages contain transferable arrays and deterministic generation parameters. Only modified blocks plus the seed are persisted.

## Entities

Entities use stable string IDs. Their serializable game components are separate from Babylon nodes. Render adapters create/update/dispose meshes based on entity snapshots.

## Combat state machine

Player and enemy combat use explicit states such as idle, move, attack windup, active frames, recovery, dodge, block, hit stun, and dead. Timing uses simulation ticks or seconds in the simulation clock, not rendered frame count.

## Save boundary

Game systems produce a versioned `GameSave` value. They never call IndexedDB directly. Migrations transform old schema versions before hydration. Babylon meshes, materials, animation observers, and transient caches are never saved.

## UI communication

The UI subscribes to view models/events and sends semantic actions. Opening a blocking menu changes input context so gameplay input is released cleanly, especially on touch devices.

## Future multiplayer boundary

A future `NetworkGameSession` may submit the same command types and expose authoritative snapshots. The first release will not include sockets, prediction, rollback, lobbies, accounts, or fake network abstractions.

## Resource lifecycle

Every listener and observer must have a removal path. Scene shutdown disposes scenes, meshes, materials, textures, workers, and loops. Page navigation must never leave multiple render loops active.
