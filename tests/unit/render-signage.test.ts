import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import { anchorInReach, easeAlpha } from '../../src/render/reach';
import { exitSpec, speedStreaks } from '../../src/render/exit';

describe('anchor reach cue (GMR-56)', () => {
  it('counts the nearest point of the disc, not the centre', () => {
    expect(anchorInReach(vec2(0, 0), vec2(11.3, 0), 0.4, 11)).toBe(true);
    expect(anchorInReach(vec2(0, 0), vec2(11.5, 0), 0.4, 11)).toBe(false);
  });

  it('eases toward the target without overshooting', () => {
    expect(easeAlpha(0.4, 1, 0.05)).toBeCloseTo(0.6);
    expect(easeAlpha(0.95, 1, 0.05)).toBe(1);
    expect(easeAlpha(1, 0.4, 1)).toBe(0.4);
  });
});

describe('exit speed streaks (GMR-56)', () => {
  it('maps speed windows to 0, 1 or 3 streaks', () => {
    expect(speedStreaks(undefined)).toBe(0);
    expect(speedStreaks({ min: 3, max: 8 })).toBe(0); // 1-2 slot: arrive at run speed
    expect(speedStreaks({ min: 20, max: 28 })).toBe(3); // 1-3 shaft: come in hot
    expect(speedStreaks({ min: 6, max: 14 })).toBe(1);
  });

  it('spells the windows out for the debug overlay only', () => {
    expect(exitSpec(undefined)).toBe('exit none');
  });
});
