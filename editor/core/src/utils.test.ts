import { describe, expect, it } from 'vitest';
import { clampViewportOffset } from './utils';

describe('clampViewportOffset', () => {
  it('allows small images to move within the blank margin', () => {
    expect(clampViewportOffset(240, 400, 1000)).toBe(240);
    expect(clampViewportOffset(360, 400, 1000)).toBe(300);
    expect(clampViewportOffset(-360, 400, 1000)).toBe(-300);
  });

  it('keeps oversized images bounded after zooming in', () => {
    expect(clampViewportOffset(80, 1200, 1000)).toBe(80);
    expect(clampViewportOffset(160, 1200, 1000)).toBe(100);
    expect(clampViewportOffset(-160, 1200, 1000)).toBe(-100);
  });
});
