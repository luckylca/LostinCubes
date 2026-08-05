# Controls

## Desktop controls

| Action | Default |
| --- | --- |
| Capture mouse / resume | Click the game canvas |
| Fallback look | Hold and drag when pointer lock is unavailable |
| Move | WASD |
| Look | Move the captured mouse |
| Jump / swim upward | Space |
| Sprint | Left or right Shift |
| Sneak / prevent ledge fall / dive | Left or right Ctrl |
| Climb ladder upward | Move forward or hold Space |
| Climb ladder downward | Move backward or hold Ctrl |
| Switch camera | F5 or V |
| Open or close inventory | E |
| Close inventory / release mouse / pause | Escape |
| Mine a targeted block | Hold left mouse button or Q |
| Melee attack when no block is targeted | Press left mouse button or Q |
| Use a targeted block / place selected block | Right mouse button |
| Eat selected food when no block is targeted | Right mouse button |
| Select hotbar slot | 1–9 or mouse wheel |

When an inventory, workbench, or furnace screen is open, movement, looking, mining, placement, enemies, furnaces, player physics, ground-drop physics, random block ticks, damage, and world time are frozen. E or Escape closes the current screen.

## Movement and environment

The same kinematic voxel body is used on land, in fluids, and on ladders.

- Walking resolves X and Z separately for wall sliding and uses bounded substeps to prevent tunneling.
- Automatic stepping is limited to 0.6 blocks; a full block uses a real jump or auto-jump arc.
- Holding Ctrl reduces horizontal speed and prevents a grounded player from stepping into unsupported space.
- Water reduces horizontal speed, applies vertical drag, and cancels accumulated fall damage.
- Hold Space while in water to swim upward; hold Ctrl to dive.
- Lava is slower than water and causes periodic damage.
- Ladders are non-solid, targetable blocks. Moving forward or holding Space climbs; moving backward or holding Ctrl descends.
- Entering water, lava, or a ladder cancels the current dangerous-fall accumulation.

The compact environment HUD shows the current biome and only adds a special state when relevant: land, sneak, water, underwater, lava, or ladder. The canvas also exposes `data-biome`, `data-environment`, and `data-player-air` for diagnostics and browser tests.

## Oxygen, damage, and recovery

- Maximum health is 20.
- Maximum oxygen is 300 units.
- The body may be in water without losing oxygen; oxygen drains only when the head is submerged.
- Oxygen drains at 20 units per active gameplay second and recovers at 80 units per second after surfacing.
- Drowning begins after oxygen reaches zero and deals periodic damage.
- Lava and head-inside-solid-block suffocation also deal periodic damage.
- Falls, enemies, drowning, lava, and suffocation share a short hurt-invulnerability window, preventing multiple sources from stacking every fixed step.
- Apples restore four health and are consumed only below full health.
- Lethal damage or falling below the world respawns the player at the original safe spawn with full health and oxygen.
- Death moves all 36 inventory slots into the bounded ground-drop pool; overflow returns to inventory rather than being deleted.

Health, day time, and death count persist for the current world. Oxygen is restored on reload rather than persisted separately.

## Biomes, oceans, and underground hazards

The deterministic world now contains four climate-driven biomes:

- Plains: open grassland with sparse trees, tall grass, and flowers.
- Forest: denser oak trees and undergrowth.
- Desert: sand surface with little vegetation.
- Snowy tundra: snow surface with sparse trees.

The initial spawn remains a dry plains clearing above sea level. Away from spawn:

- Low terrain fills with static water to sea level 8.
- Beaches and seabeds use sand, gravel, and clay patches.
- Caves remain below a protected surface shell.
- Coal generates through height 22.
- Iron generates at height 12 and below.
- Deep carved caves may contain luminous lava at height 4 and below.

Water and lava currently represent generated static fluid volumes. They have shared chunk geometry, opacity, lighting, collision queries, and survival effects, but do not yet flow and cannot be collected with buckets.

## Plants, leaf decay, and regrowth

Nearby world updates use a small fixed random-tick budget rather than scanning the world.

