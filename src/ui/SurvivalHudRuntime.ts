import type { PlayerState } from '../game/session/GameSession';

let lastText = '';
let lastEnvironment = '';

function getStatusElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('#survival-environment-status');
}

function environmentLabel(player: PlayerState): string {
  if (player.inLava) return '岩浆';
  if (player.submerged) return '水下';
  if (player.inWater) return '水中';
  if (player.onLadder) return '攀爬';
  if (player.sneaking) return '潜行';
  return '陆地';
}

/** Keeps the survival HUD compact and avoids rebuilding DOM every frame. */
export function syncSurvivalHud(
  player: PlayerState,
  biomeLabel: string,
): void {
  if (typeof document === 'undefined') return;
  const environment = environmentLabel(player);
  const airLabel =
    player.airSupply < player.maximumAirSupply || player.submerged
      ? ` · 氧气 ${String(player.airSupply)}/${String(player.maximumAirSupply)}`
      : '';
  const text = `${biomeLabel} · ${environment}${airLabel}`;
  const element = getStatusElement();
  if (element !== null && text !== lastText) {
    element.textContent = text;
    lastText = text;
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (canvas !== null) {
    canvas.dataset.biome = biomeLabel;
    canvas.dataset.environment = environment;
    canvas.dataset.playerAir = String(player.airSupply);
  }

  if (environment !== lastEnvironment) {
    document.body.dataset.playerEnvironment = environment;
    document.body.classList.toggle('player-underwater', player.submerged);
    document.body.classList.toggle('player-in-lava', player.inLava);
    lastEnvironment = environment;
  }
}
