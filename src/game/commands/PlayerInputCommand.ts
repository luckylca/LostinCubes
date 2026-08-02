import type { BlockType } from '../../world/BlockType';
import { BlockType as Blocks } from '../../world/BlockType';
import type { GameCommand } from '../session/GameSession';

export interface PlayerInputCommand extends GameCommand {
  readonly type: 'player-input';
  readonly moveX: number;
  readonly moveZ: number;
  readonly lookX: number;
  readonly lookY: number;
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly toggleCamera: boolean;
  readonly togglePause: boolean;
  readonly breakBlock: boolean;
  readonly placeBlock: boolean;
  readonly selectedBlock: BlockType;
}

export function createNeutralPlayerInput(
  issuedAtTick: number,
): PlayerInputCommand {
  return {
    type: 'player-input',
    issuedAtTick,
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
    selectedBlock: Blocks.Dirt,
  };
}
