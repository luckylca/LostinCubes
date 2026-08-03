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

When an inventory, workbench, or furnace screen is open, movement, looking, mining, placement, player physics, ground-drop physics, damage, and world time are frozen. E or Escape closes the current screen.

## Camera and targeting

- First- and third-person modes share authoritative player yaw and pitch.
- Pitch reaches effectively ±90 degrees, so the player can mine directly below or above.
- Interaction starts at the 1.62-block standing eye height and follows the player view direction.
- First person uses a center crosshair and a camera-parented held-item model.
- Third person uses a right-shoulder camera, a projected real-hit marker, and an item attached to the right hand.
- Camera obstruction shortens the third-person boom before a solid world mesh.
- Block reach is 4.5 blocks.

## Movement, health, and time

- X and Z movement resolve independently for wall sliding.
- Movement uses bounded substeps to prevent tunneling.
- Automatic step height is limited to 0.6 blocks.
- A full one-block obstacle uses a real jump or auto-jump arc.
- Two-block walls and low ceilings stop auto-jump.
- Falling lands on the first solid voxel surface.
- Safe falls cause no damage; dangerous landing speed removes health after contact with the floor.
- Maximum health is 20. Lethal fall damage or falling below the world respawns the player at the original spawn point with full health.
- The HUD shows health, the current 24-hour world time, and accumulated respawns.
- One complete day/night cycle lasts three real-time minutes while gameplay is active.

## Gathering and tool tiers

The selected hotbar item controls mining and placement.

- Empty hand and block items mine at base speed.
- Shovels accelerate grass and dirt.
- Pickaxes accelerate stone, rune stone, ores, and furnaces.
- Axes accelerate logs, planks, and crafting tables.
- Wooden tools provide a 3.4× matching-tool multiplier and have 59 durability.
- Stone tools provide a 5.2× matching-tool multiplier and have 131 durability.
- Iron tools provide a 7.2× matching-tool multiplier and have 250 durability.
- Leaves break quickly without requiring a special tool.
- Mismatched tools receive no speed bonus but still lose durability after a successful break.
- Tools lose one durability only when a block is actually removed.
- Mining progress resets when the target changes, attack is released, a menu opens, or the target leaves reach.

## Forest, caves, and ore progression

Oak trees and underground caves are deterministic parts of the seeded world. Caves are carved below a solid surface buffer, so buildings and spawn terrain remain supported.

The progression is:

1. Break an oak log and craft planks, sticks, and a crafting table.
2. Place and use the crafting table to make wooden tools.
3. Use a wooden pickaxe to collect stone and coal. Coal ore produces nothing without a pickaxe.
4. Craft a stone pickaxe and dig deeper. Iron ore produces rough iron only with a stone- or iron-tier pickaxe.
5. Craft and place a furnace from eight stone blocks.
6. Right-click the furnace and combine one rough iron with one coal to produce one iron ingot.
7. Use a crafting table to make iron pickaxes, shovels, and axes.

Coal can generate down to height 22. Iron is restricted to height 12 and below. The current HUD position readout can be used to judge depth.

## Inventory, crafting, and furnace

The inventory contains 27 storage slots plus nine hotbar slots.

- Left-click takes a whole stack, merges matching stacks, or swaps different stacks.
- Right-click takes half a stack or places one item into a slot.
- Block and material stacks are capped at 64.
- Tools occupy one slot and display durability.
- Closing attempts to return the cursor stack automatically and is blocked if no valid slot remains.
- Personal recipes include planks, sticks, and a crafting table.
- Workbench recipes include wood, stone, and iron tools plus the furnace.
- Furnace recipes are isolated from normal crafting and consume fuel and input atomically.
- Recipe outputs go to the cursor and obey stack limits.

New worlds start with an empty inventory. Legacy nine-slot saves migrate into the new hotbar without deleting existing items. Invalid old item or block identifiers are ignored instead of aborting startup.

## Drops, particles, and audio

Breaking a block creates a pooled visible item drop instead of writing directly into inventory.

- Ground entities now support blocks, coal, rough iron, iron ingots, and tools.
- Nearby identical items merge up to their normal maximum stack.
- Drops fall onto solid voxels, rotate, bob, and attract toward the player.
- Inventory overflow remains in the world.
- Up to 96 visible entities are reused through a fixed pool.
- Ground-drop snapshots are saved every two seconds and on page exit.
- Legacy block-only drop snapshots migrate automatically to item identities.
- Block breaks activate up to 48 pooled cube fragments.
- Break, placement, pickup, and crafting sounds are synthesized with Web Audio and disable safely when unavailable.

## Mobile controls

Landscape and narrow-screen layouts provide movement, mining, use, inventory, sprint, jump, camera, pause, drag-to-look, and a horizontally scrollable hotbar. Multi-touch uses independent pointer IDs for movement, camera, actions, and hotbar selection.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Deterministic terrain, caves, ores, and trees are regenerated rather than stored.
- Inventory items, counts, durability, and selection use a versioned world-scoped local-storage snapshot.
- Ground drops use a separate bounded world-scoped local-storage snapshot.
- Invalid inventory, voxel, and drop data is clamped or ignored during restore.
- Health, time of day, and respawn count currently reset when the page reloads.

## Accessibility goals

Expose auto-jump, look sensitivity, invert-Y, shoulder side, hold/toggle choices, touch opacity/scale, audio volume, camera shake strength, and remappable desktop controls after the base interaction layer is stable.
