# Game Design

## Product statement

Lost in Cubes is a 20–40 minute first-chapter vertical slice of an original 3D voxel action RPG. The player wakes on a mist-bound fragment of a broken world-tree realm, gathers materials, crafts basic equipment, explores a ruin, defeats three enemy archetypes, and confronts a two-phase guardian boss.

## Core loop

Explore → observe danger or opportunity → gather resources → craft/equip → open a route or improve survival → fight → recover at a root monument → discover story evidence → challenge the chapter boss.

## Player abilities

The player can walk, sprint, jump, dodge, block, use light/heavy attacks, interact, mine, place blocks, consume recovery items, lock targets, and switch first/third-person cameras. Health and stamina are shared across both camera modes.

## Gathering and building

Wood, stone, and rune ore form the first resource triangle. Building is intentionally modest: blocks create cover, bridges, and safe footholds, but protected story and boss structures cannot be removed.

## Crafting

Initial recipes: stone axe, northern short axe, wood shield, restorative tonic, and rune keystone. Recipes and items are data-driven.

## Combat

Combat rewards readable timing, stamina planning, and positioning. Attacks have windup, active, and recovery windows. Dodges have limited invulnerability. Blocking reduces or prevents damage at stamina cost. Mobile controls must support the complete encounter without requiring impractically fast input.

## Enemies

- **Hollow Oathguard:** slow melee teacher with visible windups.
- **Rimeback Stalker:** low-health flanker with short pounce chains.
- **Shard-Spear Warden:** ranged pressure enemy that weakens at close range.

## First boss

**Vardr Hrafnroot, Keeper of the Severed Ring** is a stone-and-root sentinel created to quarantine a corrupted world fragment. Phase one uses measured weapon arcs and delayed rune eruptions. Phase two cracks its shell, exposes luminous roots, and adds area denial without removing readable telegraphs.

## Quests and story

A guide-spirit named **Myr, the Unwritten Raven** directs the player toward a root monument, crafting objective, ruin investigation, and the sealed arena. Story is delivered through concise dialogue, item descriptions, rune slabs, environmental arrangement, and short encounter transitions.

## Death penalty

On death, the player leaves **lost ember-script** at the death point and returns to the latest activated root monument. A second death before recovery replaces the old recovery point. Inventory and completed story progress remain.

## First-version scope

One bounded world fragment, one safe area, one cave, one ruin, three enemy types, one boss, five recipes, three save slots, desktop/mobile controls, and one complete chapter ending.

## Explicitly out of scope

Multiplayer, accounts, cloud saves, full nine realms, large cities, extensive skill trees, mounts, commerce, guilds, complex ecology, and server-side anti-cheat.
