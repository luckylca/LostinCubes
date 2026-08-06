import { describe, expect, it } from 'vitest';
import {
  formatBuildLabel,
  parseDeploymentMarker,
} from '../src/buildInfo';

describe('build information', () => {
  it('parses deployment metadata and shortens the commit SHA', () => {
    const marker = parseDeploymentMarker({
      version: '0.2.0',
      build: '362',
      commit: 'ed60206b9a5cb88a8007ad546fc51b17cf50b73d',
      builtAt: '2026-08-06T15:00:00Z',
    });

    expect(marker).toEqual({
      version: '0.2.0',
      build: '362',
      commit: 'ed60206b',
      builtAt: '2026-08-06T15:00:00Z',
    });
    expect(marker === null ? '' : formatBuildLabel(marker)).toBe(
      'v0.2.0+362 · ed60206b',
    );
  });

  it('rejects incomplete deployment metadata', () => {
    expect(parseDeploymentMarker(null)).toBeNull();
    expect(parseDeploymentMarker({ version: '0.2.0' })).toBeNull();
    expect(
      parseDeploymentMarker({ version: '', build: '362', commit: 'abc' }),
    ).toBeNull();
  });
});
