export type QualityLevel = 'low' | 'medium' | 'high' | 'auto';

export interface QualitySettings {
  readonly renderScale: number;
  readonly chunkViewDistance: number;
  readonly shadowsEnabled: boolean;
  readonly particleScale: number;
}

const QUALITY_PRESETS: Readonly<Record<Exclude<QualityLevel, 'auto'>, QualitySettings>> = {
  low: {
    renderScale: 0.75,
    chunkViewDistance: 4,
    shadowsEnabled: false,
    particleScale: 0.35,
  },
  medium: {
    renderScale: 0.9,
    chunkViewDistance: 6,
    shadowsEnabled: true,
    particleScale: 0.65,
  },
  high: {
    renderScale: 1,
    chunkViewDistance: 9,
    shadowsEnabled: true,
    particleScale: 1,
  },
};

export function resolveQualitySettings(
  level: QualityLevel,
  hardwareConcurrency = navigator.hardwareConcurrency,
): QualitySettings {
  if (level !== 'auto') {
    return QUALITY_PRESETS[level];
  }
  return hardwareConcurrency <= 4 ? QUALITY_PRESETS.low : QUALITY_PRESETS.medium;
}
