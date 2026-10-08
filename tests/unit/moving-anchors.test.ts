/**
 * GMR-26: moving-anchor physics and moving-pivot predictability. Measurements double as
 * regression tests; `MOVING_REPORT=1 npx vitest run tests/unit/moving-anchors.test.ts` prints the
 * tables quoted in docs/moving-anchors.md.
 */
import { afterAll, describe, expect, it } from 'vitest';
import labMovingJson from '../../content/levels/lab-moving.json';
import { anchorPathPeaks, MAX_ANCHOR_ACCEL, MAX_ANCHOR_SPEED, parseLevel } from '../../src/content';
import { SeededRng, SIM_DT, vec2, type Intent, type IntentSource, type Vec2 } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { anchorPathState, hashSnapshot, Simulation, type SimSnapshot } from '../../src/sim';
import { hashRunFramed, type Fixture } from '../../src/tools/replay-drift/scenario';
import * as M from './movingAnchorLab';

const report: string[] = [];
afterAll(() => {
  if (process.env.MOVING_REPORT) console.log(report.join('\n'));
});

/** Paths inside the envelope (peak speed ≤ 8 m/s, peak accel ≤ 12 m/s²) and a few outside it. */
const INSIDE: M.PathSpec[] = [
  { span: 2, period: 3, axis: 'x' },
  { span: 4, period: 4, axis: 'x' },
  { span: 4, period: 3, axis: 'x' },
  { span: 8, period: 6, axis: 'x' },
  { span: 8, period: 4, axis: 'x' },
  { span: 10.5, period: 4.2, axis: 'x' },
  { span: 12, period: 6, axis: 'x' },
  { span: 2, period: 3, axis: 'y' },
  { span: 4, period: 3, axis: 'y' },
  { span: 8, period: 4, axis: 'y' },
  { span: 10.5, period: 4.2, axis: 'y' },
];
const OUTSIDE: M.PathSpec[] = [
  { span: 8, period: 3, axis: 'x' },
  { span: 12, period: 4, axis: 'x' },
  { span: 12, period: 3, axis: 'x' },
  { span: 8, period: 2, axis: 'x' },
  { span: 12, period: 3, axis: 'y' },
  { span: 8, period: 2, axis: 'y' },
];
const label = (p: M.PathSpec) =>
  `${p.axis} span ${String(p.span)} T ${String(p.period)} (v ${M.peakSpeed(p).toFixed(1)}, a ${M.peakAccel(p).toFixed(1)})`;

describe('anchor path model', () => {
  const def = {
    id: 'a',
    position: vec2(0, 0),
    radius: 0.4,
    path: { to: vec2(8, 0), period: 4 },
  };

  it('phase offsets the start: 0 at position, 0.25 mid-way at peak speed, 0.5 at `to`', () => {
    expect(anchorPathState(def, 0)).toEqual({ position: vec2(0, 0), velocity: vec2(0, 0) });
    const quarter = anchorPathState({ ...def, path: { ...def.path, phase: 0.25 } }, 0);
    expect(quarter.position.x).toBeCloseTo(4, 12);
    expect(quarter.velocity.x).toBeCloseTo((Math.PI * 8) / 4, 12);
    const half = anchorPathState({ ...def, path: { ...def.path, phase: 0.5 } }, 0);
    expect(half.position.x).toBeCloseTo(8, 12);
    expect(half.velocity.x).toBeCloseTo(0, 12);
    // phase is a time shift: phase p at t equals phase 0 at t + p·T.
    const shifted = anchorPathState({ ...def, path: { ...def.path, phase: 0.3 } }, 0.7);
    expect(shifted.position.x).toBeCloseTo(anchorPathState(def, 0.7 + 1.2).position.x, 12);
  });

  it('velocity is the derivative of position', () => {
    for (const t of [0.1, 0.9, 1.7, 2.0, 3.3]) {
      const h = 1e-6;
      const a = anchorPathState(def, t - h).position.x;
      const b = anchorPathState(def, t + h).position.x;
      expect(anchorPathState(def, t).velocity.x).toBeCloseTo((b - a) / (2 * h), 5);
    }
  });

  it('the snapshot exposes each anchor path velocity; static anchors report zero', () => {
    const level = parseLevel(labMovingJson);
    const sim = new Simulation(M.tuning, new KinematicPhysicsAdapter(), level);
    for (let i = 0; i < 37; i++) sim.step([]);
    const s = sim.snapshot();
    expect(s.anchorVelocities).toHaveLength(level.anchors.length);
    level.anchors.forEach((a, i) => {
      expect(s.anchorVelocities[i]).toEqual(anchorPathState(a, 37 * SIM_DT).velocity);
      // The physics anchor sits exactly on the path (secant stepping, no per-tick drift).
      const p = anchorPathState(a, 37 * SIM_DT).position;
      expect((s.anchors[i] as Vec2).x).toBeCloseTo(p.x, 9);
      expect((s.anchors[i] as Vec2).y).toBeCloseTo(p.y, 9);
    });
  });
});

