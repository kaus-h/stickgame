import { describe, expect, it } from 'vitest';
import levelJson from '../../content/levels/1-1.json';
import solution from '../../content/solutions/1-1.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { ReplayIntentSource, decodeReplay } from '../../src/core';
import { parseLevel } from '../../src/content';
import { PlanSource, parseRuntimeTuning, World, type PlanStep } from '../../src/tools/route-solver';

/**
 * 1-1's rope-length lessons (GMR-114 level pass, docs/levels/1-1-first-rope.md). The route solver
 * finds *a* route through each chamber, not necessarily the one the chamber teaches, so the taught
 * routes and the mistakes they correct are pinned here with the real simulation.
 *
 * - C4 "too long": a rope connected on the ground locks at the ledge edge and its arc dips into
 *   the red pool. Jump first and connect in the air near the anchor: a short rope stays clear.
 * - C5 "too short": running off the edge locks a short rope that falls short. Jump early, far
 *   from the anchor, so the rope locks long and the arc carries to the far ledge.
 */
const level = parseLevel(levelJson);
const tuning = parseRuntimeTuning(runtimeJson);
const A4 = level.anchors.findIndex((a) => a.id === 'a4');
const A5 = level.anchors.findIndex((a) => a.id === 'a5');

/** The committed route up to tick 390: running right along C3's ledge toward C4. */
function onC3Ledge(): World {
  const replay = decodeReplay(solution.replay, 'dev').replay;
  const source = new ReplayIntentSource(replay);
  const world = World.create(level, tuning);
  while (world.tick < 390) world.step({ intents: (t) => source.poll(t) });
  return world;
}

const start = onC3Ledge();

/** Step a fork of the C3-ledge state through `steps`; stops at a death or when `done` holds. */
function run(steps: PlanStep[], ticks: number, done: (w: World) => boolean = () => false) {
  const world = start.fork();
  const source = new PlanSource(steps, level);
  const attached: number[] = [];
  const locks: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const events = world.step(source);
    for (const e of events) {
      if (e.type === 'ropeAttach') attached.push(e.anchor);
      if (e.type === 'ropeLock') locks.push(e.length);
      if (e.type === 'death') return { died: true, at: world.tick, attached, locks, world };
    }
    if (done(world)) break;
  }
  return { died: false, at: world.tick, attached, locks, world };
}

function standingOn(world: World, minX: number, maxX: number): boolean {
  const s = world.sim.snapshot();
  return s.player.mode === 'grounded' && s.player.position.x >= minX && s.player.position.x <= maxX;
}

/** C4 taught route: jump off C3's ledge, connect to a4 near the apex, release onto C4's ledge. */
const C4_TAUGHT: PlanStep[] = [
  { t: 400, action: 'jump', hold: 20 },
  { t: 418, action: 'rope', anchor: A4, offset: 0, release: 462 },
];

describe('1-1 rope-length lessons (GMR-114)', () => {
  it('C4: a rope connected on the ground is too long and dips into the red pool', () => {
    for (let press = 396; press <= 410; press += 2) {
      const r = run([{ t: press, action: 'rope', anchor: A4, offset: 2, release: 520 }], 160);
      expect(r.died, `ground press ${String(press)}`).toBe(true);
      expect(r.locks[0] ?? 0).toBeGreaterThan(7.5);
    }
  });

  it('C4: jumping first and connecting near the apex keeps the rope short and clear', () => {
    const r = run(C4_TAUGHT, 160, (w) => standingOn(w, 68, 76));
    expect(r.died).toBe(false);
    expect(r.locks[0] ?? 99).toBeLessThan(6);
    expect(standingOn(r.world, 68, 76)).toBe(true);
  });

  it('C5: running off the edge locks a short rope that never reaches the far ledge', () => {
    for (let release = 560; release <= 640; release += 4) {
      const r = run(
        [...C4_TAUGHT, { t: 487, action: 'rope', anchor: A5, offset: 0, release }],
        330,
      );
      expect(r.died, `run-off release ${String(release)}`).toBe(true);
      expect(r.locks[1] ?? 0).toBeLessThan(6.5);
    }
  });

  it('C5: jumping early locks a long rope that carries to the far ledge in one swing', () => {
    for (const release of [585, 594, 606, 618]) {
      const r = run(
        [
          ...C4_TAUGHT,
          { t: 487, action: 'rope', anchor: A5, offset: 0, release },
          { t: 493, action: 'jump', hold: 14 },
        ],
        330,
        (w) => standingOn(w, 90, 98),
      );
      expect(r.died, `release ${String(release)}`).toBe(false);
      expect(r.attached).toEqual([A4, A5]);
      expect(r.locks[1] ?? 0).toBeGreaterThan(7.5);
      expect(standingOn(r.world, 90, 98)).toBe(true);
    }
  });

  it('has no anchor the player can never use', () => {
    // m6, above c6's ceiling, was removed in the GMR-114 pass: no reachable state had the energy
    // to get above the slab, so it was a visible promise the level could not keep.
    expect(level.anchors.map((a) => a.id)).toEqual(['a2', 'a3', 'r3', 'a4', 'a5', 'a6a', 'a6b']);
  });
});
