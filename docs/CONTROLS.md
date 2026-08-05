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

## Real 2×2 and 3×3 crafting

Crafting now uses actual grid state instead of instantly subtracting ingredients from the backpack.

1. Press E to open the personal 2×2 grid.
2. Left-click to move whole stacks; right-click to take half or place one item.
3. Arrange ingredients in the grid. A shaped recipe may be moved to any valid offset inside the current grid.
4. When the arrangement matches, the result appears in the output slot.
5. Click the output slot to consume one item from every occupied recipe cell and take the result onto the cursor.
6. Place the cursor stack into inventory or continue crafting while the same recipe remains valid.

The recipe book is optional. Clicking a recipe-book card only moves one recipe layer from inventory into an empty crafting grid. It never creates the output directly.

Closing the screen attempts to return every crafting-grid and cursor stack to inventory. Closing is blocked when insufficient space remains; items are never silently deleted.

Personal 2×2 recipes include:

- One oak log anywhere → four oak planks.
- Two oak planks vertically → four sticks.
- Four oak planks filling 2×2 → one crafting table.
- Coal above a stick → four torches.

Place a crafting table and right-click it to use the 3×3 grid. The 3×3 grid supports the familiar pickaxe, shovel, axe, and furnace shapes. Axe recipes also match their horizontal mirror.

## Classic resource progression

- Empty hand and block items mine at base speed.
- Shovels accelerate grass and dirt.
- Pickaxes accelerate stone, cobblestone, rune stone, ores, and furnaces.
- Axes accelerate logs, planks, and crafting tables.
- Wooden tools provide a 3.4× matching-tool multiplier and 59 durability.
- Stone tools provide a 5.2× multiplier and 131 durability.
- Iron tools provide a 7.2× multiplier and 250 durability.
- Leaves break quickly without requiring a special tool.
- Mining duration comes from the block registry hardness rather than duplicated per-feature constants.
- Mismatched tools receive no mining bonus but still lose durability after a successful break.
- Mining tools lose one durability only when a block is actually removed.

Stone now follows the classic collection loop:

1. Craft a wooden pickaxe.
2. Mine natural stone with a suitable pickaxe.
3. The block drops cobblestone rather than a natural-stone block.
4. Use cobblestone for stone tools and the furnace recipe.

The furnace recipe is eight cobblestone surrounding an empty center in the 3×3 workbench grid.

## Voxel sky light and block light

Chunks now contain a classic integer light field:

- Sky light ranges from 0 to 15.
- Block light ranges from 0 to 15.
- Opaque blocks stop direct sky light.
- Open cave entrances allow light to spread sideways and downward one level per voxel.
- Leaves reduce light by one level while still allowing partial daylight.
- Torch light starts at level 14.
- Rune stone emits level 10.
- A burning furnace emits level 13 and removes that light when fuel expires or the furnace is broken.
- Final visible brightness uses the greater of sky light and block light.

Light is computed in the chunk Worker over a bounded 15-block border, then baked into chunk vertex colors. Adding/removing a light source or changing an opaque block invalidates the affected neighboring chunk area.

Torches are targetable but non-solid. Their world model uses crossed alpha-tested pixel quads rather than a full collision cube.

## Furnace operation

Each placed furnace owns coordinate-scoped input, fuel, output, burn time, and smelt progress.

1. Put rough iron into the upper slot.
2. Put coal into the lower fuel slot.
3. Close the menu so fixed-step world simulation resumes.
4. Reopen the furnace and take iron ingots from the right output slot.

Rules:

- Coal burns for 12 seconds.
- One iron ingot requires four burning seconds.
- One coal can therefore smelt up to three ingots.
- Input, fuel, and output each hold up to 64 items.
- A burning fuel item continues its cycle if input runs out or output fills.
- Breaking a furnace returns remaining input, unused fuel, completed output, and the furnace block.
- Furnace state is saved every two seconds and on page exit.
- Burning light changes are transition-driven; progress ticks do not continuously remesh chunks.

## Camera and targeting

- First- and third-person modes share authoritative player yaw and pitch.
- Pitch reaches effectively ±90 degrees, so the player can mine directly below or above.
- Block interaction starts at standing eye height and uses voxel DDA with a 4.5-block reach.
- Targeting uses the block registry, allowing non-solid interactive blocks such as torches to be selected.
- First person uses a center crosshair and camera-parented held item.
- Third person uses a right-shoulder camera, projected real-hit marker, and item attached to the right hand.
- Melee uses the same player-eye direction and selects the nearest enemy inside a bounded 3.25-block view capsule.
- Camera obstruction shortens the third-person boom before solid world geometry.