describe('kinematic adapter with a moving pivot (regressions)', () => {
  /** Pendulum of length 5 released at rest 37° off vertical; pivot scripted by `pivot(k)`. */
  const run = (pivot: (k: number) => Vec2, steps: number) => {
    const phys = new KinematicPhysicsAdapter();
    phys.setGravity(vec2(0, M.g));
    const p0 = pivot(0);
    const v0 = vec2((pivot(1).x - p0.x) / SIM_DT, (pivot(1).y - p0.y) / SIM_DT);
    const body = phys.createBody({ position: vec2(p0.x + 3, p0.y + 4), velocity: v0, radius: 0.3 });
    const anchor = phys.createKinematicAnchor(p0);
    // One step with the pivot already moving, so the body and pivot share a velocity at attach.
    phys.moveKinematicAnchor(anchor, p0, v0);
    phys.setGravity(vec2(0, 0));
    phys.step(SIM_DT, 4);
    phys.setGravity(vec2(0, M.g));
    phys.attachRope(body, { kind: 'kinematic', anchor, offset: vec2(0, 0) }, 5);
    const rel: Vec2[] = [];
    let inside = 0;
    for (let k = 1; k <= steps; k++) {
      const p = pivot(k);
      const n = pivot(k + 1);
      phys.moveKinematicAnchor(anchor, p, vec2((n.x - p.x) / SIM_DT, (n.y - p.y) / SIM_DT));
      phys.step(SIM_DT, 4);
      const b = phys.bodyState(body).position;
      const a = phys.anchorPosition(anchor);
      rel.push(vec2(b.x - a.x, b.y - a.y));
      if (Math.hypot(b.x - a.x, b.y - a.y) < 5 - 1e-6) inside++;
    }
    return { rel, inside };
  };

  it('a pivot gliding at constant velocity swings the body exactly like a fixed one', () => {
    // Galilean invariance. Before GMR-26 the swing angle was measured from the already-advanced
    // pivot, dropping its sideways travel each substep: the body lagged by ~v·t/L radians.
    const still = run(() => vec2(0, 0), 300);
    const glide = run((k) => vec2(6 * k * SIM_DT, -2 * k * SIM_DT), 300);
    let err = 0;
    still.rel.forEach((r, i) => {
      const q = glide.rel[i] as Vec2;
      err = Math.max(err, Math.hypot(r.x - q.x, r.y - q.y));
    });
    expect(err).toBeLessThan(1e-6);
  });

  it('an accelerating pivot does not flick a taut rope slack', () => {
    // Pivot accelerating toward the body at 6 m/s², well under g·cos(37°): physically always taut.
    // Before GMR-26 the once-per-step velocity change acted as an inward impulse every step.
    const accel = run((k) => vec2(-0.5 * 6 * (k * SIM_DT) ** 2, 0), 60);
    expect(accel.inside).toBe(0);
  });
});

