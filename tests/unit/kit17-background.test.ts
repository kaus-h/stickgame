import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({}));

import { kit17LayerSurfacePixels, kit17ParallaxOffset } from '../../src/render/kit/Kit17Background';

describe('kit 0017 background', () => {
  it('uses the same viewport-sized surface regardless of world zoom', () => {
    // The rendered strip width is fixed to the viewport; overview zoom changes only the object
    // transform, not the backing surface allocation.
    const pixels = kit17LayerSurfacePixels(800, 1024, 83);
    expect(pixels).toBe(800 * (800 / 1024) * 83);
  });

  it('moves each scenery layer at its camera-relative rate and freezes reduced motion', () => {
    expect(kit17ParallaxOffset(1200, 0.5, 0.08, false, 0)).toBe(48);
    expect(kit17ParallaxOffset(1200, 0.5, 0.16, false, 0)).toBe(96);
    expect(kit17ParallaxOffset(1200, 0.5, 0.28, false, 0)).toBeCloseTo(168);
    expect(kit17ParallaxOffset(1800, 0.5, 0.28, true, 168)).toBe(168);
  });
});
