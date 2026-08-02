# Controls

## Implemented desktop controls

| Action | Default |
| --- | --- |
| Capture mouse / resume | Click the game canvas |
| Fallback look | Hold and drag when pointer lock is unavailable |
| Move | WASD |
| Look | Move the captured mouse |
| Jump | Space |
| Sprint | Left or right Shift |
| Switch camera | F5 or V |
| Release mouse and pause | Escape |
| Mine targeted block | Hold left mouse button or Q |
| Place selected block | Right mouse button or E |
| Select hotbar slot | 1–9 or mouse wheel |

Desktop input prefers the browser Pointer Lock API. If pointer lock is unavailable or rejected, holding and dragging on the canvas still rotates the view.

## Camera and targeting rules

- First- and third-person modes use the same authoritative player yaw and pitch.
- Interaction always starts at the actual player eye and follows the player view direction.
- First person uses the fixed center crosshair.
- Third person offsets the camera over the right shoulder while keeping its rotation parallel to player aim.
- Third person hides the misleading fixed center crosshair and projects the real eye-ray hit point onto the selected block face.
- The selected voxel keeps its world-space outline.
- Camera obstruction shortens the camera boom before a solid world mesh.
- Reach is limited to 4.5 blocks.

## Voxel movement and collision

- Horizontal movement resolves X and Z independently so the player slides along walls.
- Movement is divided into bounded substeps to prevent tunneling.
- Normal step height is limited to 0.6 blocks.
- A full one-block obstacle uses a real jump or auto-jump arc instead of snapping the player upward.
- Two-block walls and low ceilings stop auto-jump.
- Falling lands on the first solid surface reached by the body.
- Spawn recovery searches upward for a collision-free position.

## Mining, tools, and placement

The selected hotbar item controls both attack and use behavior.

- Selecting a block allows right-click placement and consumes one block only after placement succeeds.
- Selecting a tool disables placement because the held item is not a block.
- Empty hand and block items mine at the base speed.
- The wooden shovel is 3.4× faster on grass and dirt.
- The wooden pickaxe is 3× faster on stone and rune stone.
- A mismatched tool receives no speed bonus.
- A selected tool loses one durability only after a block is successfully broken.
- When durability reaches zero, the tool disappears from its slot.
- Mining progress resets when the target changes, attack is released, the player pauses, or the target leaves reach.
- Holding use places immediately and then repeats at a bounded cadence.

## Drops and pickup

Breaking a block no longer writes it directly into the inventory.

1. The world block is removed and its affected chunk is invalidated.
2. A small pooled block item appears at the broken position with a short upward impulse.
3. The item falls onto solid voxel surfaces, rotates, and bobs after landing.
4. Nearby same-block drops merge up to a stack of 64.
5. After a short pickup delay, drops within 2.5 blocks move toward the player.
6. Inventory overflow remains in the world instead of being deleted.

The scene keeps at most 96 visible drop entities. Their Babylon meshes are reused rather than recreated every frame.

## Hotbar and inventory

The bottom-center hotbar contains nine shared item slots.

- Slots 1–4 begin with grass, dirt, stone, and rune stone.
- Slot 5 begins with a wooden shovel.
- Slot 6 begins with a wooden pickaxe.
- Slots 7–9 begin empty.
- Block stacks are capped at 64.
- Tools occupy one slot and display a durability bar.
- Clicking or tapping a slot selects it directly.
- Inventory contents and selection are persisted per world seed.
- Legacy block-only saves are migrated and starter tools are inserted into available empty slots.
- Hotbar DOM and local storage update only when the inventory revision changes.

## Implemented mobile controls

Landscape and narrow-screen layouts show movement, mining, placement, sprint, jump, camera, pause, drag-to-look, and a horizontally scrollable nine-slot hotbar. Multi-touch uses independent pointer IDs for movement, camera, actions, and hotbar selection.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Generated terrain itself is never copied into the database.
- Inventory items, counts, durability, and selection are stored in a small world-scoped local-storage snapshot.
- Invalid inventory data is clamped or converted to safe empty slots.
- Ground drops are session entities and are not yet persisted.

## Input contexts

Pausing stops player simulation, mining progress, world edits, and drop physics while UI rendering continues. Crafting, dialogue, and full inventory screens will use the same command-layer boundary.

## Accessibility goals

Expose auto-jump, look sensitivity, invert-Y, shoulder side, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
