import { describe, expect, it } from 'vitest';
import type { PlayerInputCommand } from '../src/game/commands/PlayerInputCommand';
import {
  LocalGameSession,
  PLAYER_LOOK_PITCH_LIMIT,
} from '../src/game/session/LocalGameSession';

function command(
  overrides: Partial<PlayerInputCommand> = {},
): PlayerInputCommand {
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
    breakBlock: false,
    placeBlock: false,
    selectedHotbarSlot: 1,
    ...overrides,
  };
}

describe('LocalGameSession', () => {
  it('preserves the selected world seed', () => {
    const session = new LocalGameSession('test-seed');
    expect(session.getWorldState().worldSeed).toBe('test-seed');
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

  it('allows looking effectively straight down and straight up', () => {
    const session = new LocalGameSession('test-seed');

    session.submitCommand(command({ lookY: 100_000 }));
    session.step(1 / 60);
    expect(session.getWorldState().player.pitch).toBeCloseTo(
      -PLAYER_LOOK_PITCH_LIMIT,
      12,
    );

    session.submitCommand(command({ lookY: -100_000 }));
    session.step(1 / 60);
    expect(session.getWorldState().player.pitch).toBeCloseTo(
      PLAYER_LOOK_PITCH_LIMIT,
      12,
    );
  });
});
