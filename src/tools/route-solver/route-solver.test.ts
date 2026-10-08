import { describe, expect, it } from 'vitest';
import { decodeReplay, vec2 } from '../../core';
import { parseLevel, parseRuntimeTuning } from '../../content';
import { hashSnapshot, type LevelDef } from '../../sim';
import tuningJson from '../../../content/tuning/runtime.json';
import { chamberSpecs } from './goals';
import { PlanSource, ROPE_OFFSETS, type PlanStep } from './plan';
import { solveLevel, verifySolution, type SolutionFile } from './solve';
import { measureWindow, shifted, type ChamberRun } from './windows';
import { runPlan, World } from './world';

const levelSources = import.meta.glob('../../../content/levels/*.json', {
  eager: true,
  import: 'default',
});
const solutionSources = import.meta.glob('../../../content/solutions/*.json', {
  eager: true,
  import: 'default',
});

const tuning = parseRuntimeTuning(tuningJson);
const levels = new Map<string, LevelDef>(
  Object.values(levelSources).map((json) => {
    const level = parseLevel(json);
    return [level.id, level];
  }),
);
const level = (id: string): LevelDef => {
  const l = levels.get(id);
  if (!l) throw new Error(`no level ${id}`);
  return l;
};

/** A floor with a 3 m gap that needs a running jump; exit box on the far side. */
const gapLevel: LevelDef = {
  id: 'solver-gap',
  name: 'solver gap',
  spawn: vec2(2, 7.65),
  bounds: { minX: 0, minY: -2, maxX: 24, maxY: 12 },
  killY: 11,
  solids: [
    { id: 'a', kind: 'solid', points: [vec2(0, 8), vec2(8, 8), vec2(8, 10), vec2(0, 10)] },
    { id: 'b', kind: 'solid', points: [vec2(11, 8), vec2(24, 8), vec2(24, 10), vec2(11, 10)] },
  ],
  anchors: [],
  exit: { min: vec2(18, 6), max: vec2(20, 8) },
};

describe('route solver: forks', () => {
  it('a fork replays bit-identically and never disturbs the original', () => {
    const lab = level('lab-01');
    const steps: PlanStep[] = [
      { t: 0, action: 'move', axis: 1 },
      { t: 30, action: 'jump', hold: 20 },
      { t: 60, action: 'rope', anchor: 0, offset: 0, release: 110 },
    ];
    const source = new PlanSource(steps, lab);
    const a = World.create(lab, tuning);
    runPlan(a, source, 40, () => false);
    const b = a.fork();
    const before = hashSnapshot(a.sim.snapshot());
    runPlan(b, source, 130, () => false);
    expect(hashSnapshot(a.sim.snapshot())).toBe(before); // the fork's steps left `a` alone
    runPlan(a, source, 130, () => false);
    expect(hashSnapshot(b.sim.snapshot())).toBe(hashSnapshot(a.sim.snapshot()));

    // And both equal a fresh run from tick 0.
    const fresh = World.create(lab, tuning);
    runPlan(fresh, source, 130, () => false);
    expect(hashSnapshot(fresh.sim.snapshot())).toBe(hashSnapshot(a.sim.snapshot()));
  });
});

describe('route solver: plans', () => {
  it('turns steps into the three verbs only, aiming at the anchor disc point of that tick', () => {
    const lab = level('lab-moving');
    const world = World.create(lab, tuning);
    const source = new PlanSource(
      [
        { t: 0, action: 'move', axis: 1 },
        { t: 0, action: 'jump', hold: 3 },
        { t: 0, action: 'rope', anchor: 0, offset: 1, release: 5 },
      ],
      lab,
    );
    const snap = world.sim.snapshot();
    const intents = source.intents(0, () => snap);
    expect(intents.map((i) => i.type)).toEqual(['move', 'ropeAim', 'ropePress', 'jumpPress']);
    const anchor = lab.anchors[0];
    const at = snap.anchors[0];
    const offset = ROPE_OFFSETS[1];
    if (!anchor || !at || !offset) throw new Error('fixture');
    expect(intents[1]).toEqual({
      type: 'ropeAim',
      target: vec2(at.x + offset.x * anchor.radius, at.y + offset.y * anchor.radius),
    });
    expect(source.intents(3, () => snap).map((i) => i.type)).toEqual(['jumpRelease']);
    expect(source.intents(5, () => snap).map((i) => i.type)).toEqual(['ropeRelease']);
  });

  it('shifts one input while holding the others fixed, refusing to invert press and release', () => {
    const steps: PlanStep[] = [{ t: 10, action: 'rope', anchor: 0, offset: 0, release: 14 }];
    expect(shifted(steps, { step: 0, event: 'press' }, 3, 0)).toEqual([
      { t: 13, action: 'rope', anchor: 0, offset: 0, release: 14 },
    ]);
    expect(shifted(steps, { step: 0, event: 'press' }, 4, 0)).toBeNull();
    expect(shifted(steps, { step: 0, event: 'release' }, -4, 0)).toBeNull();
    expect(shifted([{ t: 2, action: 'jump', hold: 5 }], { step: 0, event: 'press' }, -3, 0)).toBe(
      null,
    );
  });
});

