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

  it('returns lethal damage dealt, records the death point, and respawns', async () => {
    const session = new LocalGameSession('world-a', {
      spawnPosition: { x: 3, y: 7, z: -2 },
    });
    await session.start();
    session.restoreSurvival({
      ...BASE_SURVIVAL,
      health: 7,
      dayTime: 0.3,
      deathCount: 4,
    });
    const deathPosition = session.getWorldState().player.position;

    expect(session.damagePlayer(99)).toBe(7);
    const state = session.getWorldState();
    expect(state.player.health).toBe(PLAYER_MAXIMUM_HEALTH);
    expect(state.player.deathCount).toBe(5);
    expect(state.lastDeathPosition).toEqual(deathPosition);
    expect(state.player.position).toEqual(deathPosition);
  });
});