- Leaves retain themselves while an oak log is within the support radius.
- Unsupported leaves decay gradually.
- Breaking leaves has a low chance to drop an oak sapling.
- Saplings placed on grass or dirt can grow into a full oak tree when enough space exists.
- Tall grass, flowers, saplings, and ladders remove themselves after losing required support.
- Covered grass converts to dirt; exposed dirt near grass may spread back to grass.

A tree growth event may modify many voxels, but renderer invalidation is deduplicated by touched chunk.

## Real 2×2 and 3×3 crafting

Crafting uses actual grid state instead of instantly subtracting ingredients from the backpack.

1. Press E to open the personal 2×2 grid.
2. Left-click moves whole stacks; right-click takes half or places one item.
3. Arrange ingredients in the grid. Shaped recipes may use any valid offset.
4. Matching results appear in the output slot.
5. Click once to craft once, hold to craft repeatedly, or Shift-click to craft until materials or stack space run out.
6. Closing safely returns grid and cursor stacks; closing is blocked rather than deleting overflow.

The recipe book is optional. It fills an empty grid with as many complete recipe layers as the inventory supports, but never creates the output directly.

Personal recipes include planks, sticks, the crafting table, and torches. A placed crafting table opens the 3×3 grid for tools, the furnace, and ladders.

Classic ladder recipe:

```text
stick   empty   stick
stick   stick   stick
stick   empty   stick
```

Seven sticks produce three ladders.

## Resource and furnace progression

- Shovels accelerate grass, dirt, sand, gravel, clay, and snow.
- Pickaxes accelerate stone, cobblestone, rune stone, ores, and furnaces.
- Axes accelerate logs, planks, crafting tables, and ladders.
- Wooden tools: 3.4× matching speed, 59 durability.
- Stone tools: 5.2× matching speed, 131 durability.
- Iron tools: 7.2× matching speed, 250 durability.
- Natural stone drops cobblestone only with a suitable pickaxe.
- Coal requires a wooden-or-better pickaxe.
- Iron requires a stone-or-better pickaxe.
- Mismatched tools gain no speed bonus and still lose durability after a successful break.

The furnace is eight cobblestone around an empty center. Each placed furnace owns input, fuel, output, burn time, and smelt progress. Coal burns for 12 seconds; one iron ingot requires four burning seconds. A burning furnace emits level-13 light.

## Camera, targeting, and combat

- First- and third-person modes share authoritative yaw and pitch.
- Pitch reaches effectively ±90 degrees for direct upward or downward targeting.
- Block interaction starts at standing eye height and uses voxel DDA with 4.5-block reach.
- Non-solid targetable blocks such as torches, ladders, flowers, and saplings remain selectable.
- Third person uses a right-shoulder camera, real-hit marker, and obstruction shortening.
- Night stalkers spawn in darkness, pursue the player, attack on cooldown, and despawn in daylight or at excessive distance.
- Melee uses the same eye direction; tools lose durability only when a hit connects.

## Inventory, drops, and persistence

The inventory contains 27 storage slots plus nine hotbar slots.

- Most blocks and materials stack to 64; apples stack to 16; tools occupy one slot.
- Ground drops preserve identity and tool durability, merge compatible stacks, fall onto solid voxels, and remain when inventory is full.
- At most 96 visible drops are active.
- Sparse world edits are stored in IndexedDB by world seed.
- Inventory, drops, furnaces, health, time, and death count use versioned world-scoped snapshots.
- Existing numeric block IDs 0–13 remain unchanged; environmental blocks append IDs 14–23.
- Invalid historical records are clamped or ignored.

The new terrain generator intentionally changes regenerated terrain for the same seed. Sparse edits remain readable, but an old edited world can contain floating or embedded edits relative to the new biome terrain.

## Mobile controls

Landscape and narrow-screen layouts provide independent buttons for movement, mining/attack, use/eat, inventory, sprint, sneak/dive, jump/swim-up, camera, and pause. The canvas supports drag-to-look and the hotbar remains horizontally scrollable.

## Current limits

- Water and lava are static generated volumes with no source levels or flow simulation.
- There are no buckets, springs, ice, freezing, falling sand/gravel, fire, or extinguishing.
- Ladders use crossed pixel quads and do not yet store a wall-facing block state.
- Dungeons and a separate population pipeline are deferred.
- Hunger, armor, ranged combat, TNT, broader mobs, world slots, and persistent entities belong to Batch 3.
