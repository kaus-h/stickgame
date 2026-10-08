import { describe, expect, it } from 'vitest';
import { vec2, type Vec2 } from '../../src/core';
import {
  causeText,
  FailureFeedback,
  LABEL_AFTER_REPEATS,
} from '../../src/render/feedback/FailureFeedback';
import type { SimEvent, SimSnapshot } from '../../src/sim';

const snap = (attemptTick: number, pos: Vec2, rope: { point: Vec2; tick: number } | null = null) =>
  ({
    attemptTick,
    player: { position: pos },
    rope: rope
      ? {
          anchor: 0,
          point: rope.point,
          length: 5,
          locked: true,
          taut: true,
          attachedTick: rope.tick,
        }
      : null,
  }) as unknown as SimSnapshot;

const death = (at: Vec2, solid = 'thorns-1'): SimEvent => ({
  type: 'death',
  tick: 0,
  cause: 'hazard',
  at,
  velocity: vec2(0, 0),
  solid,
  attemptTicks: 10,
  rope: null,
});

describe('FailureFeedback (GMR-43)', () => {
  it('keeps the previous attempt path and rope impacts after a death', () => {
    const f = new FailureFeedback();
    for (let t = 0; t < 10; t++)
      f.observe(snap(t, vec2(t, 0), t >= 5 ? { point: vec2(3, -4), tick: 5 } : null));
    f.onEvents([death(vec2(9, 0)), { type: 'reset', tick: 10 }]);
    f.observe(snap(0, vec2(0, 0)));
    expect(f.previous?.ended).toBe('death');
    expect(f.previous?.path).toHaveLength(10);
    expect(f.previous?.impacts).toEqual([vec2(3, -4)]);
  });

  it('the ghost replays the previous attempt in time with the current one', () => {
    const f = new FailureFeedback();
    for (let t = 0; t < 6; t++) f.observe(snap(t, vec2(t * 2, 1)));
    f.onEvents([death(vec2(10, 1))]);
    f.observe(snap(0, vec2(0, 0)));
    expect(f.ghostAt(3)).toEqual(vec2(6, 1));
    expect(f.ghostAt(99)).toBeNull();
  });

  it('fills skipped ticks so ghost timing matches the attempt clock', () => {
    const f = new FailureFeedback();
    f.observe(snap(0, vec2(0, 0)));
    f.observe(snap(4, vec2(4, 0))); // a slow frame advanced 4 ticks
    f.onEvents([death(vec2(4, 0))]);
    expect(f.previous?.path).toHaveLength(5);
  });

  it('labels the cause only after repeated deaths at the same spot', () => {
    const f = new FailureFeedback();
    for (let i = 0; i < LABEL_AFTER_REPEATS - 1; i++) {
      f.observe(snap(0, vec2(0, 0)));
      f.observe(snap(1, vec2(1, 0)));
      f.onEvents([death(vec2(20 + i * 0.3, 5))]);
    }
    expect(f.label()).toBeNull();
    f.observe(snap(0, vec2(0, 0)));
    f.observe(snap(1, vec2(1, 0)));
    f.onEvents([death(vec2(20.5, 5))]);
    expect(f.label()).toEqual({ text: 'spikes!', at: vec2(20.5, 5) });
    // A death somewhere else starts a new streak.
    f.onEvents([death(vec2(40, 5))]);
    expect(f.label()).toBeNull();
  });

  it('an exit clears the death streak and records the attempt', () => {
    const f = new FailureFeedback();
    f.observe(snap(0, vec2(0, 0)));
    f.observe(snap(1, vec2(1, 0)));
    f.onEvents([{ type: 'exit', tick: 1, attemptTicks: 1 }]);
    expect(f.previous?.ended).toBe('exit');
    expect(f.label()).toBeNull();
  });

  it('writes causes the way a margin note would', () => {
    expect(causeText('out-of-bounds', null)).toBe('fell off the page');
    expect(causeText('hazard', 'lethal-floor')).toBe('red ink = danger');
    expect(causeText('hazard', 'thorns-2')).toBe('spikes!');
  });
});
