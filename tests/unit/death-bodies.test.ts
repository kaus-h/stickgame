import { describe, expect, it } from 'vitest';
import level12 from '../../content/levels/1-2.json';
import tuning from '../../content/tuning/runtime.json';
import { vec2, type Intent } from '../../src/core';
import { BODY_CAP, BodyPile } from '../../src/render/bodies/BodyPile';
import {
  BODY_STEP,
  createRagdoll,
  HAZARD_SINK,
  MAX_AGE,
  stepRagdoll,
  type BodySegment,
  type Ragdoll,
} from '../../src/render/bodies/ragdoll';
import { hashSnapshot } from '../../src/sim';
import { makeFixture, makeSim } from '../../src/tools/replay-drift/scenario';

const G = 30;
const box = (x0: number, y0: number, x1: number, y1: number, hazard = false): BodySegment[] => {
  const p = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const;
  return p.map(([ax, ay], i) => {
    const [bx, by] = p[(i + 1) % 4] ?? p[0];
    return { ax, ay, bx, by, hazard };
  });
};
const death = (x: number, y: number, vx = 0, vy = 0, tick = 100) => ({
  tick,
  at: vec2(x, y),
  velocity: vec2(vx, vy),
});
/** Step until frozen (at most MAX_AGE plus a margin), checking `each` after every step. */
function settle(rd: Ragdoll, segs: readonly BodySegment[], each?: (rd: Ragdoll) => void): number {
  let t = 0;
  while (!rd.frozen && t < MAX_AGE + 1) {
    stepRagdoll(rd, 1, G, segs);
    t += BODY_STEP;
    each?.(rd);
  }
  return t;
}

describe('death body ragdoll (GMR-104)', () => {
  it('settles on a flat floor and never passes through it', () => {
    const floor = box(-20, 10, 20, 12);
    for (const [vx, vy, tick] of [
      [0, 0, 1],
      [12, -6, 2],
      [-8, 25, 3],
      [30, 40, 4],
    ] as const) {
      const rd = createRagdoll(death(0, 8, vx, vy, tick));
      let lowest = -Infinity;
      const t = settle(rd, floor, (r) => {
        for (const p of r.points) lowest = Math.max(lowest, p.y);
      });
      expect(rd.frozen).toBe(true);
      expect(lowest).toBeLessThanOrEqual(10);
      // It came to rest on the floor (not in mid-air), well within the 4 s limit when slow.
      for (const p of rd.points) expect(p.y).toBeGreaterThan(9);
      if (vx === 0) expect(t).toBeLessThan(MAX_AGE);
    }
  });

  it('never passes through a thin solid ledge, even fast', () => {
    const ledge = box(-2, 5, 2, 5.1);
    const rd = createRagdoll(death(0, 3, 0, 45, 7));
    settle(rd, ledge, (r) => {
      for (const p of r.points) {
        const over = p.x > -2 && p.x < 2;
        if (over) expect(p.y).toBeLessThanOrEqual(5);
      }
    });
  });

  it('sinks partway into a hazard and stops there', () => {
    const hazard = box(-20, 10, 20, 12, true);
    const rd = createRagdoll(death(0, 9, 3, 20, 11));
    settle(rd, hazard);
    expect(rd.frozen).toBe(true);
    expect(rd.stuck).toBe(true);
    for (const p of rd.points) expect(p.y).toBeLessThanOrEqual(10 + HAZARD_SINK + 1e-6);
    expect(Math.max(...rd.points.map((p) => p.y))).toBeGreaterThan(10);
  });

  it('the seeded pose is identical for the same death event, different for another', () => {
    const pose = (rd: Ragdoll) => rd.points.map((p) => [p.x, p.y, p.px, p.py]);
    expect(pose(createRagdoll(death(4, 5, 3, -2, 900)))).toEqual(
      pose(createRagdoll(death(4, 5, 3, -2, 900))),
    );
    expect(pose(createRagdoll(death(4, 5, 3, -2, 901)))).not.toEqual(
      pose(createRagdoll(death(4, 5, 3, -2, 900))),
    );
    // And the settled pile is the same too.
    const floor = box(-20, 10, 20, 12);
    const a = createRagdoll(death(1, 8, 5, 0, 42));
    const b = createRagdoll(death(1, 8, 5, 0, 42));
    settle(a, floor);
    settle(b, floor);
    expect(pose(a)).toEqual(pose(b));
  });
});

describe('body pile (GMR-104)', () => {
  const level = makeFixture(level12, tuning).level;

  it('keeps at most 60 bodies; the oldest fade out', () => {
    const pile = new BodyPile(level, G);
    for (let i = 0; i < 75; i++) pile.spawn(death(5 + i * 0.5, 6, 0, 0, i));
    expect(pile.kept).toBe(BODY_CAP);
    expect(pile.bodies.filter((b) => b.fading).map((b) => b.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => i),
    );
    for (let k = 0; k < 60; k++) pile.step(1 / 60);
    expect(pile.bodies.length).toBe(BODY_CAP);
    expect(pile.bodies[0]?.id).toBe(15);
  });

  it('caps the steps of a long frame and settles every body', () => {
    const pile = new BodyPile(level, G);
    pile.spawn(death(5, 6));
    pile.step(10); // a stalled tab: at most a few steps, never a 10 s catch-up
    expect(pile.bodies[0]?.rag.age).toBeLessThan(0.1);
    for (let k = 0; k < 5 * 60; k++) pile.step(1 / 60);
    expect(pile.simulating).toBe(0);
  });

  it('a full sim replay hashes the same with bodies on or off (bodies never feed back)', () => {
    const fixture = makeFixture(level12, tuning);
    // Run right and jump into the first hazard repeatedly: several deaths and respawns.
    const script = (tick: number): Intent[] => {
      const t = tick % 240;
      if (t === 0) return [{ type: 'move', axis: 1 }];
      if (t === 30) return [{ type: 'jumpPress' }];
      if (t === 40) return [{ type: 'jumpRelease' }];
      return [];
    };
    const run = (bodies: BodyPile | null): { hashes: string[]; deaths: number } => {
      const sim = makeSim(fixture);
      const hashes: string[] = [];
      let deaths = 0;
      for (let tick = 0; tick < 1500; tick++) {
        sim.step(script(tick));
        for (const e of sim.drainEvents()) {
          if (e.type !== 'death') continue;
          deaths++;
          bodies?.spawn(e);
        }
        bodies?.step(1 / 60);
        hashes.push(hashSnapshot(sim.snapshot()));
      }
      sim.dispose();
      return { hashes, deaths };
    };
    const pile = new BodyPile(fixture.level, G);
    const on = run(pile);
    const off = run(null);
    expect(on.deaths).toBeGreaterThan(2);
    expect(pile.bodies.length).toBe(on.deaths);
    expect(on.hashes).toEqual(off.hashes);
  });
});