describe('energy, constraint and agreement with an ideal pendulum', () => {
  const rows: string[] = [
    '| path | L m | max stretch m | slack ticks | world E range /gL | frame E range /gL | E err vs ideal /gL (2 s) | θ err vs ideal rad (2 s / 5 s) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  afterAll(() =>
    report.push(
      '### Long attached swings: 10 s, released at rest at offsets (4,3), (1.8,2.4), (-4.8,6.4) from the pivot',
      ...rows,
      '',
    ),
  );

  const measure = (path: M.PathSpec, spawn: Vec2) => {
    const ticks = 600;
    const tr = M.swing(M.openLevel(path, spawn), 0, ticks);
    const ref = M.reference(path, tr, ticks);
    const gL = M.g * tr.length;
    const eErr = M.maxAbsDiff(tr.frameE, ref.frameE, 120) / gL;
    const th2 = M.maxAbsDiff(tr.theta, ref.theta, 120);
    const th5 = M.maxAbsDiff(tr.theta, ref.theta, 300);
    const slack120 = (() => {
      const t2 = M.swing(M.openLevel(path, spawn), 0, 120);
      return t2.slackTicks;
    })();
    rows.push(
      `| ${label(path)} | ${tr.length.toFixed(2)} | ${tr.maxStretch.toExponential(1)} | ${String(tr.slackTicks)} | ${(M.range(tr.worldE) / gL).toFixed(2)} | ${(M.range(tr.frameE) / gL).toFixed(2)} | ${eErr.toFixed(3)} | ${th2.toFixed(3)} / ${th5.toFixed(3)} |`,
    );
    return { tr, eErr, th2, slack120 };
  };

  it.each(INSIDE.map((p) => [label(p), p] as const))(
    'inside the envelope: %s matches the ideal pendulum and never stretches',
    (_name, path) => {
      for (const spawn of [vec2(4, 3), vec2(1.8, 2.4), vec2(-4.8, 6.4)]) {
        const { tr, eErr, th2, slack120 } = measure(path, spawn);
        expect(tr.maxStretch).toBeLessThan(1e-9);
        // Numerical energy injection is negligible: the sim tracks the exact driven pendulum.
        expect(th2).toBeLessThan(0.02);
        expect(eErr).toBeLessThan(0.03);
        expect(slack120).toBe(0);
      }
    },
  );

  it('outside the envelope the rope stays inextensible but the swing is pivot-driven', () => {
    for (const path of OUTSIDE) {
      const { tr } = measure(path, vec2(4, 3));
      expect(tr.maxStretch).toBeLessThan(1e-9);
    }
  });
});

