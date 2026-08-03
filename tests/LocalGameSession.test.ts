import { describe, expect, it } from 'vitest';
import type { PlayerInputCommand } from '../src/game/commands/PlayerInputCommand';
import {
  LocalGameSession,
  PLAYER_LOOK_PITCH_LIMIT,
} from '../src/game/session/LocalGameSession';

function command(overrides: Partial<PlayerInputCommand> = {}): PlayerInputCommand {
  return {
    type: 'player-input',
    issuedAtTick: 0,
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: false,
    toggleCamera: false,
    togglePause: false,
    toggleInventory: false,
    breakBlock: false,
    placeBlock: false,
    selectedHotbarSlot: 0,
    ...overrides,
  };
}

function createDropSession(spawnY: number): LocalGameSession {
  return new LocalGameSession('fall-test', {
    spawnPosition: { x: 0, y: spawnY, z: 0 },
    isSolidAt: (_x, y) => y === 0,
  });
}

function stepUntilGrounded(session: LocalGameSession, maximumSteps = 1_200): void {
  for (let step = 0; step < maximumSteps; step += 1) {
    session.step(1 / 60);
    if (session.getWorldState().player.grounded) return;
  }
  throw new Error('Player did not reach the floor.');
}

describe('LocalGameSession', () => {
  it('preserves the selected world seed and starts with full health', () => {
    const session = new LocalGameSession('test-seed');
    expect(session.getWorldState().worldSeed).toBe('test-seed');
    expect(session.getWorldState().player.health).toBe(20);
    expect(session.getWorldState().player.maximumHealth).toBe(20);
  });

  it('switches camera mode without replacing player state', () => {
    const session = new LocalGameSession('test-seed');
    const initialPosition = session.getWorldState().player.position;
    session.submitCommand(command({ toggleCamera: true }));
    session.step(1 / 60);
    expect(session.getWorldState().player.cameraMode).toBe('first-person');
    expect(session.getWorldState().player.position).toEqual(initialPosition);
  });

  it('stops movement while paused', () => {
    const session = new LocalGameSession('test-seed');
    session.submitCommand(command({ togglePause: true, moveZ: 1 }));
    session.step(1 / 60);
    const pausedPosition = session.getWorldState().player.position;
    session.submitCommand(command({ moveZ: 1 }));
    session.step(1 / 60);
    expect(session.getWorldState().player.paused).toBe(true);
    expect(session.getWorldState().player.position).toEqual(pausedPosition);
  });

  it('freezes movement, look, health, and time while a menu is open', () => {
    const session = new LocalGameSession('test-seed');
    const initial = session.getWorldState();
    session.setMenuOpen(true);
    session.submitCommand(command({ moveZ: 1, lookX: 200, lookY: 200 }));
    session.step(1 / 30);
    const menuState = session.getWorldState();
    expect(menuState.player.paused).toBe(true);
    expect(menuState.player.position).toEqual(initial.player.position);
    expect(menuState.player.yaw).toBe(initial.player.yaw);
    expect(menuState.player.pitch).toBe(initial.player.pitch);
    expect(menuState.player.health).toBe(initial.player.health);
    expect(menuState.dayTime).toBe(initial.dayTime);
    session.setMenuOpen(false);
    expect(session.getWorldState().player.paused).toBe(false);
  });

  it('allows looking effectively straight down and straight up', () => {
    const session = new LocalGameSession('test-seed');
    session.submitCommand(command({ lookY: 100_000 }));
    session.step(1 / 60);
    expect(session.getWorldState().player.pitch).toBeCloseTo(-PLAYER_LOOK_PITCH_LIMIT, 12);
    session.submitCommand(command({ lookY: -100_000 }));
    session.step(1 / 60);
    expect(session.getWorldState().player.pitch).toBeCloseTo(PLAYER_LOOK_PITCH_LIMIT, 12);
  });

  it('advances day time from fixed simulation steps', () => {
    const session = new LocalGameSession('test-seed');
    const start = session.getWorldState().dayTime;
    for (let step = 0; step < 60; step += 1) session.step(1 / 60);
    expect(session.getWorldState().dayTime - start).toBeCloseTo(1 / 180, 6);
  });

  it('applies damage only after a dangerous fall lands', () => {
    const session = createDropSession(12);
    expect(session.getWorldState().player.health).toBe(20);
    stepUntilGrounded(session);
    expect(session.getWorldState().player.health).toBeLessThan(20);
    expect(session.getWorldState().player.health).toBeGreaterThan(0);
  });

  it('respawns with full health after a lethal fall', () => {
    const session = createDropSession(40);
    for (let step = 0; step < 1_500; step += 1) {
      session.step(1 / 60);
      if (session.getWorldState().player.deathCount > 0) break;
    }
    const state = session.getWorldState().player;
    expect(state.deathCount).toBe(1);
    expect(state.health).toBe(20);
    expect(state.position.y).toBeCloseTo(40, 8);
  });
});
