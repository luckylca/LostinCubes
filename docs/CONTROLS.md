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

## Minecraft-style camera and targeting rules

- First- and third-person modes use the same authoritative player yaw and pitch.
- Interaction always starts at the actual player eye and follows the player view direction.
- First person uses the fixed center crosshair.
- Third person offsets the camera over the right shoulder while keeping its rotation parallel to the player view.
- The player model is therefore outside the camera's center line instead of covering the target.
- Third person hides the misleading fixed center crosshair.
- The real eye-ray hit point is projected into screen space and displayed as a moving target reticle on the selected block face.
- The selected voxel also keeps its world-space outline.
- Camera obstruction shortens the camera boom before a solid world mesh.
- Reach is limited to 4.5 blocks.

The eye height is derived from the visible voxel model rather than the old prototype capsule. Camera rotation, head pose, interaction origin, block outline, and projected target marker therefore share one physical reference.

## Voxel movement and collision

The player collides with actual solid voxels instead of only querying the highest block below each X/Z position.

- Horizontal movement resolves X and Z independently so the player slides along walls.
- Movement is divided into bounded substeps to prevent sprinting through thin walls during a large frame.
- Normal step height is limited to 0.6 blocks, matching the scale of Minecraft's player step behavior.
- A full one-block obstacle is never crossed by teleporting the body upward.
- With auto-jump enabled, a clear one-block obstacle starts a real jump arc and preserves normal collision throughout the ascent.
- Disabling auto-jump makes a full block require the Space key.
- Two-block walls and low-ceiling obstacles stop auto-jump.
- Jumping stops against a low ceiling instead of passing through it.
- Falling lands on the first solid surface reached by the body.
- Spawn recovery searches upward for a collision-free position if saved terrain overlaps the player.

## Targeting and world editing

- The first solid voxel on the player-eye ray is selected.
- Placement uses the empty cell adjacent to the exact face that was hit.
- Placement is rejected if that cell overlaps the player.
- The bottom foundation layer cannot be broken.
- Third-person mining and placement animate the visible right arm so an interaction is not represented only by a disappearing block.

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

Expose auto-jump, look sensitivity, invert-Y, shoulder side, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
