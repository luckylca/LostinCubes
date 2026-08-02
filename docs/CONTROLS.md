# Controls

## Desktop controls

| Action | Default |
| --- | --- |
| Capture mouse / resume | Click the game canvas |
| Fallback look | Hold and drag when pointer lock is unavailable |
| Move | WASD |
| Look | Move the captured mouse |
| Jump | Space |
| Sprint | Left or right Shift |
| Switch camera | F5 or V |
| Open or close inventory | E |
| Close inventory / release mouse / pause | Escape |
| Mine targeted block | Hold left mouse button or Q |
| Use targeted block / place selected block | Right mouse button |
| Select hotbar slot | 1–9 or mouse wheel |

When the inventory is open, movement, looking, mining, placement, player physics, and drop physics are frozen. Pointer lock is released without also toggling the normal pause state. Pressing E or Escape closes the inventory.

## Camera and targeting

- First- and third-person modes share authoritative player yaw and pitch.
- Pitch reaches effectively ±90 degrees, so the player can mine directly below or above.
- Interaction starts at the 1.62-block standing eye height and follows the player view direction.
- First person uses a center crosshair and a camera-parented held-item model.
- Third person uses a right-shoulder camera, a projected real-hit marker, and an item attached to the right hand.
- Camera obstruction shortens the third-person boom before a solid world mesh.
- Block reach is 4.5 blocks.

## Movement and collision

- X and Z movement resolve independently for wall sliding.
- Movement uses bounded substeps to prevent tunneling.
- Automatic step height is limited to 0.6 blocks.
- A full one-block obstacle uses a real jump or auto-jump arc.
- Two-block walls and low ceilings stop auto-jump.
- Falling lands on the first solid voxel surface.
- Spawn recovery searches upward for a collision-free position.

## Gathering and tools

The selected hotbar item controls mining and placement.

- Empty hand and block items mine at base speed.
- Shovels accelerate grass and dirt.
- Pickaxes accelerate stone and rune stone.
- Axes accelerate logs, planks, and crafting tables.
- Wooden tools provide a 3.4× matching-tool multiplier and have 59 durability.
- Stone tools provide a 5.2× matching-tool multiplier and have 131 durability.
- Leaves break quickly without requiring a special tool.
- Mismatched tools receive no speed bonus but still lose durability after a successful break.
- Tools lose one durability only when a block is actually removed.
- Mining progress resets when the target changes, attack is released, the menu opens, or the target leaves reach.

## Forest and wood progression

Oak trees are deterministic world structures made from solid log and leaf voxels. They participate in meshing, collision, targeting, persistence, and drops like terrain blocks.

The initial progression is:

1. Break an oak log by hand.
2. Open the inventory with E and craft four oak planks from one log.
3. Craft sticks and a crafting table with personal recipes.
4. Put the crafting table in the hotbar and place it.
5. Right-click the placed table to open workbench recipes.
6. Craft wooden tools, gather stone, then craft stone tools.

## Inventory and crafting

The inventory contains 27 storage slots plus nine hotbar slots.

- Left-click takes a whole stack, merges matching stacks, or swaps different stacks.
- Right-click takes half a stack or places one item into a slot.
- Block and material stacks are capped at 64.
- Tools occupy one slot and display durability.
- Closing the inventory attempts to return the cursor stack automatically.
- Closing is blocked if every compatible and empty slot is full, preventing item loss.
- Personal recipes include planks, sticks, and a crafting table.
- Tool recipes require using a placed crafting table.
- Recipe outputs go to the inventory cursor and obey stack limits.

New worlds start with an empty inventory. Legacy nine-slot saves migrate into the new hotbar at slots 28–36 without deleting existing items.

## Drops, particles, and audio

Breaking a block creates a pooled visible drop instead of writing directly into inventory.

- Nearby same-block drops merge up to 64.
- Drops fall onto solid voxels, rotate, bob, and attract toward the player.
- Inventory overflow remains in the world.
- Up to 96 visible drop entities are reused through a fixed pool.
- Ground-drop snapshots are saved every two seconds and on page exit, then restored on the next load.
- Block breaks activate up to 48 pooled cube fragments for short visual feedback.
- Break, placement, pickup, and crafting sounds are synthesized with Web Audio and silently disable themselves when audio is unavailable.

## Mobile controls

Landscape and narrow-screen layouts provide movement, mining, use, inventory, sprint, jump, camera, pause, drag-to-look, and a horizontally scrollable hotbar. Multi-touch uses independent pointer IDs for movement, camera, actions, and hotbar selection.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Deterministic terrain and trees are regenerated rather than stored.
- Inventory items, counts, durability, and selection use a versioned world-scoped local-storage snapshot.
- Ground drops use a separate bounded world-scoped local-storage snapshot.
- Invalid inventory and drop data is clamped or ignored during restore.

## Accessibility goals

Expose auto-jump, look sensitivity, invert-Y, shoulder side, hold/toggle choices, touch opacity/scale, audio volume, camera shake strength, and remappable desktop controls after the base interaction layer is stable.
