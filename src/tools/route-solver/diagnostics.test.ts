import { describe, expect, it } from 'vitest';
import { vec2 } from '../../core';
import type { RopeTuning } from '../../sim';
import { neutralAmbiguityNote } from './diagnostics';

const rope: RopeTuning = {
  minLength: 0.8,
  maxLength: 11,
  selectRadius: 1.1,
  stickinessDistance: 0.5,
  steerAccel: 6,
  steerEnergyHeight: 0.6,
  catchRetention: 1,
};
const anchors = [
  { position: vec2(4, -3), radius: 0.4 },
  { position: vec2(4.2, -3), radius: 0.4 },
  { position: vec2(-1, -1), radius: 0.4 },
];
const ids = ['ahead', 'alternative', 'behind'];

describe('route solver neutral-target diagnostics', () => {
  it('notes valid preferred alternatives inside the stickiness margin on a rope press', () => {
    expect(neutralAmbiguityNote(42, vec2(0, 0), 1, anchors, ids, rope, () => null)).toBe(
      'Rope press tick 42: neutral-default anchor ahead has alternatives alternative within the 0.5 m stickiness margin.',
    );
  });

  it('excludes closer anchors outside the preferred pool, blocked anchors and spent anchors', () => {
    const blocked = (_from: unknown, to: { x: number }) =>
      to.x === 4.2 ? { distance: 1, point: vec2(1, 0), normal: vec2(-1, 0) } : null;
    expect(neutralAmbiguityNote(42, vec2(0, 0), 1, anchors, ids, rope, blocked)).toBeNull();
    expect(
      neutralAmbiguityNote(
        42,
        vec2(0, 0),
        1,
        [anchors[0]!, { ...anchors[1]!, usable: false }, anchors[2]!],
        ids,
        rope,
        () => null,
      ),
    ).toBeNull();
  });

  it('uses the all-valid fallback pool and ignores candidates outside the margin', () => {
    const fallback = [
      { position: vec2(-4, 3), radius: 0.4 },
      { position: vec2(-4.2, 3), radius: 0.4 },
      { position: vec2(-7, 3), radius: 0.4 },
    ];
    expect(neutralAmbiguityNote(42, vec2(0, 0), 1, fallback, ids, rope, () => null)).toContain(
      'alternatives alternative within',
    );
  });
});
