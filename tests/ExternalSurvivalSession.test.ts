import { describe, expect, it } from 'vitest';
import {
  LocalGameSession,
  PLAYER_MAXIMUM_HEALTH,
} from '../src/game/session/LocalGameSession';

const BASE_SURVIVAL = {
  version: 2 as const,
  position: null,
  yaw: Math.PI,
  pitch: -0.12,
  hunger: 20,
  armorPoints: 0,
};

describe('external survival session actions', () => {
  it('restores persistent health and clamps food healing at maximum', async () => {
    const session = new LocalGameSession('world-a');
    await session.start();
    session.restoreSurvival({
      ...BASE_SURVIVAL,
      health: 13,
      dayTime: 0.84,
      deathCount: 2,
    });

    expect(session.getWorldState().player.health).toBe(13);
    expect(session.getWorldState().dayTime).toBeCloseTo(0.84, 12);
    expect(session.getWorldState().player.deathCount).toBe(2);
    expect(session.healPlayer(4)).toBe(4);
    expect(session.healPlayer(20)).toBe(3);
    expect(session.healPlayer(1)).toBe(0);
    expect(session.getWorldState().player.health).toBe(PLAYER_MAXIMUM_HEALTH);
  });

  it('returns lethal damage dealt, records death, then respawns explicitly', async () => {
    const spawnPosition = { x: 3, y: 7, z: -2 };
    const session = new LocalGameSession('world-a', { spawnPosition });
    await session.start();
    session.restoreSurvival({
      ...BASE_SURVIVAL,
      health: 7,
      dayTime: 0.3,
      deathCount: 4,
    });
    const deathPosition = session.getWorldState().player.position;

    expect(session.damagePlayer(99)).toBe(7);
    const deadState = session.getWorldState();
    expect(deadState.player.health).toBe(0);
    expect(deadState.player.paused).toBe(true);
    expect(deadState.player.deathCount).toBe(5);
    expect(deadState.lastDeathPosition).toEqual(deathPosition);
    expect(deadState.player.position).toEqual(deathPosition);

    expect(session.respawnPlayer()).toBe(true);
    const respawned = session.getWorldState();
    expect(respawned.player.health).toBe(PLAYER_MAXIMUM_HEALTH);
    expect(respawned.player.deathCount).toBe(5);
    expect(respawned.player.position).toEqual(spawnPosition);
    expect(respawned.lastDeathPosition).toEqual(deathPosition);
  });
});