describe('route solver: solving', () => {
  it('proves a jump gap, measures the jump window and records a verified replay', () => {
    const file = solveLevel(gapLevel, tuning);
    expect(file.solved).toBe(true);
    const [chamber] = file.chambers;
    expect(chamber?.plan.some((s) => s.action === 'jump')).toBe(true);
    const jump = chamber?.windows.find((w) => w.action === 'jump' && w.event === 'press');
    expect(jump?.size).toBeGreaterThan(1);
    expect(chamber?.tightestWindow).not.toBeNull();
    expect(verifySolution(gapLevel, tuning, file).ok).toBe(true);
    // Same inputs, same answer: the solver is deterministic.
    expect(solveLevel(gapLevel, tuning)).toEqual(file);
  });

  it('a window is the contiguous range of shifts that still reach the goal', () => {
    const steps: PlanStep[] = [
      { t: 0, action: 'move', axis: 1 },
      { t: 30, action: 'jump', hold: 25 },
    ];
    const start = World.create(gapLevel, tuning);
    const [spec] = chamberSpecs(gapLevel);
    if (!spec) throw new Error('fixture');
    const run: ChamberRun = { start, goal: spec.goal, level: gapLevel, deadline: 400 };
    const w = measureWindow(run, steps, { step: 1, event: 'press' }, 0, 40);
    expect(w.earliest).toBeLessThanOrEqual(0);
    expect(w.latest).toBeGreaterThanOrEqual(0);
    // One tick past the window fails (else the scan would have continued).
    const late = shifted(steps, { step: 1, event: 'press' }, w.latest + 1, 0);
    if (late) {
      const world = start.fork();
      const r = runPlan(world, new PlanSource(late, gapLevel), 400, (_w, events) =>
        events.some((e) => e.type === 'exit'),
      );
      expect(r.stopped).toBe(false);
    }
  });

  it('skips a level with neither chambers nor an exit', () => {
    const noGoal: LevelDef = { ...gapLevel };
    delete (noGoal as { exit?: unknown }).exit;
    const file = solveLevel(noGoal, tuning);
    expect(file.solved).toBe(false);
    expect(file.notes[0]).toMatch(/Skipped/);
  });
});

describe('route solver: committed solutions still complete their levels', () => {
  const fixtures = Object.entries(solutionSources).map(([path, json]) => ({
    path,
    file: json as SolutionFile,
  }));

  it('has a solution fixture for every level with an exit or chambers', () => {
    const covered = new Set(fixtures.map((f) => f.file.level));
    for (const l of levels.values()) {
      if (chamberSpecs(l).length > 0) expect(covered, l.id).toContain(l.id);
    }
  });

  for (const { path, file } of fixtures) {
    it(`${file.level}: ${file.solved ? 'replay reaches every chamber goal' : 'recorded as unsolved'}`, () => {
      const lab = level(file.level);
      expect(
        file.chambers.map((c) => c.id),
        `${path}: chambers changed; re-run npm run levels:solve -- ${file.level}`,
      ).toEqual(chamberSpecs(lab).map((s) => s.id));
      if (!file.solved) {
        expect(file.replay).toBeNull();
        expect(file.notes.length).toBeGreaterThan(0);
        return;
      }
      expect(file.replay).not.toBeNull();
      expect(decodeReplay(file.replay ?? '', 'any').replay.level).toBe(file.level);
      const v = verifySolution(lab, tuning, file);
      expect(v, `${path}: re-run npm run levels:solve -- ${file.level}`).toMatchObject({
        ok: true,
        deaths: 0,
      });
    });
  }
});
