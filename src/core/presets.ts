import type { FilterPreset } from './types';

export const PRESET_OPTIONS: Array<{ label: string; value: FilterPreset }> = [
  { label: '原图', value: 'original' },
  { label: '黑白', value: 'mono' },
  { label: '暖色', value: 'warm' },
  { label: '冷调', value: 'cool' },
  { label: '复古', value: 'vintage' },
  { label: '淡褪', value: 'fade' },
];

export const PRESET_FILTERS: Record<FilterPreset, string> = {
  original: 'none',
  mono: 'grayscale(1) contrast(1.08)',
  warm: 'sepia(0.18) saturate(1.16) brightness(1.03)',
  cool: 'saturate(1.08) hue-rotate(8deg) brightness(1.01)',
  vintage: 'sepia(0.36) contrast(0.95) brightness(1.05)',
  fade: 'contrast(0.92) brightness(1.08) saturate(0.88)',
};
