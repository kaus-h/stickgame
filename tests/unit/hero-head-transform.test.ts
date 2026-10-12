import { describe, expect, it } from 'vitest';
import { metersToPixels as m } from '../../src/core';
import {
  HEAD_LEAN_FOLLOW,
  HERO_ART_SCALE,
  heroHeadTransform,
  type HeroPose,
} from '../../src/render/hero/drawHero';

const pose = (anim?: HeroPose['anim'], facing: -1 | 1 = 1): HeroPose => ({
  c: { x: 500, y: 300 },
  facing,
  velocity: { x: 0, y: 0 },
  mode: 'grounded',
  hand: null,
  time: 0,
  line: 1,
  ...(anim ? { anim } : {}),
});

/** The body transform drawHero applies to a local point: scale and squash, then lean, about the feet. */
function body(p: HeroPose, x: number, y: number): { x: number; y: number } {
  const a = p.anim ?? { sx: 1, sy: 1, lean: 0 };
  const feet = { x: p.c.x, y: p.c.y + m(0.35) };
  const lx = (x - feet.x) * HERO_ART_SCALE * a.sx;
  const ly = (y - feet.y) * HERO_ART_SCALE * a.sy;
  return {
    x: feet.x + lx * Math.cos(a.lean) - ly * Math.sin(a.lean),
    y: feet.y + lx * Math.sin(a.lean) + ly * Math.cos(a.lean),
  };
}

describe('hero head sprite transform (GMR-69)', () => {
  it.each([
    { sx: 1, sy: 1, lean: 0 },
    { sx: 1.15, sy: 0.75, lean: 0 },
    { sx: 0.9, sy: 1.16, lean: 0.4 },
    { sx: 1, sy: 1, lean: -0.75 },
  ])(
    'puts the head centre exactly where the body transform puts the neck-top ($sx, $sy, $lean)',
    (a) => {
      for (const facing of [1, -1] as const) {
        const p = pose({ state: 'swing', head: 'three-quarter', ...a }, facing);
        const t = heroHeadTransform(p);
        const expected = body(p, p.c.x + facing * m(0.01), p.c.y - m(0.13));
        expect(t.x).toBeCloseTo(expected.x, 9);
        expect(t.y).toBeCloseTo(expected.y, 9);
      }
    },
  );

  it('scales the head uniformly by the area change and damps its turn (art ruling)', () => {
    const rest = heroHeadTransform(pose());
    const squashed = heroHeadTransform(
      pose({ state: 'idle', head: 'front', sx: 1.2, sy: 0.7, lean: 0.5 }),
    );
    expect(squashed.size / rest.size).toBeCloseTo(Math.sqrt(1.2 * 0.7), 9);
    expect(squashed.rotation).toBeCloseTo(0.5 * HEAD_LEAN_FOLLOW, 9);
  });
});
