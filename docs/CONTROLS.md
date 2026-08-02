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
| Select grass / dirt / stone / rune stone | 1 / 2 / 3 / 4 |

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

## Minecraft-style targeting rules

- First- and third-person modes share one interaction origin: the player's eye position.
- The ray follows the player's yaw and pitch, never the third-person camera position.
- The first solid voxel is selected and outlined.
- Placement uses the empty cell adjacent to the exact face that was hit.
- Placement is rejected if that cell overlaps the player.

Holding attack accumulates progress only while the same block remains targeted. Changing targets, looking away, releasing attack, or pausing resets progress. Grass and dirt break faster than stone, while rune stone is slower. Holding use places immediately and then repeats at a bounded cadence.

The input manager converts browser events into a typed `PlayerInputCommand`. Movement remains fixed-step at 60 Hz. Attack and use are held states consumed by the presentation/world interaction layer, while jump, camera switching, and pause remain edge-triggered.

## Implemented mobile controls

Landscape and narrow-screen layouts show:

- Four directional movement buttons
- Hold-to-break and hold-to-place buttons
- Sprint
- Jump
- First/third-person camera switch
- Pause
- Dragging the world view to rotate the player view

Multi-touch is supported because movement buttons and the camera drag zone use independent pointer IDs.

## World-edit behavior

- The bottom foundation layer cannot be broken.
- Only an air cell can receive a placed block.
- Blocks cannot be placed inside the player volume.
- Edits rebuild the affected chunk and only the neighboring chunks whose shared boundary may have changed.
- Sparse edits are persisted by world seed and restored before the first playable chunk is shown.

## Input contexts

Pausing stops player simulation, mining progress, and world edits while UI rendering continues. Later inventory, crafting, and dialogue contexts will use the same command-layer boundary.

## Planned bindings

Combat, target lock, recovery, inventory, crafting, and a real hotbar remain reserved for later milestones. The current numeric block selection is a temporary development hotbar.

## Accessibility goals

Expose look sensitivity, invert-Y, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
