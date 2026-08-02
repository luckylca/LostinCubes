import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../src/app/AppConfig';

describe('APP_CONFIG', () => {
  it('uses the GitHub Pages repository subpath', () => {
    expect(APP_CONFIG.githubPagesBasePath).toBe('/LostinCubes/');
  });

  it('uses a deterministic default seed', () => {
    expect(APP_CONFIG.defaultWorldSeed).toBe('root-fragment-01');
  });
});
