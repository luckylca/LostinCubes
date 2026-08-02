import { describe, expect, it } from 'vitest';
import { LocalGameSession } from '../src/game/session/LocalGameSession';

describe('LocalGameSession', () => {
  it('preserves the selected world seed', () => {
    const session = new LocalGameSession('test-seed');
    expect(session.getWorldState().worldSeed).toBe('test-seed');
  });
});
