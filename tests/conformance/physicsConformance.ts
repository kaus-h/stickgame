import { describe, expect, it as vitestIt } from 'vitest';
import { SeededRng, SIM_DT, vec2, type Vec2 } from '../../src/core';
import type { PhysicsAdapter, Segment } from '../../src/physics';

/**
 * GMR-32 adapter conformance suite. Every physics backend must pass this before gameplay builds
 * on it; it stays as a regression suite afterwards. Numbers worth reporting are logged with a
 * [conformance] prefix so the decision record can quote them.
 */

export interface ConformanceOptions {
  /** Physics substeps per 60 Hz step. */
  substeps: number;
  /** Test names this backend is known to fail (documented in ADR-001 Amendment 2); run as it.fails. */
  knownFailures?: readonly string[];
}

const G = 25;
const solid = (ax: number, ay: number, bx: number, by: number): Segment => ({
  a: vec2(ax, ay),
  b: vec2(bx, by),
  kind: 'solid',
});

function report(name: string, metric: string, value: number | string): void {
  console.log(
    `[conformance] ${name} | ${metric}: ${typeof value === 'number' ? value.toFixed(6) : value}`,
  );
}

function stepN(world: PhysicsAdapter, n: number, substeps: number): void {
  for (let i = 0; i < n; i++) world.step(SIM_DT, substeps);
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function runPhysicsConformance(
  name: string,
  create: () => PhysicsAdapter,
  options: ConformanceOptions,
): void {
  const { substeps } = options;
  const known = new Set(options.knownFailures ?? []);
  const it = (title: string, fn: () => void): void => {
    (known.has(title) ? vitestIt.fails : vitestIt)(title, fn);
  };

  const makeWorld = (segments: Segment[] = []): PhysicsAdapter => {
    const world = create();
    world.setGravity(vec2(0, G));
    world.setGeometry(segments);
    return world;
  };

  describe(`physics conformance: ${name}`, () => {
    it('free fall follows gravity', () => {
      const world = makeWorld();
      const body = world.createBody({ position: vec2(0, 0), velocity: vec2(0, 0), radius: 0.3 });
      stepN(world, 60, substeps);
      const y = world.bodyState(body).position.y;
      const expected = 0.5 * G * 1 * 1;
      report(name, 'free-fall error after 1 s (m)', Math.abs(y - expected));
      expect(Math.abs(y - expected) / expected).toBeLessThan(0.03);
    });

    it('lands, rests without jitter and reports grounded', () => {
      const world = makeWorld([solid(-10, 5, 10, 5)]);
      const body = world.createBody({ position: vec2(0, 0), velocity: vec2(0, 0), radius: 0.3 });
      stepN(world, 120, substeps);
      const rest = world.bodyState(body);
      expect(rest.grounded).toBe(true);
      let maxDrift = 0;
      for (let i = 0; i < 120; i++) {
        world.step(SIM_DT, substeps);
        maxDrift = Math.max(maxDrift, Math.abs(world.bodyState(body).position.y - rest.position.y));
      }
      report(name, 'resting vertical drift over 2 s (m)', maxDrift);
      expect(maxDrift).toBeLessThan(1e-3);
      expect(rest.position.y).toBeLessThan(5 - 0.3 + 0.01);
    });

    it('rope length equals the connection-time distance and is never exceeded', () => {
      const world = makeWorld();
      const body = world.createBody({ position: vec2(3, 1), velocity: vec2(4, 0), radius: 0.3 });
      const anchor = vec2(0, 0);
      const length = dist(world.bodyState(body).position, anchor);
      world.attachRope(body, { kind: 'static', point: anchor }, length);
      let maxStretch = 0;
      for (let i = 0; i < 600; i++) {
        world.step(SIM_DT, substeps);
        maxStretch = Math.max(maxStretch, dist(world.bodyState(body).position, anchor) - length);
      }
      report(name, 'max rope stretch over 10 s (m)', maxStretch);
      expect(maxStretch).toBeLessThan(1e-3);
    });

    it('small-angle swing period matches the analytic pendulum', () => {
      const world = makeWorld();
      const L = 3;
      const angle = (5 * Math.PI) / 180;
      const body = world.createBody({
        position: vec2(L * Math.sin(angle), L * Math.cos(angle)),
        velocity: vec2(0, 0),
        radius: 0.3,
      });
      world.attachRope(body, { kind: 'static', point: vec2(0, 0) }, L);
      const crossings: number[] = [];
      let prevX = world.bodyState(body).position.x;
      for (let i = 1; i <= 60 * 12 && crossings.length < 5; i++) {
        world.step(SIM_DT, substeps);
        const x = world.bodyState(body).position.x;
        if (prevX > 0 && x <= 0) crossings.push(i - x / (x - prevX));
        prevX = x;
      }
      const periods = crossings.slice(1).map((c, i) => (c - (crossings[i] ?? 0)) * SIM_DT);
      const measured = periods.reduce((a, b) => a + b, 0) / periods.length;
      const analytic = 2 * Math.PI * Math.sqrt(L / G);
      report(name, 'pendulum period error (fraction)', Math.abs(measured - analytic) / analytic);
      expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.02);
    });

    it('large swing keeps its energy within tolerance', () => {
      const world = makeWorld();
      const L = 4;
      const body = world.createBody({ position: vec2(L, 0), velocity: vec2(0, 0), radius: 0.3 });
      world.attachRope(body, { kind: 'static', point: vec2(0, 0) }, L);
      const energy = (): number => {
        const s = world.bodyState(body);
        return 0.5 * (s.velocity.x ** 2 + s.velocity.y ** 2) - G * s.position.y;
      };
      const e0 = energy();
      stepN(world, 600, substeps);
      const loss = (e0 - energy()) / (G * L);
      report(name, 'energy loss over 10 s of 90° swings (fraction of mgL)', loss);
      expect(Math.abs(loss)).toBeLessThan(0.05);
    });

    it('release keeps the swing velocity exactly', () => {
      const world = makeWorld();
      const body = world.createBody({ position: vec2(3, 0), velocity: vec2(0, 0), radius: 0.3 });
      const rope = world.attachRope(body, { kind: 'static', point: vec2(0, 0) }, 3);
      stepN(world, 25, substeps);
      const before = world.bodyState(body).velocity;
      world.detachRope(rope);
      world.step(SIM_DT, substeps);
      const after = world.bodyState(body).velocity;
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y - before.y).toBeCloseTo(G * SIM_DT, 6);
    });

    it('never tunnels through thin walls at high speed (10,000 randomized shots)', () => {
      const rng = new SeededRng(32);
      let tunneled = 0;
      const shots = 10_000;
      for (let i = 0; i < shots; i++) {
        // A zero-thickness wall at x = 5; each shot starts just short of it at 20�120 m/s.
        const world = makeWorld([solid(5, -50, 5, 50)]);
        world.setGravity(vec2(0, 0));
        const speed = 20 + rng.next() * 100;
        const angle = (rng.next() - 0.5) * 1.2;
        const body = world.createBody({
          position: vec2(5 - 0.35 - rng.next() * 0.8, (rng.next() - 0.5) * 10),
          velocity: vec2(Math.cos(angle) * speed, Math.sin(angle) * speed),
          radius: 0.3,
        });
        world.step(SIM_DT, substeps);
        world.step(SIM_DT, substeps);
        if (world.bodyState(body).position.x > 5) tunneled++;
        world.dispose();
      }
      report(name, 'tunneled shots out of 10,000', tunneled);
      expect(tunneled).toBe(0);
    });
    it('slides across a seam between collinear floor segments without snagging', () => {
      const world = makeWorld([solid(-20, 5, 0, 5), solid(0, 5, 20, 5)]);
      world.setGravity(vec2(0, G));
      const body = world.createBody({
        position: vec2(-3, 5 - 0.3 - 1e-3),
        velocity: vec2(8, 0),
        radius: 0.3,
      });
      stepN(world, 60, substeps);
      const s = world.bodyState(body);
      report(name, 'horizontal speed kept across seam (m/s of 8)', s.velocity.x);
      expect(s.velocity.x).toBeGreaterThan(7.9);
      expect(s.position.x).toBeGreaterThan(4);
    });

    it('a moving anchor drags the body and keeps the rope limit', () => {
      const world = makeWorld();
      const anchor = world.createKinematicAnchor(vec2(0, 0));
      const body = world.createBody({ position: vec2(0, 3), velocity: vec2(0, 0), radius: 0.3 });
      world.attachRope(body, { kind: 'kinematic', anchor, offset: vec2(0, 0) }, 3);
      let maxStretch = 0;
      for (let i = 0; i < 180; i++) {
        const t = i * SIM_DT;
        world.moveKinematicAnchor(anchor, vec2(2 * t, 0), vec2(2, 0));
        world.step(SIM_DT, substeps);
        const a = world.anchorPosition(anchor);
        maxStretch = Math.max(maxStretch, dist(world.bodyState(body).position, a) - 3);
      }
      const s = world.bodyState(body);
      const ke = 0.5 * (s.velocity.x ** 2 + s.velocity.y ** 2);
      report(name, 'moving anchor: max stretch (m)', maxStretch);
      report(name, 'moving anchor: kinetic energy after 3 s at 2 m/s (J/kg)', ke);
      expect(maxStretch).toBeLessThan(2e-3);
      expect(s.position.x).toBeGreaterThan(3);
      expect(Number.isFinite(ke)).toBe(true);
    });

    it('raycast returns the closest hit with a normal facing the ray', () => {
      const world = makeWorld([solid(4, -5, 4, 5), solid(2, -5, 2, 5)]);
      const hit = world.raycast(vec2(0, 0), vec2(10, 0));
      expect(hit).not.toBeNull();
      expect(hit?.point.x).toBeCloseTo(2, 9);
      expect(hit?.normal.x).toBeCloseTo(-1, 9);
      expect(hit?.distance).toBeCloseTo(2, 9);
      expect(world.raycast(vec2(0, 0), vec2(1, 0))).toBeNull();
    });

    it('reports hazard contacts once when they begin', () => {
      const world = makeWorld([{ a: vec2(-5, 5), b: vec2(5, 5), kind: 'hazard' }]);
      world.createBody({ position: vec2(0, 0), velocity: vec2(0, 0), radius: 0.3 });
      stepN(world, 120, substeps);
      const contacts = world.drainContacts();
      expect(contacts.filter((c) => c.kind === 'hazard')).toHaveLength(1);
      expect(contacts[0]?.speed).toBeGreaterThan(10);
    });

    it('survives 1,000 resets in one world without growth', () => {
      const world = makeWorld([solid(-10, 5, 10, 5)]);
      const body = world.createBody({ position: vec2(0, 0), velocity: vec2(3, 0), radius: 0.3 });
      const anchor = world.createKinematicAnchor(vec2(0, -2));
      const baseline = world.stats();
      for (let i = 0; i < 1000; i++) {
        world.attachRope(body, { kind: 'kinematic', anchor, offset: vec2(0, 0) }, 2);
        stepN(world, 5, substeps);
        world.drainContacts();
        world.resetBodies();
      }
      const after = world.stats();
      expect(after).toEqual(baseline);
      expect(world.bodyState(body).position).toEqual(vec2(0, 0));
    });

    it('catchRetention turns outward speed into swing at a taut catch', () => {
      const speedAfterCatch = (catchRetention: number): number => {
        const world = makeWorld();
        // Taut at the bottom, moving 6 m/s straight outward and 3 m/s sideways.
        const body = world.createBody({ position: vec2(0, 0), velocity: vec2(3, 6), radius: 0.3 });
        world.attachRope(body, { kind: 'static', point: vec2(0, -4) }, 4, { catchRetention });
        world.step(SIM_DT, substeps);
        const v = world.bodyState(body).velocity;
        return Math.sqrt(v.x * v.x + v.y * v.y);
      };
      const kept = speedAfterCatch(1);
      const lost = speedAfterCatch(0);
      report(name, 'speed after catch k=1 / k=0 (m/s)', `${kept.toFixed(3)} / ${lost.toFixed(3)}`);
      expect(kept).toBeGreaterThan(Math.sqrt(45) - 0.3);
      expect(lost).toBeLessThan(3.5);
    });

    it('is deterministic for identical inputs', () => {
      const run = (): Vec2 => {
        const world = makeWorld([solid(-10, 5, 10, 5), solid(6, 5, 9, -2)]);
        const body = world.createBody({ position: vec2(0, 0), velocity: vec2(7, -3), radius: 0.3 });
        world.attachRope(body, { kind: 'static', point: vec2(2, -3) }, 4);
        stepN(world, 300, substeps);
        return world.bodyState(body).position;
      };
      expect(run()).toEqual(run());
    });
  });
}
