import {
  EntityRegistry,
  type EntitySnapshot,
  type SpawnEntityOptions,
} from './EntityRegistry';

const MINIMUM_ARROW_SPEED = 7;
const MAXIMUM_ARROW_SPEED = 20;
const PENDING_CHARGE_LIFETIME_MILLISECONDS = 300;
let pendingCharge: number | null = null;
let pendingChargeAt = 0;
let installed = false;

function clamp01(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}

/** Queues charge for the player arrow spawned by the current input release. */
export function queuePlayerBowCharge(power: number): void {
  pendingCharge = clamp01(power);
  pendingChargeAt = performance.now();
}

function consumeCharge(): number | null {
  if (pendingCharge === null) return null;
  const age = performance.now() - pendingChargeAt;
  const result = age <= PENDING_CHARGE_LIFETIME_MILLISECONDS ? pendingCharge : null;
  pendingCharge = null;
  return result;
}

function chargedArrowOptions(
  options: SpawnEntityOptions,
  power: number,
): SpawnEntityOptions {
  const velocity = options.velocity;
  if (velocity === undefined) return options;
  const currentSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (currentSpeed <= 0.001) return options;

  const speed =
    MINIMUM_ARROW_SPEED +
    (MAXIMUM_ARROW_SPEED - MINIMUM_ARROW_SPEED) * power;
  const scale = speed / currentSpeed;
  const baseDamage = Math.max(Number(options.state?.damage ?? 1), 1);
  const damageScale = 0.35 + power * 0.65;

  return {
    ...options,
    velocity: {
      x: velocity.x * scale,
      y: velocity.y * scale,
      z: velocity.z * scale,
    },
    state: {
      ...(options.state ?? {}),
      damage: Math.max(1, Math.round(baseDamage * damageScale)),
      bowCharge: power,
    },
  };
}

/**
 * Keeps ClassicEntityManager's projectile lifecycle intact while making the
 * next player-owned arrow use the charge captured by the input layer. Skeleton
 * arrows are untouched. The pending value expires quickly so a blocked shot
 * cannot leak its charge into a later click.
 */
export function installBowBallisticsRuntime(): void {
  if (installed) return;
  installed = true;

  // The wrapper intentionally preserves the EntityRegistry receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalSpawn = EntityRegistry.prototype.spawn;
  EntityRegistry.prototype.spawn = function chargedSpawn(
    options: SpawnEntityOptions,
  ): EntitySnapshot | null {
    if (options.kind !== 'arrow' || options.ownerId !== 'player') {
      return originalSpawn.call(this, options);
    }
    const charge = consumeCharge();
    return originalSpawn.call(
      this,
      charge === null ? options : chargedArrowOptions(options, charge),
    );
  };
}
