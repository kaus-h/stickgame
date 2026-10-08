import type { LevelDef } from '../../sim';
import { goalReached, type ChamberGoal } from './goals';
import { PlanSource, type PlanStep } from './plan';
import { runPlan, type World } from './world';

/** Where a chamber attempt starts and what it must reach, for re-running variations of a plan. */
export interface ChamberRun {
  readonly start: World;
  readonly goal: ChamberGoal;
  readonly level: LevelDef;
  /** Variations must reach the goal before this tick (exclusive). */
  readonly deadline: number;
}

export interface Evaluation {
  readonly ok: boolean;
  readonly endTick: number;
}

/** Re-run `steps` from the chamber start; ok if the goal is reached before the deadline alive. */
export function evaluate(run: ChamberRun, steps: readonly PlanStep[]): Evaluation {
  const w = run.start.fork();
  const r = runPlan(w, new PlanSource(steps, run.level), run.deadline, (world, events) =>
    goalReached(run.goal, world, events),
  );
  return { ok: r.stopped, endTick: r.tick };
}

/** A timed input of one step: the press (jump, rope or a move change) or the release. */
export interface TimedInput {
  readonly step: number;
  readonly event: 'press' | 'release';
}

/** Contiguous range of shifts (ticks, relative to the plan) that still reach the goal. */
export interface TimingWindow {
  readonly step: number;
  readonly action: PlanStep['action'];
  readonly event: 'press' | 'release';
  /** Absolute tick in the plan. */
  readonly tick: number;
  /** Earliest and latest shift that still works (earliest <= 0 <= latest). */
  readonly earliest: number;
  readonly latest: number;
  /** latest - earliest + 1 ticks. */
  readonly size: number;
  /** True if the scan stopped at `maxShift` (the real window is at least this wide). */
  readonly capped: boolean;
  /** True if the input could not move earlier because the chamber starts there. */
  readonly startClipped: boolean;
}

/** Timed inputs of the steps at or after `from` (earlier chambers are held fixed). */
export function timedInputs(steps: readonly PlanStep[], from: number): TimedInput[] {
  const out: TimedInput[] = [];
  steps.forEach((s, i) => {
    if (s.t < from) {
      // A rope connected in an earlier chamber can still be released in this one.
      if (s.action === 'rope' && s.release !== null && s.release >= from)
        out.push({ step: i, event: 'release' });
      return;
    }
    out.push({ step: i, event: 'press' });
    if (s.action === 'jump' || (s.action === 'rope' && s.release !== null))
      out.push({ step: i, event: 'release' });
  });
  return out;
}

/**
 * The plan with one input moved by `shift` ticks, all other inputs fixed in absolute time, or
 * null if the move breaks the step (release not after press, or before the chamber start).
 */
export function shifted(
  steps: readonly PlanStep[],
  input: TimedInput,
  shift: number,
  from: number,
): PlanStep[] | null {
  const s = steps[input.step];
  if (!s) return null;
  let next: PlanStep;
  if (input.event === 'press') {
    const t = s.t + shift;
    if (t < from) return null;
    if (s.action === 'jump') {
      const hold = s.hold - shift;
      if (hold < 1) return null;
      next = { ...s, t, hold };
    } else if (s.action === 'rope') {
      if (s.release !== null && s.release <= t) return null;
      next = { ...s, t };
    } else next = { ...s, t };
  } else if (s.action === 'jump') {
    const hold = s.hold + shift;
    if (hold < 1) return null;
    next = { ...s, hold };
  } else if (s.action === 'rope' && s.release !== null) {
    const release = s.release + shift;
    if (release <= s.t || release < from) return null;
    next = { ...s, release };
  } else return null;
  const out = steps.slice();
  out[input.step] = next;
  return out;
}

/** Measure one input's window by scanning outward from the plan's own tick. */
export function measureWindow(
  run: ChamberRun,
  steps: readonly PlanStep[],
  input: TimedInput,
  from: number,
  maxShift: number,
): TimingWindow {
  const works = (shift: number) => {
    const plan = shifted(steps, input, shift, from);
    return plan !== null && evaluate(run, plan).ok;
  };
  let earliest = 0;
  while (earliest > -maxShift && works(earliest - 1)) earliest--;
  let latest = 0;
  while (latest < maxShift && works(latest + 1)) latest++;
  const s = steps[input.step] as PlanStep;
  const tick =
    input.event === 'press'
      ? s.t
      : s.action === 'jump'
        ? s.t + s.hold
        : s.action === 'rope'
          ? (s.release ?? s.t)
          : s.t;
  return {
    step: input.step,
    action: s.action,
    event: input.event,
    tick,
    earliest,
    latest,
    size: latest - earliest + 1,
    capped: earliest === -maxShift || latest === maxShift,
    startClipped: tick + earliest - 1 < from,
  };
}

/**
 * Drop steps the route does not need (latest first), keeping the plan a working route. Steps
 * before `from` belong to earlier chambers and are kept.
 */
export function simplify(run: ChamberRun, steps: readonly PlanStep[], from: number): PlanStep[] {
  let plan = steps.slice();
  for (let i = plan.length - 1; i >= 0; i--) {
    if ((plan[i] as PlanStep).t < from) continue;
    const without = plan.filter((_, k) => k !== i);
    if (evaluate(run, without).ok) plan = without;
  }
  return plan;
}

/**
 * Move each jump and rope input to the middle of its own window (1-tick refinement of the
 * coarse search grid), so the reported route is the robust one, not an edge case.
 */
export function centre(
  run: ChamberRun,
  steps: readonly PlanStep[],
  from: number,
  maxShift: number,
): PlanStep[] {
  let plan = steps.slice();
  // Two passes: moving one input changes its neighbours' windows.
  for (let pass = 0; pass < 2; pass++) {
    for (const input of timedInputs(plan, from)) {
      if ((plan[input.step] as PlanStep).action === 'move') continue;
      const w = measureWindow(run, plan, input, from, maxShift);
      const mid = Math.trunc((w.earliest + w.latest) / 2);
      if (mid === 0) continue;
      const next = shifted(plan, input, mid, from);
      if (next && evaluate(run, next).ok) plan = next;
    }
  }
  return plan;
}