describe('predictability', () => {
  it('outcome sensitivity inside the envelope stays within 3x of a fixed anchor (2 s ride)', () => {
    const rows = [
      '| path | L 3 m: 1 s / 2 s / 4 s | L 6 m: 1 s / 2 s / 4 s | L 9 m: 1 s / 2 s / 4 s |',
      '| --- | --- | --- | --- |',
    ];
    const cell = (path: M.PathSpec | null, L: number) =>
      [60, 120, 240].map((h) => M.sensitivity(path, vec2(L * 0.64, L * 0.77), h));
    const fixed = [3, 6, 9].map((L) => cell(null, L));
    rows.push(
      `| fixed anchor | ${fixed.map((c) => c.map((x) => x.toFixed(1)).join(' / ')).join(' | ')} |`,
    );
    for (const path of [...INSIDE, ...OUTSIDE]) {
      const cells = [3, 6, 9].map((L) => cell(path, L));
      rows.push(
        `| ${label(path)}${OUTSIDE.includes(path) ? ' **outside**' : ''} | ${cells.map((c) => c.map((x) => x.toFixed(1)).join(' / ')).join(' | ')} |`,
      );
      if (INSIDE.includes(path)) {
        cells.forEach((c, i) => {
          const f = fixed[i] as number[];
          const fixedWorst = Math.max(f[0] as number, f[1] as number);
          const worst = Math.max(c[0] as number, c[1] as number);
          // Learnable: rides up to 2 s stay within 3x the fixed-anchor sensitivity and under
          // 12 (m/s)/m, i.e. 1 cm of timing or aim moves the release by at most 0.12 m/s.
          expect(worst, `${label(path)} L ${String([3, 6, 9][i])}`).toBeLessThan(
            Math.min(12, 3 * fixedWorst),
          );
        });
      }
    }
    report.push(
      '### Sensitivity: |Δ release velocity| per metre of start offset, after riding 1, 2, 4 s',
      ...rows,
      '',
    );
  });

  /**
   * Attach on every tick from 12 before to 12 after the pivot turns round at `to`, release after
   * `hold` ticks. Returns release velocities and, per attach tick, the sign of the tangential
   * relative velocity at the catch (which way the momentum-keeping catch sends the body) and
   * whether the rope went slack during the ride (then the re-catch timing decides the outcome,
   * exactly as with a fixed anchor).
   */
  const reversalSweep = (path: M.PathSpec | null, off: Vec2, hold: number) => {
    const to = path ? (path.axis === 'x' ? vec2(path.span, 0) : vec2(0, path.span)) : vec2(0, 0);
    const level = M.openLevel(path, vec2(to.x + off.x, to.y + off.y));
    const vs: Vec2[] = [];
    const side: number[] = [];
    const slack: boolean[] = [];
    for (let k = 0; k <= 24; k++) {
      const sim = M.makeSim(level);
      while (sim.snapshot().attemptTick < k) sim.step([]);
      const s = sim.snapshot();
      const a = s.anchors[0] as Vec2;
      const va = anchorPathState(level.anchors[0] as never, (k + 0.5) * SIM_DT).velocity;
      const nx = s.player.position.x - a.x;
      const ny = s.player.position.y - a.y;
      side.push(Math.sign(-(s.player.velocity.x - va.x) * ny + (s.player.velocity.y - va.y) * nx));
      sim.step([{ type: 'ropeAim', target: a }, { type: 'ropePress' }]);
      if (!sim.snapshot().rope?.locked) throw new Error(`attach failed at ${String(k)}`);
      let wentSlack = false;
      for (let i = 1; i < hold; i++) {
        sim.step([]);
        if (!sim.snapshot().rope?.taut) wentSlack = true;
      }
      slack.push(wentSlack);
      sim.step([{ type: 'ropeRelease' }]);
      vs.push(sim.snapshot().player.velocity);
    }
    return { vs, side, slack };
  };
  // Reversal at `to` 0.2 s (12 ticks) into the attempt.
  const turning = (span: number, period: number, axis: 'x' | 'y'): M.PathSpec => ({
    span,
    period,
    axis,
    phase: 0.5 - 0.2 / period,
  });

  it('attaching before vs after reversal changes the outcome smoothly', () => {
    const rows = [
      '| path | player offset from turn point | hold ticks | max Δv between neighbouring attach ticks, m/s | catch-direction flips (Δv there) | attach ticks with a slack spell |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    const cases: [string, M.PathSpec | null][] = [
      ['fixed anchor', null],
      ['x span 8 T 4', turning(8, 4, 'x')],
      ['x span 10.5 T 4.2', turning(10.5, 4.2, 'x')],
      ['y span 8 T 4', turning(8, 4, 'y')],
      ['x span 12 T 3 (outside)', turning(12, 3, 'x')],
    ];
    for (const [name, path] of cases) {
      for (const off of [vec2(3, 3), vec2(1, 5), vec2(-2, 4), vec2(-3, 3)]) {
        for (const hold of [30, 60, 90]) {
          const { vs, side, slack } = reversalSweep(path, off, hold);
          let flips = 0;
          let maxJump = 0;
          let flipJump = 0;
          for (let k = 1; k < vs.length; k++) {
            const a = vs[k - 1] as Vec2;
            const b = vs[k] as Vec2;
            const jump = Math.hypot(a.x - b.x, a.y - b.y);
            const flip = side[k] !== side[k - 1] && side[k] !== 0 && side[k - 1] !== 0;
            const slackSpell = slack[k] === true || slack[k - 1] === true;
            if (flip) {
              flips++;
              flipJump = Math.max(flipJump, jump);
            } else if (!slackSpell) maxJump = Math.max(maxJump, jump);
            // Learnable: a big change between neighbouring ticks only where the catch flips
            // direction (the relative velocity at the catch passes through the rope line) or the
            // rope went slack and re-caught during the ride. Both are rope rules, not the pivot.
            // The continuous momentum catch (CATCH_BLEND = 1) peaks at 1.9 m/s per attach tick here.
            if (!name.includes('outside')) {
              expect(
                flip || slackSpell || jump < 2,
                `${name} ${String(off.x)},${String(off.y)} hold ${String(hold)} k ${String(k)} jump ${jump.toFixed(2)} side ${String(side[k - 1])}->${String(side[k])}`,
              ).toBe(true);
            }
          }
          if (!name.includes('outside')) expect(flips).toBeLessThanOrEqual(1);
          rows.push(
            `| ${name} | ${String(off.x)}, ${String(off.y)} | ${String(hold)} | ${maxJump.toFixed(2)} | ${String(flips)}${flips ? ` (${flipJump.toFixed(1)})` : ''} | ${String(slack.filter(Boolean).length)} |`,
          );
        }
      }
    }
    report.push(
      '### Attach tick sweep across the reversal (12 ticks before to 12 after), jumps excluding catch flips',
      ...rows,
      '',
    );
  });
});