## Movement, health, death, and time

- X and Z movement resolve independently for wall sliding.
- Movement uses bounded substeps to prevent tunneling.
- Automatic step height is limited to 0.6 blocks.
- A full one-block obstacle uses a real jump or auto-jump arc.
- Two-block walls and low ceilings stop auto-jump.
- Safe falls cause no damage; dangerous landing speed removes health only after floor contact.
- Maximum health is 20.
- Lethal damage or falling below the world records the death position, respawns at the original spawn, and restores full health.
- On death, all 36 inventory slots become ground drops at the death point. Damaged tools keep exact durability.
- If the 96-entity drop pool is full, remaining stacks return to inventory rather than being deleted.
- The HUD shows health, 24-hour world time, active night enemies, and accumulated respawns.
- One full day/night cycle lasts three active gameplay minutes.
- Health, day time, and respawn count restore on reload for the same world.

## Caves and ores

Oak trees, caves, coal, and iron are deterministic parts of the seeded world. Caves remain below a protected surface shell.

- Coal can generate through height 22 and requires a wooden-or-better pickaxe for its coal drop.
- Iron is restricted to height 12 and below and requires a stone-or-better pickaxe for rough iron.
- Breaking an ore with an insufficient or mismatched tool may remove it without producing the resource.
- Use HUD coordinates to judge mining depth.

## Food and recovery

- Some oak leaves deterministically drop apples when broken.
- Apples stack to 16.
- Select an apple, aim away from blocks, and right-click to eat it.
- An apple restores four health and is consumed only below full health.
- Night enemies can also drop an occasional apple.

## Night enemies and melee combat

- Night stalkers spawn only during the dark portion of the day cycle.
- At most ten are active at once.
- They appear roughly 10–18 blocks from the player, follow terrain standing height, pursue, and despawn in daylight or at excessive distance.
- A nearby stalker deals three damage with an individual 1.15-second attack cooldown.
- Empty hand and non-tool items deal two damage.
- Axes deal the most melee damage; pickaxes and shovels deal less by material tier.
- Tools lose one durability only after a melee hit connects.
- Stalkers have 12 health and drop coal; some kills also produce an apple.

## Inventory and ground drops

The inventory contains 27 storage slots plus nine hotbar slots.

- Left-click takes a whole stack, merges matching stacks, or swaps different stacks.
- Right-click takes half a stack or places one item.
- Most blocks/materials stack to 64; apples stack to 16; tools occupy one slot.
- Ground drops support blocks, materials, food, and durability-preserving tools.
- Drops merge only when item identity and durability match.
- Drops fall onto voxels, rotate, bob, attract toward the player, and remain when inventory is full.
- A fixed pool provides at most 96 visible drop entities.
- Drop snapshots save every two seconds and on page exit.
- Old numeric block-only snapshots migrate through runtime-validated block mapping; malformed historical IDs are ignored.

## Mobile controls

Landscape and narrow-screen layouts provide movement, mining/attack, use/eat, inventory, sprint, jump, camera, pause, drag-to-look, and a horizontally scrollable hotbar. Multi-touch uses independent pointer IDs for movement, camera, actions, and hotbar selection.

## Persistence

- Sparse world edits are stored in IndexedDB by world seed.
- Deterministic terrain, caves, ores, trees, and apple decisions are regenerated rather than stored.
- Inventory, selected slot, item counts, and tool durability use a versioned world-scoped snapshot.
- Ground drops use a separate bounded durability-aware snapshot.
- Furnace states use coordinate-scoped world snapshots.
- Health, day time, and respawn count use a survival snapshot.
- Existing numeric block IDs 0–11 remain unchanged; cobblestone and torch append IDs 12 and 13.
- Invalid inventory, survival, furnace, voxel, and drop data is clamped or ignored during restore.

## Current limits

Batch 1 establishes classic rules, real shaped crafting, and voxel lighting. Water/lava, biomes, swimming, sneaking, ladders, scheduled block ticks, broader mobs, projectiles, TNT, world slots, and persistent entities belong to batches 2 and 3. There is still no hunger, armor, ranged combat, complex enemy pathfinding, or persistent enemy state.
