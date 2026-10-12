import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
vi.mock('phaser', () => ({}));
import {
  PageTurn,
  PAGE_TURN_SECONDS,
  PAGE_FADE_SECONDS,
  pageTurnEase,
  pageTurnGeometry,
  reflectInFold,
} from '../../src/render/living/pageTurn';

function harness(reduced = false) {
  const g = new Proxy({}, { get: (_target, key) => (key === 'destroy' ? destroy : () => g) });
  const destroy = vi.fn();
  const scene = {
    add: { graphics: () => g },
    scale: { width: 960, height: 540 },
  } as unknown as Phaser.Scene;
  return { turn: new PageTurn(scene, reduced, false), destroy };
}

describe('accepted-exit page turn', () => {
  it('eases monotonically from zero to one with a slow thumb lift and soft settle', () => {
    expect(pageTurnEase(0)).toBe(0);
    expect(pageTurnEase(1)).toBe(1);
    expect(pageTurnEase(-1)).toBe(0);
    expect(pageTurnEase(2)).toBe(1);
    expect(pageTurnEase(0.25)).toBeLessThan(0.1);
    let last = 0;
    for (let i = 0; i <= 1000; i++) {
      const p = pageTurnEase(i / 1000);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
    expect(pageTurnEase(0.99) - pageTurnEase(0.98)).toBeLessThan(
      pageTurnEase(0.51) - pageTurnEase(0.5),
    );
  });
  it('lifts the bottom-right corner and sweeps a straight fold toward the upper left', () => {
    const start = pageTurnGeometry(960, 540, 0);
    const lift = pageTurnGeometry(960, 540, 0.05);
    const middle = pageTurnGeometry(960, 540, 0.5);
    const end = pageTurnGeometry(960, 540, 1);
    expect(start.revealed.every((p) => p.x === 960 && p.y === 540)).toBe(true);
    expect(lift.revealed).toContainEqual({ x: 960, y: 540 });
    expect(lift.fold.every((p) => p.x > 800 && p.y > 400)).toBe(true);
    expect(middle.offset).toBeLessThan(lift.offset);
    expect(end.revealed).toHaveLength(4);
    expect(end.back.every((p) => p.x <= 0.000001 && p.y <= 0.000001)).toBe(true);
    for (const p of middle.fold)
      expect(p.x * middle.normal.x + p.y * middle.normal.y).toBeCloseTo(middle.offset);
  });
  it('mirrors the sheet across its crease, preserving lengths and fixing crease points', () => {
    const geo = pageTurnGeometry(960, 540, 0.3);
    for (const p of geo.fold) {
      const reflected = reflectInFold(p, geo.normal, geo.offset);
      expect(reflected.x).toBeCloseTo(p.x, 6);
      expect(reflected.y).toBeCloseTo(p.y, 6);
    }
    const a = { x: 960, y: 540 },
      b = { x: 800, y: 540 };
    const ra = reflectInFold(a, geo.normal, geo.offset),
      rb = reflectInFold(b, geo.normal, geo.offset);
    expect(Math.hypot(ra.x - rb.x, ra.y - rb.y)).toBeCloseTo(160);
    expect(reflectInFold(ra, geo.normal, geo.offset).x).toBeCloseTo(a.x);
  });
  it('finishes after .7 seconds once, holds the blank sheet, and resets for Retry', () => {
    const { turn } = harness();
    const done = vi.fn();
    turn.start(done);
    turn.update(PAGE_TURN_SECONDS - 0.01, 960, 540);
    expect(turn.presentation().active).toBe(true);
    expect(done).not.toHaveBeenCalled();
    turn.update(0.02, 960, 540);
    expect(turn.presentation()).toEqual({ active: false, progress: 1 });
    expect(done).toHaveBeenCalledOnce();
    turn.update(1, 800, 600);
    expect(done).toHaveBeenCalledOnce();
    turn.clear();
    expect(turn.presentation()).toEqual({ active: false, progress: 0 });
  });
  it('cross-fades in 150 ms under reduced motion, including a long render frame', () => {
    const { turn } = harness(true);
    const done = vi.fn();
    turn.start(done);
    turn.update(PAGE_FADE_SECONDS / 2, 960, 540);
    expect(turn.presentation()).toEqual({ active: true, progress: 0.5 });
    turn.update(1, 960, 540);
    expect(done).toHaveBeenCalledOnce();
  });
  it('skips once and cancels an obsolete callback when destroyed', () => {
    const { turn, destroy } = harness();
    const done = vi.fn();
    turn.start(done);
    turn.skip();
    turn.skip();
    expect(done).toHaveBeenCalledOnce();
    const obsolete = vi.fn();
    turn.start(obsolete);
    turn.destroy();
    turn.update(1, 960, 540);
    expect(obsolete).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
