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

Desktop input prefers the browser Pointer Lock API. Capability is detected from the actual browser API rather than the device's coarse/fine pointer media query, because hybrid devices may report a coarse pointer even while a mouse is active.

If pointer lock is unavailable or rejected, holding and dragging on the canvas still rotates the view. A short fallback click mines or places once, while Q and E remain available for continuous actions.

## Minecraft-style camera rules

- First- and third-person modes use the same player yaw and pitch.
- The third-person camera pivots around the actual voxel-model eye position.
- The camera is centered directly behind the player's view direction at a four-block distance.
- Third-person camera motion is immediate rather than spring-smoothed, so mouse movement does not feel delayed.
- The camera looks at the eye pivot, keeping the player centered.
- Camera obstruction shortens the distance before a solid world mesh.
- Interaction still starts at the player's eye and follows the same yaw/pitch direction.
- Reach is limited to 4.5 blocks.

The eye height is derived from the visible voxel model rather than the old prototype capsule. This keeps the camera pivot, head pose, reticle, and interaction ray at the same physical height.

## Voxel movement and collision

The player now collides with actual solid voxels instead of only querying the highest block below each X/Z position.

- Horizontal movement resolves X and Z independently so the player slides along walls.
- Movement is divided into bounded substeps to prevent sprinting through thin walls during a large frame.
- A one-block obstacle can be stepped onto when the body and head clearance are free.
- Taller walls stop movement.
- Jumping stops against a low ceiling instead of passing through it.
- Falling lands on the first solid surface reached by the body.
- Spawn recovery searches upward for a collision-free position if saved terrain overlaps the player.

## Targeting and world editing

- First- and third-person modes share one interaction origin: the player's eye position.
- The ray follows the player's yaw and pitch, never the third-person camera position.
- The first solid voxel is selected and outlined.
- Placement uses the empty cell adjacent to the exact face that was hit.
- Placement is rejected if that cell overlaps the player.
- The bottom foundation layer cannot be broken.

Holding attack accumulates progress only while the same block remains targeted. Changing targets, looking away, releasing attack, or pausing resets progress. Grass and dirt break faster than stone, while rune stone is slower. Holding use places immediately and then repeats at a bounded cadence.

## Hotbar and inventory

The bottom-center hotbar contains nine slots.

- Slots 1–4 begin with grass, dirt, stone, and rune stone stacks.
- Slots 5–9 begin empty.
- Each stack is capped at 64 blocks.
- Breaking a block adds it to an existing matching stack before using an empty slot.
- A successful placement consumes one block from the selected stack.
- An exhausted slot becomes empty and the player cannot place from it.
- Clicking or tapping a hotbar slot selects it directly.
- Inventory contents and the selected slot are persisted separately for each world seed.
- Hotbar DOM and local storage are updated only when the inventory revision changes, not every rendered frame.

## Implemented mobile controls

Landscape and narrow-screen layouts show:

- Four directional movement buttons
- Hold-to-break and hold-to-place buttons
- Sprint
- Jump
- First/third-person camera switch
- Pause
- Dragging the world view to rotate the player view
- A horizontally scrollable nine-slot hotbar

Multi-touch is supported because movement buttons, hotbar slots, action buttons, and the camera drag zone use independent pointer IDs.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Generated terrain itself is never copied into the database.
- Inventory stacks and selection are stored as a small world-scoped local-storage snapshot.
- Invalid inventory data is clamped or converted to safe empty slots during restore.

## Input contexts

Pausing stops player simulation, mining progress, and world edits while UI rendering continues. Later crafting, dialogue, and full inventory screens will use the same command-layer boundary.

## Accessibility goals

Expose look sensitivity, invert-Y, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
