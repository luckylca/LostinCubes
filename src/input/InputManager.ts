import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

type HeldAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'sprint'
  | 'break-block'
  | 'place-block';

type EdgeAction = 'jump' | 'toggle-camera' | 'toggle-pause';

const GAMEPLAY_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyV',
  'Escape',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
]);

function isHeldAction(value: string): value is HeldAction {
  return [
    'move-forward',
    'move-backward',
    'move-left',
    'move-right',
    'sprint',
    'break-block',
    'place-block',
  ].includes(value);
}

function isEdgeAction(value: string): value is EdgeAction {
  return ['jump', 'toggle-camera', 'toggle-pause'].includes(value);
}

export class InputManager {
  readonly #canvas: HTMLCanvasElement;
  readonly #abortController = new AbortController();
  readonly #keys = new Set<string>();
  readonly #mouseButtons = new Set<number>();
  readonly #touchActions = new Set<HeldAction>();
  #touchLookPointerId: number | null = null;
  #touchLookX = 0;
  #touchLookY = 0;
  #lookDeltaX = 0;
  #lookDeltaY = 0;
  #jumpRequested = false;
  #cameraToggleRequested = false;
  #pauseToggleRequested = false;
  #pointerLocked = false;
  #resumeAfterPointerLock = false;
  #suppressUnlockPause = false;
  #selectedBlock: BlockTypeValue = BlockType.Dirt;

  public constructor(canvas: HTMLCanvasElement, touchRoot: HTMLElement | null) {
    this.#canvas = canvas;
    const signal = this.#abortController.signal;

    document.addEventListener('keydown', this.#onKeyDown, { signal });
    document.addEventListener('keyup', this.#onKeyUp, { signal });
    document.addEventListener('mousemove', this.#onLockedMouseMove, { signal });
    document.addEventListener('mouseup', this.#onMouseUp, { signal });
    document.addEventListener('pointerlockchange', this.#onPointerLockChange, {
      signal,
    });
    window.addEventListener('blur', this.#onBlur, { signal });

    canvas.addEventListener('mousedown', this.#onMouseDown, { signal });
    canvas.addEventListener('pointerdown', this.#onTouchLookPointerDown, {
      signal,
    });
    canvas.addEventListener('pointermove', this.#onTouchLookPointerMove, {
      signal,
    });
    canvas.addEventListener('pointerup', this.#onTouchLookPointerUp, { signal });
    canvas.addEventListener('pointercancel', this.#onTouchLookPointerUp, {
      signal,
    });
    canvas.addEventListener('contextmenu', this.#onContextMenu, { signal });

    if (touchRoot !== null) {
      const buttons = touchRoot.querySelectorAll<HTMLElement>('[data-action]');
      for (const button of buttons) {
        button.addEventListener('pointerdown', this.#onTouchButtonDown, {
          signal,
        });
        button.addEventListener('pointerup', this.#onTouchButtonUp, { signal });
        button.addEventListener('pointercancel', this.#onTouchButtonUp, {
          signal,
        });
        button.addEventListener('contextmenu', (event) => event.preventDefault(), {
          signal,
        });
      }
    }
  }

  public poll(issuedAtTick: number): PlayerInputCommand {
    let moveX = 0;
    let moveZ = 0;

    if (this.#keys.has('KeyA') || this.#touchActions.has('move-left')) {
      moveX -= 1;
    }
    if (this.#keys.has('KeyD') || this.#touchActions.has('move-right')) {
      moveX += 1;
    }
    if (this.#keys.has('KeyW') || this.#touchActions.has('move-forward')) {
      moveZ += 1;
    }
    if (this.#keys.has('KeyS') || this.#touchActions.has('move-backward')) {
      moveZ -= 1;
    }

    const command: PlayerInputCommand = {
      type: 'player-input',
      issuedAtTick,
      moveX,
      moveZ,
      lookX: this.#lookDeltaX,
      lookY: this.#lookDeltaY,
      jump: this.#jumpRequested,
      sprint:
        this.#keys.has('ShiftLeft') ||
        this.#keys.has('ShiftRight') ||
        this.#touchActions.has('sprint'),
      toggleCamera: this.#cameraToggleRequested,
      togglePause: this.#pauseToggleRequested,
      breakBlock:
        this.#mouseButtons.has(0) ||
        this.#keys.has('KeyQ') ||
        this.#touchActions.has('break-block'),
      placeBlock:
        this.#mouseButtons.has(2) ||
        this.#keys.has('KeyE') ||
        this.#touchActions.has('place-block'),
      selectedBlock: this.#selectedBlock,
    };

    this.#lookDeltaX = 0;
    this.#lookDeltaY = 0;
    this.#jumpRequested = false;
    this.#cameraToggleRequested = false;
    this.#pauseToggleRequested = false;
    return command;
  }

  public dispose(): void {
    this.#suppressUnlockPause = true;
    if (document.pointerLockElement === this.#canvas) {
      document.exitPointerLock();
    }
    document.body.classList.remove('is-pointer-locked');
    this.#abortController.abort();
    this.#keys.clear();
    this.#mouseButtons.clear();
    this.#touchActions.clear();
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (GAMEPLAY_KEYS.has(event.code)) {
      event.preventDefault();
    }

    if (!event.repeat) {
      if (event.code === 'Space') {
        this.#jumpRequested = true;
      } else if (event.code === 'KeyV') {
        this.#cameraToggleRequested = true;
      } else if (
        event.code === 'Escape' &&
        !this.#pointerLocked &&
        !this.#resumeAfterPointerLock
      ) {
        this.#pauseToggleRequested = true;
      } else if (event.code === 'Digit1') {
        this.#selectedBlock = BlockType.Grass;
      } else if (event.code === 'Digit2') {
        this.#selectedBlock = BlockType.Dirt;
      } else if (event.code === 'Digit3') {
        this.#selectedBlock = BlockType.Stone;
      } else if (event.code === 'Digit4') {
        this.#selectedBlock = BlockType.RuneStone;
      }
    }

    this.#keys.add(event.code);
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#keys.delete(event.code);
  };

  readonly #onBlur = (): void => {
    this.#keys.clear();
    this.#mouseButtons.clear();
    this.#touchActions.clear();
    this.#touchLookPointerId = null;
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  readonly #onMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    if (!this.#pointerLocked) {
      this.#canvas.requestPointerLock();
      return;
    }

    if (event.button === 0 || event.button === 2) {
      this.#mouseButtons.add(event.button);
    }
  };

  readonly #onMouseUp = (event: MouseEvent): void => {
    this.#mouseButtons.delete(event.button);
  };

