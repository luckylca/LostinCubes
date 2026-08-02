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

The input manager converts browser events into a typed `PlayerInputCommand`. The simulation session consumes commands at a fixed 60 Hz step, so movement and jumping do not depend on display refresh rate.

## Implemented mobile controls

Landscape and narrow-screen layouts show:

- Four directional movement buttons
- Sprint
- Jump
- First/third-person camera switch
- Pause
- Dragging the world view to rotate the camera

Multi-touch is supported because movement buttons and the camera drag zone use independent pointer IDs.

## Input contexts

The first context boundary is now active: pausing stops player simulation while camera and UI rendering continue. Later inventory, crafting, and dialogue contexts will use the same command-layer boundary.

## Planned bindings

Combat, interaction, target lock, recovery, hotbar, inventory, and crafting bindings remain reserved for later milestones.

## Accessibility goals

Expose look sensitivity, invert-Y, hold/toggle choices, touch opacity/scale, camera shake strength, and remappable desktop controls after the base input layer is stable.
