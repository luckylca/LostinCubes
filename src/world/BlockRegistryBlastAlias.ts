import { getBlockDefinition } from './BlockRegistry';
import { BlockType } from './BlockType';
import type { BlockType as BlockTypeValue } from './BlockType';

type BlastAliasDefinition = ReturnType<typeof getBlockDefinition> & {
  readonly resistance: number;
};

/**
 * Keeps the new entity/explosion layer compatible while it is being integrated
 * with the established block registry. The alias is installed on the existing
 * immutable-style definition objects and always mirrors `blastResistance`.
 */
export function installBlockRegistryBlastAlias(): void {
  for (const block of Object.values(BlockType) as BlockTypeValue[]) {
    const definition = getBlockDefinition(block) as BlastAliasDefinition;
    if (Object.hasOwn(definition, 'resistance')) continue;
    Object.defineProperty(definition, 'resistance', {
      configurable: false,
      enumerable: false,
      get: () => definition.blastResistance,
    });
  }
}
