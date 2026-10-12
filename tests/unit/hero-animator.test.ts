import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import { HeroAnimator } from '../../src/render/hero/animator';

const DT = 1 / 60;

describe('hero animator (GMR-69)', () => {
  it('picks the head from the state: front idle, profile moving, three-quarter swinging', () => {
    const a = new HeroAnimator();
    expect(a.step({ mode: 'grounded', velocity: vec2(0, 0), rope: null }, DT).head).toBe('front');
    expect(a.step({ mode: 'grounded', velocity: vec2(6, 0), rope: null }, DT).head).toBe('profile');
    expect(a.step({ mode: 'air', velocity: vec2(3, 5), rope: null }, DT).head).toBe('profile');
    const swing = a.step({ mode: 'tethered', velocity: vec2(5, 0), rope: vec2(2, -4) }, DT);
    expect(swing.state).toBe('swing');
    expect(swing.head).toBe('three-quarter');
  });

  it('squashes on a hard landing and springs back within a quarter second', () => {
    const a = new HeroAnimator();
    a.step({ mode: 'air', velocity: vec2(0, 14), rope: null }, DT);
    const land = a.step({ mode: 'grounded', velocity: vec2(0, 0), rope: null }, DT);
    expect(land.sy).toBeLessThan(0.85);
    expect(land.sx).toBeGreaterThan(1.05);
    let last = land;
    for (let i = 0; i < 15; i++)
      last = a.step({ mode: 'grounded', velocity: vec2(0, 0), rope: null }, DT);
    expect(Math.abs(1 - last.sy)).toBeLessThan(0.01);
  });

  it('stretches on take-off', () => {
    const a = new HeroAnimator();
    a.step({ mode: 'grounded', velocity: vec2(0, 0), rope: null }, DT);
    const jump = a.step({ mode: 'air', velocity: vec2(0, -12.5), rope: null }, DT);
    expect(jump.sy).toBeGreaterThan(1.05);
  });

  it('leans along the rope while swinging, eased and capped', () => {
    const a = new HeroAnimator();
    let pose = a.step({ mode: 'tethered', velocity: vec2(0, 0), rope: vec2(2, -4) }, DT);
    for (let i = 0; i < 60; i++)
      pose = a.step({ mode: 'tethered', velocity: vec2(0, 0), rope: vec2(2, -4) }, DT);
    expect(pose.lean).toBeCloseTo(Math.atan2(2, 4), 2);
    for (let i = 0; i < 60; i++)
      pose = a.step({ mode: 'tethered', velocity: vec2(0, 0), rope: vec2(10, 0.1) }, DT);
    expect(pose.lean).toBeLessThanOrEqual(0.75 + 1e-9);
  });

  it('reset drops any carried squash and lean', () => {
    const a = new HeroAnimator();
    a.step({ mode: 'air', velocity: vec2(0, 20), rope: null }, DT);
    a.reset();
    const pose = a.step({ mode: 'grounded', velocity: vec2(0, 0), rope: null }, DT);
    expect(pose.sy).toBe(1);
    expect(pose.lean).toBe(0);
  });
});
