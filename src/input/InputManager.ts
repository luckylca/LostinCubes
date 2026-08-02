import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';

type HeldAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'sprint';

type EdgeAction = 'jump' | 'toggle-camera' | 'toggle-pause';

const GAMEPLAY_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyV',
  'Escape',
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
  return ['jump', 'toggle-camera', 'toggle-pause'].includes(value);
}

export class InputManager {
  readonly #canvas: HTMLCanvasElement;
  readonly #abortController = new AbortController();
  readonly #keys = new Set<string>();
  readonly #touchActions = new Set<HeldAction>();
  #lookPointerId: number | null = null;
  #lookPointerX = 0;
  #lookPointerY = 0;
  #lookDeltaX = 0;
  #lookDeltaY = 0;
  #jumpRequested = false;
  #cameraToggleRequested = false;
  #pauseToggleRequested = false;

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

    if (touchRoot !== null) {
      const buttons = touchRoot.querySelectorAll<HTMLElement>('[data-action]');
      for (const button of buttons) {
        button.addEventListener('pointerdown', this.#onTouchButtonDown, { signal });
        button.addEventListener('pointerup', this.#onTouchButtonUp, { signal });
        button.addEventListener('pointercancel', this.#onTouchButtonUp, { signal });
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
    };

    this.#lookDeltaX = 0;
    this.#lookDeltaY = 0;
    this.#jumpRequested = false;
    this.#cameraToggleRequested = false;
    this.#pauseToggleRequested = false;
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
  };

  readonly #onLookPointerDown = (event: PointerEvent): void => {
    if (this.#lookPointerId !== null) {
      return;
    }

    this.#lookPointerId = event.pointerId;
    this.#lookPointerX = event.clientX;
    this.#lookPointerY = event.clientY;
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
  };

  readonly #onLookPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.#lookPointerId) {
      this.#lookPointerId = null;
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
