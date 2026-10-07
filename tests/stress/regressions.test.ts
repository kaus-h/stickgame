import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import * as c from './cases';
import { box, makeRig, pos, SPEEDS, speedOf, step, vel } from './harness';

/** GMR-24 regressions for defects the stress lab found in the kinematic adapter. */
describe('collision regressions (GMR-24)', () => {
  it('constraint vs solid: collision wins, the rope stays violated and adds no speed', () => {
    // Anchor at the origin, 0.3 m wall from x=1; the closest the body can get is 1.65 m away.
    const rig = makeRig([box('wall', 1, -50, 0.3, 100)], vec2(2.5, 0), vec2(0, 0));
    const rope = rig.world.attachRope(rig.body, { kind: 'static', point: vec2(0, 0) }, 0.8, {
      catchRetention: 1,
    });
    let maxSpeed = 0;
    for (let i = 0; i < 300; i++) {
      step(rig);
      if (i > 60) maxSpeed = Math.max(maxSpeed, speedOf(vel(rig)));
    }
    const p = pos(rig);
    // The body never enters the wall (center stays right of the wall face plus its radius) ...
    expect(p.x).toBeGreaterThanOrEqual(1.3 + 0.35 - 1e-3);
    // ... so the rope is violated by the geometric minimum, not more.
    expect(Math.sqrt(p.x * p.x + p.y * p.y) - 0.8).toBeLessThan(0.9);
    // Previously gravity piled up to 22 m/s of phantom speed here.
    expect(maxSpeed).toBeLessThan(1);
    // Releasing the rope does not launch the body.
    rig.world.detachRope(rope);
    step(rig, 3);
    expect(speedOf(vel(rig))).toBeLessThan(2);
  });

  it('a body squeezed into a too-narrow mouth never sinks into the geometry', () => {
    for (const v of SPEEDS) {
      for (const a of [0, 5, 15]) {
        const row = c.tunnel(0.6, v, a);
        expect(row.pen, `v=${String(v)} a=${String(a)}`).toBeLessThan(1e-3);
        expect(row.ok, row.fail).toBe(true);
      }
    }
  });

  it('a body driven into a 30 degree crevice stays outside both faces', () => {
    for (const v of SPEEDS) {
      const row = c.wedge(v);
      expect(row.pen, `v=${String(v)}`).toBeLessThan(1e-3);
      expect(row.ok, row.fail).toBe(true);
    }
  });

  it('a rope that a ceiling holds stretches by under 0.12 m and relaxes along the surface', () => {
    for (const v of SPEEDS) {
      expect(c.lowCeilingSwing(4, v).stretch, `v=${String(v)}`).toBeLessThan(0.12);
    }
  });
});
