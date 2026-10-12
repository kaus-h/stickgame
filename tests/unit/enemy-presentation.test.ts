import { describe, expect, it } from 'vitest';
import { metersToPixels as m, vec2 } from '../../src/core';
import { goonSeed, patrollerMarks, SAFE_TOP_BAND, STROKE_REACH } from '../../src/render/enemy';
import { causeText } from '../../src/render/feedback/causeText';

describe('patroller presentation', () => {
  const sizes = [vec2(1.2, 1), vec2(1.8, 1), vec2(2, 1), vec2(0.8, 0.8)];

  it('keeps all rendered ink inside the authored collision box, for any walk phase', () => {
    for (const size of sizes)
      for (const facing of [-1, 1])
        for (const stride of [0, 0.1, 0.37, 2.5]) {
          const k = patrollerMarks(vec2(3, 4), size, facing, goonSeed('g1'), stride);
          // Rendered ink, not centrelines: every point sits at least the widest half-stroke inside.
          const reach = k.line * STROKE_REACH - 1e-6;
          const minX = m(3 - size.x / 2) + reach;
          const maxX = m(3 + size.x / 2) - reach;
          const minY = m(4 - size.y / 2) + reach;
          const maxY = m(4 + size.y / 2) - reach;
          const pts = [
            ...k.body,
            ...k.back,
            ...k.red.flat(),
            ...k.legs.flatMap((s) => [s.a, s.b]),
            ...k.bristles.flatMap((s) => [s.a, s.b]),
            ...k.eyes.flatMap((s) => [s.a, s.b]),
          ];
          for (const p of pts) {
            expect(p.x).toBeGreaterThanOrEqual(minX);
            expect(p.x).toBeLessThanOrEqual(maxX);
            expect(p.y).toBeGreaterThanOrEqual(minY);
            expect(p.y).toBeLessThanOrEqual(maxY);
          }
        }
  });

  it('red stays off the safe top band: the back is ink only (GMR-56 H1)', () => {
    for (const size of sizes) {
      const k = patrollerMarks(vec2(0, 0), size, 1, 7, 0);
      const band = k.box.y + k.box.h * SAFE_TOP_BAND;
      expect(k.red.length).toBeGreaterThan(1);
      for (const p of k.red.flat()) expect(p.y).toBeGreaterThan(band);
    }
  });

  it('legs step only when the goon moves, and each goon is drawn a little differently', () => {
    const small = vec2(1.2, 1);
    const still = patrollerMarks(vec2(0, 0), small, 1, 7, 1);
    expect(patrollerMarks(vec2(0, 0), small, 1, 7, 1)).toEqual(still);
    expect(patrollerMarks(vec2(0, 0), small, 1, 7, 1.2).legs).not.toEqual(still.legs);
    expect(goonSeed('g1')).not.toBe(goonSeed('g2'));
  });

  it('adds enemy cause without changing the existing GMR-43 cause-text contract', () => {
    expect(causeText('enemy-contact', null)).toBe('goon contact — aim for the flat top');
    expect(causeText('out-of-bounds', null)).toBe('fell off the page');
    expect(causeText('hazard', 'thorn-a')).toBe('spikes!');
    expect(causeText('hazard', 'lava-floor')).toBe('red ink = danger');
    expect(causeText('hazard', null)).toBe('touched red ink');
  });
});
