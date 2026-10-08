import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import * as c from './cases';
import { GAMEPLAY_MAX, SPEEDS, summarize, type Row } from './harness';

/**
 * GMR-24 Collision Stress Lab. Every case runs at a sweep of speeds (5..80 m/s) and angles against
 * the kinematic adapter directly, and through Simulation where the sim adds rules. The envelope up
 * to GAMEPLAY_MAX (30 m/s) must be clean; behavior beyond it is recorded, never failed on
 * (docs/collision-policy.md). Set STRESS_REPORT=<file> to write the full table.
 */

const all: Row[] = [];

function sweep(title: string, rows: () => Row[]): void {
  it(title, () => {
    const out = rows();
    all.push(...out);
    const bad = out.filter((r) => r.speed <= GAMEPLAY_MAX && !r.ok);
    expect(
      bad.map((r) => `${r.c} ${r.variant} v=${String(r.speed)} a=${String(r.angle)}: ${r.fail}`),
    ).toEqual([]);
  });
}

const grid = <T>(xs: readonly T[], ys: readonly number[], f: (x: T, y: number) => Row): Row[] =>
  xs.flatMap((x) => ys.map((y) => f(x, y)));

const rowsFor = (speeds: readonly number[], f: (v: number) => Row): Row[] => speeds.map(f);

describe('collision stress lab', () => {
  afterAll(() => {
    const out = process.env.STRESS_REPORT;
    if (out) {
      writeFileSync(
        out,
        `case | variant | ${SPEEDS.join(' | ')} | worst
${summarize(all)}
`,
      );
    }
  });

  describe('tunneling', () => {
    sweep('thin wall at high lateral speed (any angle)', () =>
      SPEEDS.flatMap((v) =>
        [0.02, 0.05, 0.2].flatMap((t) => [0, 15, 45, 75, 89].map((a) => c.thinWall(t, v, a))),
      ),
    );
    sweep('thin floor at high downward speed (any angle)', () =>
      SPEEDS.flatMap((v) =>
        [0.02, 0.05, 0.2].flatMap((t) => [0, 15, 45, 75, 89].map((a) => c.thinFloor(t, v, a))),
      ),
    );
    sweep('through Simulation: thin wall, thin floor, hazard strip', () => [
      ...rowsFor(SPEEDS, c.simThinWall),
      ...rowsFor(SPEEDS, c.simThinFloor),
      ...rowsFor(SPEEDS, c.simHazard),
    ]);
  });

  describe('corners, seams and tunnels', () => {
    sweep('sharp convex corner, aimed at and beside the vertex', () =>
      SPEEDS.flatMap((v) =>
        [0, 20, 45, 70, 89].flatMap((a) => [0, 0.05, -0.2].map((o) => c.vertexHit(a, o, v))),
      ),
    );
    sweep('running off a platform edge keeps horizontal speed', () =>
      rowsFor(SPEEDS, c.edgeRunOff),
    );
    sweep('seams between abutting floor tiles do not snag', () =>
      SPEEDS.flatMap((v) => [0, 0.001].map((s) => c.seamSlide(s, v))),
    );
    sweep('seams in a stacked wall do not snag a falling slide', () =>
      rowsFor(SPEEDS, c.seamSlideWall),
    );
    sweep('concave floor+wall corner holds the body', () =>
      grid(SPEEDS, [20, 45, 70], (v, a) => c.concaveCorner(a, v)),
    );
    sweep('30 degree wedge crevice holds the body', () => rowsFor(SPEEDS, c.wedge));
    sweep('narrow tunnel: blocked below 2r, passable above', () =>
      SPEEDS.flatMap((v) =>
        [0.6, 0.7, 0.72, 0.8, 1.0].flatMap((g) => [0, 5, 15].map((a) => c.tunnel(g, v, a))),
      ),
    );
  });

  describe('rope constraint', () => {
    sweep('low ceiling during a swing', () =>
      SPEEDS.flatMap((v) => [2.5, 4].map((u) => c.lowCeilingSwing(u, v))),
    );
    sweep('constraint pulling the body into a solid: collision wins, nothing explodes', () =>
      SPEEDS.flatMap((v) =>
        (['wall', 'floor'] as const).flatMap((k) =>
          [0.8, 1.2, 1.5, 2].flatMap((len) =>
            [0, 90, 180].map((a) => c.constraintConflict(k, len, v, a)),
          ),
        ),
      ),
    );
    sweep('near-zero rope length', () =>
      SPEEDS.flatMap((v) =>
        [0, 1e-9, 1e-6, 1e-3, 1e-2, 0.1, 0.8].flatMap((len) =>
          [false, true].map((rad) => c.nearZeroRope(len, v, rad)),
        ),
      ),
    );
    sweep('extreme rope length', () =>
      SPEEDS.flatMap((v) => [11, 25, 60, 120, 500].map((len) => c.extremeRope(len, v))),
    );
    sweep('through Simulation: swing at 0.8 and 11 m, with and without a ceiling', () =>
      SPEEDS.flatMap((v) => [
        c.simSwing(0.8, v, null),
        c.simSwing(5, v, null),
        c.simSwing(11, v, null),
        c.simSwing(5, v, 2.5),
        c.simSwing(5, v, 4),
      ]),
    );
    sweep('through Simulation: rope length rule rejects too close and too far', () =>
      [0, 0.1, 0.79, 0.8, 5, 11, 11.01, 30].map((d) => c.simRopeLimits(d)),
    );
  });

  describe('hazards', () => {
    sweep('hazard strike always reports a contact before passing', () =>
      SPEEDS.flatMap((v) =>
        [0.5, 0.01, 0.001, 0].flatMap((g) => [0, 30, 60].map((a) => c.hazardStrike(g, v, a))),
      ),
    );
    sweep('hazard graze at a safe gap is not a false contact', () =>
      SPEEDS.flatMap((v) => [0.5, 0.01, 0.002].map((g) => c.hazardGraze(g, v))),
    );
    sweep('release of a swing next to a hazard', () =>
      SPEEDS.flatMap((v) => [0.5, 1.5, 2.5, 2.9].map((x) => c.releaseNearHazard(v, x))),
    );
  });
});
