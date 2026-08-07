import type { WorldMetadata } from './WorldCatalog';

let activeWorld: WorldMetadata | null = null;

export function setActiveRuntimeWorld(world: WorldMetadata): void {
  activeWorld = { ...world };
}

export function clearActiveRuntimeWorld(): void {
  activeWorld = null;
}

export function getActiveRuntimeWorld(): WorldMetadata | null {
  return activeWorld === null ? null : { ...activeWorld };
}

/**
 * Existing gameplay systems still receive the original world string. Routing
 * through this helper lets the multi-world UI land without rewriting every
 * constructor at once, while tests and non-browser callers keep their input.
 */
export function resolveRuntimeWorldId(fallback: string): string {
  return activeWorld?.id ?? fallback;
}

export function resolveRuntimeWorldSeed(fallback: string): string {
  return activeWorld?.seed ?? fallback;
}
