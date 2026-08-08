import type { PlayerInputCommand } from '../game/commands/PlayerInputCommand';
import { InputManager } from './InputManager';

interface BowChargeState {
  startedAt: number | null;
}

const STATES = new WeakMap<InputManager, BowChargeState>();
const MINIMUM_CHARGE_SECONDS = 0.12;
const FULL_CHARGE_SECONDS = 1;
let installed = false;
let indicator: HTMLElement | null = null;

function getCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('#game-canvas');
}

function chargePower(seconds: number): number {
  const t = Math.min(Math.max(seconds / FULL_CHARGE_SECONDS, 0), 1);
  // Smooth low-power start and a clear payoff near full draw.
  return Math.min((t * t + 2 * t) / 3, 1);
}

function getIndicator(): HTMLElement {
  if (indicator !== null) return indicator;
  const element = document.createElement('div');
  element.id = 'bow-charge-indicator';
  element.hidden = true;
  element.innerHTML = '<span>蓄力</span><div><i></i></div><strong>0%</strong>';
  document.querySelector('#app')?.append(element);
  indicator = element;
  return element;
}

function renderCharge(power: number, visible: boolean): void {
  const element = getIndicator();
  element.hidden = !visible;
  const fill = element.querySelector<HTMLElement>('i');
  const label = element.querySelector<HTMLElement>('strong');
  if (fill !== null) fill.style.scale = `${power.toFixed(4)} 1`;
  if (label !== null) label.textContent = `${String(Math.round(power * 100))}%`;
  const canvas = getCanvas();
  if (canvas !== null) canvas.dataset.bowCharge = power.toFixed(4);
}

function cancel(state: BowChargeState): void {
  state.startedAt = null;
  renderCharge(0, false);
}

/**
 * Converts the existing bow edge-trigger into a held draw gesture without
 * changing block-breaking input. GameApp still owns ammo/durability and only
 * sees one synthetic attack edge when the player releases a valid draw.
 */
export function installBowChargeInputRuntime(): void {
  if (installed) return;
  installed = true;

  const originalPoll = InputManager.prototype.poll;
  InputManager.prototype.poll = function chargedBowPoll(
    issuedAtTick: number,
  ): PlayerInputCommand {
    const command = originalPoll.call(this, issuedAtTick);
    const state = STATES.get(this) ?? { startedAt: null };
    STATES.set(this, state);
    const canvas = getCanvas();
    const bowSelected = canvas?.dataset.heldItem === 'bow';
    const hasBlockTarget = canvas?.dataset.hasTarget === 'true';
    const inventoryOpen = canvas?.dataset.inventoryOpen === 'true';

    if (!bowSelected || hasBlockTarget || inventoryOpen) {
      if (state.startedAt !== null) cancel(state);
      return command;
    }

    const now = performance.now();
    if (command.breakBlock) {
      state.startedAt ??= now;
      const seconds = Math.max((now - state.startedAt) / 1000, 0);
      renderCharge(chargePower(seconds), true);
      return { ...command, breakBlock: false };
    }

    if (state.startedAt === null) return command;
    const seconds = Math.max((now - state.startedAt) / 1000, 0);
    const power = chargePower(seconds);
    state.startedAt = null;
    renderCharge(0, false);
    if (seconds < MINIMUM_CHARGE_SECONDS) return command;

    // GameApp interprets this single release pulse as the normal bow shot.
    // Preserve charge power on the canvas for presentation/diagnostics.
    if (canvas !== null) canvas.dataset.lastBowCharge = power.toFixed(4);
    return { ...command, breakBlock: true };
  };
}