describe('lab-moving level', () => {
  const level = parseLevel(labMovingJson);

  it('parses, has horizontal, vertical, fast and reversal movers, all inside the envelope', () => {
    const ids = level.anchors.map((a) => a.id);
    expect(ids).toEqual(['h-mover', 'v-mover', 'fast-mover', 'turn-before', 'turn-after']);
    for (const a of level.anchors) {
      const path = a.path;
      if (!path) throw new Error(`${a.id} should move`);
      const peaks = anchorPathPeaks(a.position, path.to, path.period);
      expect(peaks.speed).toBeLessThanOrEqual(MAX_ANCHOR_SPEED);
      expect(peaks.accel).toBeLessThanOrEqual(MAX_ANCHOR_ACCEL);
    }
    const fast = level.anchors[2];
    if (!fast?.path) throw new Error('fast-mover should move');
    expect(anchorPathPeaks(fast.position, fast.path.to, fast.path.period).speed).toBeGreaterThan(
      0.95 * MAX_ANCHOR_SPEED,
    );
    expect(level.anchors[1]?.path?.to.x).toBe(level.anchors[1]?.position.x); // vertical
  });

  /** Run right, jump, tether to h-mover, ride, release; restart at 420; 600 ticks. */
  const bot = (s: SimSnapshot, tick: number, st: { phase: string; at: number }): Intent[] => {
    const out: Intent[] = [];
    if (tick === 0) out.push({ type: 'move', axis: 1 });
    if (tick === 420) out.push({ type: 'restart' });
    if (st.phase === 'run' && s.player.mode === 'grounded' && s.player.position.x > 8.6) {
      out.push({ type: 'jumpPress' });
      st.phase = 'jump';
      st.at = tick;
    } else if (st.phase === 'jump' && tick - st.at > 6) {
      out.push({ type: 'ropeAim', target: s.anchors[0] as Vec2 });
      if (s.target?.valid) {
        out.push({ type: 'ropePress' });
        st.phase = 'swing';
        st.at = tick;
      }
    } else if (st.phase === 'swing' && tick - st.at === 70) {
      out.push({ type: 'ropeRelease' }, { type: 'jumpRelease' });
      st.phase = 'done';
    }
    return out;
  };
  const record = () => {
    const sim = new Simulation(M.tuning, new KinematicPhysicsAdapter(), level);
    const st = { phase: 'run', at: 0 };
    const inputs: (readonly Intent[])[] = [];
    const hashes = [hashSnapshot(sim.snapshot())];
    const events: string[] = [];
    for (let t = 0; t < 600; t++) {
      const intents = bot(sim.snapshot(), t, st);
      inputs.push(intents);
      sim.step(intents);
      events.push(...sim.drainEvents().map((e) => e.type));
      hashes.push(hashSnapshot(sim.snapshot()));
    }
    return { inputs, hashes, events };
  };

  it('a moving-anchor run is bit-identical on replay, through the frame clock and under jitter', () => {
    const a = record();
    expect(a.events).toContain('ropeAttach');
    expect(a.events).toContain('ropeRelease');
    expect(record().hashes).toEqual(a.hashes);
    const source: IntentSource = { poll: (tick) => a.inputs[tick] ?? [] };
    const fixture = { level, tuning: { sim: M.tuning } } as unknown as Fixture;
    const fixtureFull: Fixture = {
      ...fixture,
      tuning: { clock: { maxStepsPerFrame: 5, maxFrameDelta: 0.25 }, sim: M.tuning },
    };
    const rng = new SeededRng(26);
    expect(hashRunFramed(fixtureFull, source, 600, () => 0.003 + rng.next() * 0.045)).toEqual(
      a.hashes,
    );
  });

  it('reset (restart or death) restores every anchor exactly to its tick-0 path state', () => {
    const fresh = new Simulation(M.tuning, new KinematicPhysicsAdapter(), level);
    const tick0 = fresh.snapshot().anchors;
    expect(tick0[4]).toEqual(anchorPathState(level.anchors[4] as never, 0).position); // phase 0.5
    const sim = new Simulation(M.tuning, new KinematicPhysicsAdapter(), level);
    for (let i = 0; i < 173; i++) sim.step([]);
    expect(sim.snapshot().anchors).not.toEqual(tick0);
    sim.step([{ type: 'restart' }]);
    fresh.step([]);
    // Same attempt tick, same anchors, bit for bit.
    expect(sim.snapshot().attemptTick).toBe(1);
    expect(sim.snapshot().anchors).toEqual(fresh.snapshot().anchors);
    expect(sim.snapshot().anchorVelocities).toEqual(fresh.snapshot().anchorVelocities);
    // Death: walk off the start platform into the lethal floor.
    const dying = new Simulation(M.tuning, new KinematicPhysicsAdapter(), level);
    let died = false;
    for (let i = 0; i < 400 && !died; i++) {
      dying.step(i === 0 ? [{ type: 'move', axis: 1 }] : []);
      died = dying.drainEvents().some((e) => e.type === 'death');
    }
    expect(died).toBe(true);
    expect(dying.snapshot().attemptTick).toBe(0);
    expect(dying.snapshot().anchors).toEqual(tick0);
  });
});
