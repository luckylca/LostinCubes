# Controls

## Implemented desktop controls

| Action | Default |
| --- | --- |
| Move | WASD |
| Look | Drag on the game canvas |
| Jump | Space |
| Sprint | Left or right Shift |
| Switch camera | V |
| Pause gameplay simulation | Escape |
| Break targeted block | Left mouse button or Q |
| Place selected block | Right mouse button or E |
| Select grass / dirt / stone / rune stone | 1 / 2 / 3 / 4 |

The center reticle targets the first solid voxel within six blocks. A wireframe box shows the selected block. Placement uses the adjacent cell on the hit face and is rejected when the new block would overlap the player.

The input manager converts browser events into a typed `PlayerInputCommand`. The simulation session consumes movement commands at a fixed 60 Hz step, while break/place/camera/pause inputs are edge-triggered so they are not repeated across fixed updates.

## Implemented mobile controls

Landscape and narrow-screen layouts show:

- Four directional movement buttons
- Break and place buttons
- Sprint
- Jump
- First/third-person camera switch
- Pause
- Dragging the world view to rotate the camera

Multi-touch is supported because movement buttons and the camera drag zone use independent pointer IDs. Touch camera dragging does not implicitly break a block.

## World-edit behavior

- The bottom foundation layer cannot be broken.
- Only an air cell can receive a placed block.
- Blocks cannot be placed inside the player volume.
- Edits rebuild the affected chunk and only the neighboring chunks whose shared boundary may have changed.
- Sparse edits are persisted by world seed and restored before the first playable chunk is shown.

## Input contexts

The first context boundary is active: pausing stops player simulation and world edits while camera and UI rendering continue. Later inventory, crafting, and dialogue contexts will use the same command-layer boundary.

## Planned bindings

Combat, target lock, recovery, inventory, crafting, and a real hotbar remain reserved for later milestones. The current numeric block selection is a temporary development hotbar.

## Accessibility goals

Expose look sensitivity, invert-Y, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