  readonly #onLockedMouseMove = (event: MouseEvent): void => {
    if (!this.#pointerLocked) {
      return;
    }
    this.#lookDeltaX += event.movementX;
    this.#lookDeltaY += event.movementY;
  };

  readonly #onPointerLockChange = (): void => {
    const wasLocked = this.#pointerLocked;
    this.#pointerLocked = document.pointerLockElement === this.#canvas;
    document.body.classList.toggle('is-pointer-locked', this.#pointerLocked);

    if (this.#pointerLocked) {
      if (this.#resumeAfterPointerLock) {
        this.#resumeAfterPointerLock = false;
        this.#pauseToggleRequested = true;
      }
      return;
    }

    this.#mouseButtons.clear();
    if (wasLocked && !this.#suppressUnlockPause) {
      this.#resumeAfterPointerLock = true;
      this.#pauseToggleRequested = true;
    }
  };

  readonly #onTouchLookPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' || this.#touchLookPointerId !== null) {
      return;
    }

    this.#touchLookPointerId = event.pointerId;
    this.#touchLookX = event.clientX;
    this.#touchLookY = event.clientY;
    this.#canvas.setPointerCapture(event.pointerId);
  };

  readonly #onTouchLookPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#touchLookPointerId) {
      return;
    }

    this.#lookDeltaX += event.clientX - this.#touchLookX;
    this.#lookDeltaY += event.clientY - this.#touchLookY;
    this.#touchLookX = event.clientX;
    this.#touchLookY = event.clientY;
  };

  readonly #onTouchLookPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.#touchLookPointerId) {
      this.#touchLookPointerId = null;
    }
  };

  readonly #onTouchButtonDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (action === undefined) {
      return;
    }

    target.setPointerCapture(event.pointerId);

    if (isHeldAction(action)) {
      this.#touchActions.add(action);
    } else if (isEdgeAction(action)) {
      if (action === 'jump') {
        this.#jumpRequested = true;
      } else if (action === 'toggle-camera') {
        this.#cameraToggleRequested = true;
      } else {
        this.#pauseToggleRequested = true;
      }
    }
  };

  readonly #onTouchButtonUp = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (action !== undefined && isHeldAction(action)) {
      this.#touchActions.delete(action);
    }
  };
}
