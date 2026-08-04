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
| Mine a targeted block | Hold left mouse button or Q |
| Melee attack when no block is targeted | Press left mouse button or Q |
| Use a targeted block / place the selected block | Right mouse button |
| Eat selected food when no block is targeted | Right mouse button |
| Select hotbar slot | 1–9 or mouse wheel |

When an inventory, workbench, or furnace screen is open, movement, looking, mining, placement, enemies, furnaces, player physics, ground-drop physics, damage, and world time are frozen. E or Escape closes the current screen.

## Camera and targeting

- First- and third-person modes share authoritative player yaw and pitch.
- Pitch reaches effectively ±90 degrees, so the player can mine directly below or above.
- Block interaction starts at the standing eye height and uses voxel DDA with a 4.5-block reach.
- First person uses a center crosshair and camera-parented held item.
- Third person uses a right-shoulder camera, a projected real-hit marker, and an item attached to the right hand.
- Melee combat uses the same player-eye direction, but selects the nearest enemy inside a bounded 3.25-block view capsule.
- Camera obstruction shortens the third-person boom before solid world geometry.

## Movement, health, death, and time

- X and Z movement resolve independently for wall sliding.
- Movement uses bounded substeps to prevent tunneling.
- Automatic step height is limited to 0.6 blocks.
- A full one-block obstacle uses a real jump or auto-jump arc.
- Two-block walls and low ceilings stop auto-jump.
- Safe falls cause no damage; dangerous landing speed removes health only after floor contact.
- Maximum health is 20.
- Lethal damage or falling below the world records the current death position, respawns the player at the original spawn point, and restores full health.
- On death, all 36 inventory slots are emptied into ground drops at the recorded death point. Damaged tools retain their exact durability.
- If the 96-entity drop pool is temporarily full, remaining stacks are returned to inventory rather than deleted.
- The HUD shows health, current 24-hour world time, active night enemies, and accumulated respawns.
- One full day/night cycle lasts three active gameplay minutes.
- Health, day time, and respawn count are restored on reload for the same world.

## Gathering and tool tiers

- Empty hand and block items mine at base speed.
- Shovels accelerate grass and dirt.
- Pickaxes accelerate stone, rune stone, ores, and furnaces.
- Axes accelerate logs, planks, and crafting tables.
- Wooden tools provide a 3.4× matching-tool multiplier and 59 durability.
- Stone tools provide a 5.2× multiplier and 131 durability.
- Iron tools provide a 7.2× multiplier and 250 durability.
- Leaves break quickly without requiring a special tool.
- Mismatched tools receive no mining bonus but still lose durability after a successful break.
- Mining tools lose one durability only when a block is actually removed.

## Caves, ores, and timed furnaces

Oak trees, caves, coal, and iron are deterministic parts of the seeded world. Caves remain below a protected surface shell.

The ore progression is:

1. Craft a table and wooden pickaxe.
2. Gather stone and coal with a wooden-or-better pickaxe.
3. Craft a stone pickaxe and mine iron at height 12 or below.
4. Craft a furnace from eight stone blocks and place it.
5. Right-click the furnace, insert rough iron and coal, then close the screen to let world simulation continue.
6. Each coal burns for 12 seconds. Each iron ingot requires four burning seconds, so one coal can smelt up to three ingots.
7. Reopen the furnace and take accumulated output.
8. Craft iron tools at a workbench.

Furnace rules:

- Input, fuel, output, remaining burn time, and partial smelt progress are stored per furnace coordinate.
- Up to 128 furnace records are retained per world.
- Input, fuel, and output slots each hold up to 64 items.
- A furnace begins a new coal only when it has input, output space, and no remaining burn time.
- An already burning coal continues to burn if input runs out or output fills, matching a real fuel cycle.
- Breaking a furnace drops its remaining input, unused fuel, completed output, and the furnace block itself.
- Furnace state is saved every two seconds and on page exit.

Coal can generate through height 22. Iron is restricted to height 12 and below. Use the HUD coordinates to judge depth.

## Food and recovery

- Some oak leaves deterministically drop apples when broken.
- Apples stack to 16.
- Select an apple, aim away from blocks, and right-click to eat it.
- An apple restores four health and is consumed only when health is below 20.
- Apples are rendered in the hotbar, inventory, ground-drop pool, and both held-item camera modes.
- Night enemies can also drop an occasional apple.

## Night enemies and melee combat

- Night stalkers spawn only during the dark portion of the day cycle.
- At most ten are active at once.
- They appear roughly 10–18 blocks from the player, follow terrain standing height, pursue the player, and despawn when daylight returns or when too far away.
- A nearby stalker deals three damage with an individual 1.15-second attack cooldown.
- Player melee attacks require a fresh press rather than continuous held mining.
- Empty hand and non-tool items deal two damage.
- Axes deal the most melee damage; pickaxes and shovels deal less according to material tier.
- Tools lose one durability only after a melee hit actually connects.
- Stalkers have 12 health and drop coal; some kills also produce an apple.
- Combat, hurt, eating, death-loop pickups, crafting, placement, and breaking use lightweight synthesized Web Audio feedback.

## Inventory and drops

The inventory contains 27 storage slots plus nine hotbar slots.

- Left-click takes a whole stack, merges matching stacks, or swaps different stacks.
- Right-click takes half a stack or places one item into a slot.
- Most blocks and materials stack to 64; apples stack to 16; tools occupy one slot.
- Closing attempts to return the cursor stack automatically and is blocked if no valid slot remains.
- Personal recipes include planks, sticks, and a crafting table.
- Workbench recipes include wood, stone, and iron tools plus the furnace.
- Furnace processing is stateful and is not represented as an instant recipe card.

Ground drops:

- Support blocks, materials, food, and tools.
- Preserve tool durability through saving, death, pickup, and reload.
- Merge only when item identity and durability match.
- Fall onto voxels, rotate, bob, attract toward the player, and remain in the world when inventory is full.
- Reuse a fixed pool of at most 96 visible entities.
- Save every two seconds and on page exit.
- Migrate old numeric block-only snapshots and ignore malformed historical records.

## Mobile controls

Landscape and narrow-screen layouts provide movement, mining/attack, use/eat, inventory, sprint, jump, camera, pause, drag-to-look, and a horizontally scrollable hotbar. Multi-touch uses independent pointer IDs for movement, camera, actions, and hotbar selection.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Deterministic terrain, caves, ores, trees, and apple-drop decisions are regenerated rather than stored.
- Inventory, selected slot, item counts, and tool durability use a versioned world-scoped snapshot.
- Ground drops use a separate bounded durability-aware snapshot.
- Furnace states use coordinate-scoped world snapshots.
- Health, day time, and respawn count use a survival snapshot.
- Invalid inventory, survival, furnace, voxel, and drop data is clamped or ignored during restore.

## Current limits

There is no hunger, armor, ranged combat, invulnerability-frame system, enemy pathfinding around complex walls, or persistent enemy state. Furnace processing pauses while any menu or normal pause state freezes the world.
