import { describe, expect, it } from 'vitest';
import { vec2, type Vec2 } from '../core';
import type { RayHit } from '../physics';
import { KinematicPhysicsAdapter } from '../physics/backends/kinematic/KinematicPhysicsAdapter';
import { resolveTarget, type TargetAnchor } from './targeting';
import type { RopeTuning } from './tuning';

const rope: RopeTuning = {
  minLength: 0.8,
  maxLength: 11,
  selectRadius: 1.1,
  steerAccel: 6,
  steerEnergyHeight: 0.6,
};
type Ray = (from: Vec2, to: Vec2) => RayHit | null;
const noHit: Ray = () => null;
const player = vec2(0, 0);
const anchor = (x: number, y: number, radius = 0.4): TargetAnchor => ({
  position: vec2(x, y),
  radius,
});

function resolve(aim: Vec2, anchors: TargetAnchor[], ray = noHit, from = player) {
  return resolveTarget(from, aim, anchors, rope, ray);
}

describe('resolveTarget', () => {
  it('uses the exact aim point as impact when the aim is on the anchor disc', () => {
    const anchors = [anchor(5, -3)];
    const a = resolve(vec2(5.2, -3.1), anchors);
    const b = resolve(vec2(4.85, -2.8), anchors);
    expect(a.valid && b.valid).toBe(true);
    expect(a.impact).toEqual(vec2(5.2, -3.1));
    expect(b.impact).toEqual(vec2(4.85, -2.8));
    // Different regions of the same anchor give different rope lengths: no fixed centre grapple.
    expect(a.distance).not.toBeCloseTo(b.distance ?? 0, 3);
  });

  it('projects aims in the selection margin onto the nearest rim point', () => {
    const r = resolve(vec2(6, -3), [anchor(5, -3)]);
    expect(r.valid).toBe(true);
    expect(r.impact?.x).toBeCloseTo(5.4, 12);
    expect(r.impact?.y).toBeCloseTo(-3, 12);
    if (r.valid) expect(r.offset).toEqual(vec2(0.4, 0));
  });

  it('accepts aims at the edge of the selection region and rejects just outside it', () => {
    const anchors = [anchor(5, -3)];
    expect(resolve(vec2(5 + 0.4 + 1.1, -3), anchors).valid).toBe(true);
    const outside = resolve(vec2(5 + 0.4 + 1.1001, -3), anchors);
    expect(outside).toMatchObject({ valid: false, reason: 'no-anchor', anchor: null });
  });

  it('rejects a background click with no anchor nearby (no auto-targeting)', () => {
    expect(resolve(vec2(-4, -6), [anchor(5, -3)])).toEqual({
      valid: false,
      reason: 'no-anchor',
      anchor: null,
      impact: null,
      distance: null,
    });
  });

  it('picks the anchor whose disc is closest when candidates overlap, deterministically', () => {
    const anchors = [anchor(5, -3), anchor(6.5, -3)];
    expect(resolve(vec2(5.6, -3), anchors).anchor).toBe(0);
    expect(resolve(vec2(5.9, -3), anchors).anchor).toBe(1);
    // Exactly between two equal anchors: lower index wins, every time.
    for (let i = 0; i < 3; i++) expect(resolve(vec2(5.75, -3), anchors).anchor).toBe(0);
  });

  it('prefers the closer centre when the aim is on two discs at once', () => {
    const anchors = [anchor(5, -3, 1), anchor(5.5, -3, 1)];
    expect(resolve(vec2(5.4, -3), anchors).anchor).toBe(1);
  });

  it('enforces min and max rope length on the impact distance', () => {
    expect(resolve(vec2(0.5, 0), [anchor(0.5, 0)])).toMatchObject({
      valid: false,
      reason: 'too-close',
      anchor: 0,
    });
    expect(resolve(vec2(11.2, 0), [anchor(11.2, 0)])).toMatchObject({
      valid: false,
      reason: 'too-far',
    });
    expect(resolve(vec2(10.99, 0), [anchor(10.99, 0)]).valid).toBe(true);
  });

  it('rejects shots whose line of sight is blocked by level geometry', () => {
    const physics = new KinematicPhysicsAdapter();
    physics.setGeometry([{ a: vec2(2, -5), b: vec2(2, 5), kind: 'solid' }]);
    const ray = (a: Vec2, b: Vec2) => physics.raycast(a, b);
    expect(resolve(vec2(5, 0), [anchor(5, 0)], ray)).toMatchObject({
      valid: false,
      reason: 'blocked',
    });
    expect(resolve(vec2(1.5, -1), [anchor(1.5, -1)], ray).valid).toBe(true);
  });

  it('measures from the player, so the same aim gives a different length after moving', () => {
    const anchors = [anchor(5, -3)];
    const near = resolve(vec2(5, -3), anchors, noHit, vec2(4, 0));
    const far = resolve(vec2(5, -3), anchors, noHit, vec2(0, 0));
    expect(near.distance).toBeCloseTo(Math.sqrt(10), 12);
    expect(far.distance).toBeCloseTo(Math.sqrt(34), 12);
  });
});
