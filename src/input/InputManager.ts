import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';
import { BlockType } from '../world/BlockType';
import type { BlockType as BlockTypeValue } from '../world/BlockType';

type HeldAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'sprint';

type EdgeAction =
  | 'jump'
  | 'toggle-camera'
  | 'toggle-pause'
  | 'break-block'
  | 'place-block';

const CLICK_DRAG_THRESHOLD_PX = 5;
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
  ].includes(value);
}

function isEdgeAction(value: string): value is EdgeAction {
  return [
    'jump',
    'toggle-camera',
    'toggle-pause',
    'break-block',
    'place-block',
  ].includes(value);
}

export class InputManager {
  readonly #canvas: HTMLCanvasElement;
  readonly #abortController = new AbortController();
  readonly #keys = new Set<string>();
  readonly #touchActions = new Set<HeldAction>();
  #lookPointerId: number | null = null;
  #lookPointerX = 0;
  #lookPointerY = 0;
  #lookPointerStartX = 0;
  #lookPointerStartY = 0;
  #lookPointerDragged = false;
  #lookDeltaX = 0;
  #lookDeltaY = 0;
  #jumpRequested = false;
  #cameraToggleRequested = false;
  #pauseToggleRequested = false;
  #breakBlockRequested = false;
  #placeBlockRequested = false;
  #selectedBlock: BlockTypeValue = BlockType.Dirt;

  public constructor(canvas: HTMLCanvasElement, touchRoot: HTMLElement | null) {
    this.#canvas = canvas;
    const signal = this.#abortController.signal;

    document.addEventListener('keydown', this.#onKeyDown, { signal });
    document.addEventListener('keyup', this.#onKeyUp, { signal });
    window.addEventListener('blur', this.#onBlur, { signal });

    canvas.addEventListener('pointerdown', this.#onLookPointerDown, { signal });
    canvas.addEventListener('pointermove', this.#onLookPointerMove, { signal });
    canvas.addEventListener('pointerup', this.#onLookPointerUp, { signal });
    canvas.addEventListener('pointercancel', this.#onLookPointerUp, { signal });
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
      breakBlock: this.#breakBlockRequested,
      placeBlock: this.#placeBlockRequested,
      selectedBlock: this.#selectedBlock,
    };

    this.#lookDeltaX = 0;
    this.#lookDeltaY = 0;
    this.#jumpRequested = false;
    this.#cameraToggleRequested = false;
    this.#pauseToggleRequested = false;
    this.#breakBlockRequested = false;
    this.#placeBlockRequested = false;
    return command;
  }

  public dispose(): void {
    this.#abortController.abort();
    this.#keys.clear();
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
      } else if (event.code === 'Escape') {
        this.#pauseToggleRequested = true;
      } else if (event.code === 'KeyQ') {
        this.#breakBlockRequested = true;
      } else if (event.code === 'KeyE') {
        this.#placeBlockRequested = true;
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
    this.#touchActions.clear();
    this.#lookPointerId = null;
    this.#lookPointerDragged = false;
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  readonly #onLookPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      event.preventDefault();
      this.#placeBlockRequested = true;
      return;
    }
    if (this.#lookPointerId !== null) {
      return;
    }

    this.#lookPointerId = event.pointerId;
    this.#lookPointerX = event.clientX;
    this.#lookPointerY = event.clientY;
    this.#lookPointerStartX = event.clientX;
    this.#lookPointerStartY = event.clientY;
    this.#lookPointerDragged = false;
    this.#canvas.setPointerCapture(event.pointerId);
  };

  readonly #onLookPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#lookPointerId) {
      return;
    }

    this.#lookDeltaX += event.clientX - this.#lookPointerX;
    this.#lookDeltaY += event.clientY - this.#lookPointerY;
    this.#lookPointerX = event.clientX;
    this.#lookPointerY = event.clientY;

    if (
      Math.hypot(
        event.clientX - this.#lookPointerStartX,
        event.clientY - this.#lookPointerStartY,
      ) >= CLICK_DRAG_THRESHOLD_PX
    ) {
      this.#lookPointerDragged = true;
    }
  };

  readonly #onLookPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#lookPointerId) {
      return;
    }

    if (
      event.type === 'pointerup' &&
      event.pointerType === 'mouse' &&
      event.button === 0 &&
      !this.#lookPointerDragged
    ) {
      this.#breakBlockRequested = true;
    }
    this.#lookPointerId = null;
    this.#lookPointerDragged = false;
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
      } else if (action === 'toggle-pause') {
        this.#pauseToggleRequested = true;
      } else if (action === 'break-block') {
        this.#breakBlockRequested = true;
      } else {
        this.#placeBlockRequested = true;
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
