import type {
  CameraMode,
  PlayerState,
  VectorState,
} from '../src/game/session/GameSession';

export interface TestPlayerStateOverrides
  extends Omit<Partial<PlayerState>, 'position'> {
  readonly position?: VectorState;
  readonly cameraMode?: CameraMode;
}

export function createTestPlayerState(
  overrides: TestPlayerStateOverrides = {},
): PlayerState {
  return {
    position: { x: 0, y: 2.9, z: 3.5 },
    verticalVelocity: 0,
    horizontalSpeed: 0,
    sprinting: false,
    sneaking: false,
    grounded: true,
    inWater: false,
    submerged: false,
    inLava: false,
    onLadder: false,
    airSupply: 300,
    maximumAirSupply: 300,
    yaw: Math.PI,
    pitch: -0.12,
    cameraMode: 'third-person',
    paused: false,
    health: 20,
    maximumHealth: 20,
    damageTaken: 0,
    deathCount: 0,
    ...overrides,
  };
}
