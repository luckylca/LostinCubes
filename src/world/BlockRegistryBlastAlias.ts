import { getBlockDefinition } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

declare module './BlockRegistry' {
  interface BlockDefinition {
    readonly resistance: number;
  }
}

/**
 * Keeps the unified explosion layer compatible with the established block
 * registry while using the same underlying classic blast-resistance value.
 */
export function installBlockRegistryBlastAlias(): void {
  for (const block of Object.values(BlockType) as BlockTypeValue[]) {
    const definition = getBlockDefinition(block);
    if (Object.hasOwn(definition, 'resistance')) continue;
    Object.defineProperty(definition, 'resistance', {
      configurable: false,
      enumerable: false,
      get: () => definition.blastResistance,
    });
  }
}
