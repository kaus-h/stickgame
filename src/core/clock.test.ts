import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './clock';

const policy = { dt: 1 / 60, maxStepsPerFrame: 5, maxFrameDelta: 0.25 };

describe('FixedStepClock', () => {
  it('runs one step per 1/60 s frame', () => {
    const clock = new FixedStepClock(policy);
    for (let i = 0; i < 10; i++) expect(clock.advance(1 / 60).steps).toBe(1);
  });

  it('runs two steps per 1/30 s frame and accumulates high-refresh frames', () => {
    const clock = new FixedStepClock(policy);
    expect(clock.advance(1 / 30).steps).toBe(2);

    const fast = new FixedStepClock(policy);
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += fast.advance(1 / 144).steps;
    expect(steps).toBe(60);
  });

  it('reports interpolation alpha in [0, 1)', () => {
    const clock = new FixedStepClock(policy);
    const { steps, alpha } = clock.advance(1.5 / 60);
    expect(steps).toBe(1);
    expect(alpha).toBeCloseTo(0.5, 9);
  });

  it('caps steps per frame and drops the excess instead of spiralling', () => {
    const clock = new FixedStepClock(policy);
    const result = clock.advance(0.2);
    expect(result.steps).toBe(5);
    expect(result.droppedSeconds).toBeCloseTo(0.2 - 5 / 60, 9);
    expect(clock.advance(1 / 60).steps).toBe(1);
  });

  it('clamps huge frame deltas', () => {
    const clock = new FixedStepClock(policy);
    const result = clock.advance(10);
    expect(result.steps).toBe(5);
    expect(result.droppedSeconds).toBeCloseTo(10 - 5 / 60, 9);
  });
});
