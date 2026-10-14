import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../core';
import { resolvePointTarget, resolveTarget, neutralCandidates } from './targeting';
import type { RopeTuning } from './tuning';

const rope: RopeTuning = {
  minLength: 0.8,
  maxLength: 11,
  selectRadius: 1.1,
  steerAccel: 6,
  steerEnergyHeight: 0.6,
  catchRetention: 1,
};
const hero = vec2(0, 0);
const anchors = [
  { position: vec2(4, -4), radius: 0.4 },
  { position: vec2(5, -4), radius: 0.4 },
  { position: vec2(-2, -2), radius: 0.4 },
];
const clear = () => null;

describe('Targeting v2', () => {
  it.each(['standard', 'wide-select', 'snap'] as const)('attaches to the centre on %s', (mode) => {
    const hit = resolveTarget(hero, vec2(4.2, -4), anchors, rope, clear, {
      mode,
      wideSelectRadius: 1.8,
      snapRadius: 2.6,
    });
    expect(hit).toMatchObject({ valid: true, impact: vec2(4, -4), offset: vec2(0, 0) });
    expect(hit.distance).toBe(distance(hero, (anchors[0] as (typeof anchors)[number]).position));
  });
  it('mouse keeps its target inside the margin but a clear miss stays invalid', () => {
    expect(resolveTarget(hero, vec2(4.7, -4), anchors, rope, clear, undefined, 0).anchor).toBe(0);
    expect(resolveTarget(hero, vec2(4.8, -4), anchors, rope, clear, undefined, 0).anchor).toBe(1);
    expect(resolveTarget(hero, vec2(9, 5), anchors, rope, clear, undefined, 0).valid).toBe(false);
  });
  it('uses the nearest centre, even when a larger disc is farther away', () => {
    const list = [
      { position: vec2(3, -4), radius: 2 },
      { position: vec2(4, -4), radius: 0.2 },
    ];
    expect(resolveTarget(hero, vec2(4, -4), list, rope, clear).anchor).toBe(1);
  });
  it('points rather than cycles and neutral prefers ahead and above', () => {
    expect(resolvePointTarget(hero, vec2(-1, -1), 1, anchors, rope, clear).anchor).toBe(2);
    expect(resolvePointTarget(hero, vec2(0, 0), 1, anchors, rope, clear).anchor).toBe(0);
    expect(resolvePointTarget(hero, vec2(0, 0), -1, anchors, rope, clear).anchor).toBe(2);
    expect(neutralCandidates(hero, 1, anchors, rope, clear).map((t) => t.anchor)).toEqual([0, 1]);
  });
  it('falls back to nearest in range and skips blocked/off anchors', () => {
    const list = [
      { position: vec2(-2, 2), radius: 0.4 },
      { position: vec2(-3, 3), radius: 0.4 },
    ];
    expect(resolvePointTarget(hero, vec2(0, 0), 1, list, rope, clear).anchor).toBe(0);
    const ray = (_from: unknown, to: { x: number }) => (to.x === -2 ? { distance: 1 } : null);
    expect(resolvePointTarget(hero, vec2(-1, 1), 1, list, rope, ray as never).anchor).toBe(1);
    expect(
      resolvePointTarget(
        hero,
        vec2(1, -1),
        1,
        [
          { ...(anchors[0] as (typeof anchors)[number]), usable: false },
          anchors[1] as (typeof anchors)[number],
        ],
        rope,
        clear,
      ).anchor,
    ).toBe(1);
  });
  it('a slow stick sweep does not flicker, switching only at a 12 degree advantage', () => {
    const list = [
      { position: vec2(5, 0), radius: 0.4 },
      { position: vec2(4.330127018922193, -2.5), radius: 0.4 },
    ];
    let previous = 0;
    const picks: number[] = [];
    for (let degrees = 0; degrees <= 30; degrees++) {
      const radians = (degrees * Math.PI) / 180;
      const result = resolvePointTarget(
        hero,
        vec2(Math.cos(radians), -Math.sin(radians)),
        1,
        list,
        rope,
        clear,
        previous,
      );
      if (result.valid) previous = result.anchor;
      picks.push(previous);
    }
    expect(picks.slice(0, 21).every((i) => i === 0)).toBe(true);
    expect(picks.slice(22).every((i) => i === 1)).toBe(true);
    for (const degrees of [20, 22, 20, 22, 20]) {
      const radians = (degrees * Math.PI) / 180;
      expect(
        resolvePointTarget(
          hero,
          vec2(Math.cos(radians), -Math.sin(radians)),
          1,
          list,
          rope,
          clear,
          previous,
        ).anchor,
      ).toBe(1);
    }
  });
  it('neutral holds until the distance advantage reaches half a metre', () => {
    const list = [
      { position: vec2(4, -3), radius: 0.4 },
      { position: vec2(3.8, -3), radius: 0.4 },
    ];
    expect(resolvePointTarget(hero, vec2(0, 0), 1, list, rope, clear, 0).anchor).toBe(0);
    expect(
      resolvePointTarget(
        hero,
        vec2(0, 0),
        1,
        [list[0] as (typeof list)[number], { position: vec2(2, -3), radius: 0.4 }],
        rope,
        clear,
        0,
      ).anchor,
    ).toBe(1);
  });
});
