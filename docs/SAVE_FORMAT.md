# Save Format

## Storage strategy

Large saves use IndexedDB. `localStorage` is reserved for lightweight preferences such as volume, sensitivity, quality level, touch controls, and most-recent slot.

## Boundary

Game logic depends on a `SaveRepository` interface. The first implementation will be `IndexedDbSaveRepository`. Babylon.js objects are never serialized.

## Required metadata

```ts
interface SaveMetadata {
  schemaVersion: number;
  gameVersion: string;
  createdAt: string;
  updatedAt: string;
}
```

## Planned payload

The save contains world seed, player transform and attributes, inventory, hotbar, equipment, recipes, changed blocks, necessary persistent entities, boss state, checkpoints, quests, story flags, read slabs, death-recovery point, settings, current camera mode, and elapsed play time.

## World persistence

Base terrain is regenerated from the seed. Saves store block edits as compact chunk-local records instead of storing the untouched world. A future compaction step may merge repeated edits.

## Validation

Imported files must be parsed as untrusted data, checked against size limits and a schema, and migrated before use. Invalid or unsupported saves produce a user-facing error without overwriting an existing slot.

## Migration

Every schema version has a sequential migration function. Even schema version 1 passes through the migration dispatcher so later versions do not require replacing the save system.
