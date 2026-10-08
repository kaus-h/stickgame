import {
  BUILD_HASH,
  decodeReplay,
  encodeReplay,
  REPLAY_VERSION,
  ReplayIntentSource,
  type ReplayInput,
} from '../../core';
import { parseLevel, parseRuntimeTuning, type RuntimeTuning } from '../../content';
import type { LevelDef } from '../../sim';
import { chamberSpecs, goalReached, inside, type ChamberGoal, type ChamberSpec } from './goals';
import { PlanSource, type PlanStep } from './plan';
import { DEFAULT_SEARCH, searchChamber, type SearchOptions } from './search';
import {
  centre,
  measureWindow,
  simplify,
  timedInputs,
  type ChamberRun,
  type TimingWindow,
} from './windows';
import { runPlan, World } from './world';

/** Bumped when the fixture format or the meaning of its numbers changes. */
export const SOLVER_VERSION = 1;

export interface SolverOptions {
  readonly search: SearchOptions;
  /** Window scan limit either side of each input, ticks. */
  readonly maxShift: number;
  /** Variations may reach the goal this many ticks later than the found route. */
  readonly deadlineSlack: number;
  /** Solve only this chamber. */
  readonly chamber?: string;
  /**
   * With `chamber`: start at rest on the checkpoint inside that chamber instead of chaining from
   * the spawn. Faster while authoring; produces no replay (the start is not reachable by input).
   */
  readonly fromCheckpoint?: boolean;
}

export const DEFAULT_SOLVER: SolverOptions = {
  search: DEFAULT_SEARCH,
  maxShift: 40,
  deadlineSlack: 120,
};

export interface ChamberReport {
  readonly id: string;
  readonly problem: string | null;
  readonly challengeFamily: string | null;
  readonly goal: ChamberGoal;
  readonly solved: boolean;
  /** Tick the chamber attempt started on (the previous chamber's goal tick, or 0). */
  readonly startTick: number;
  /** Tick (exclusive) the goal was reached on. */
  readonly endTick: number | null;
  /** Solution length, ticks. */
  readonly ticks: number | null;
  /** This chamber's steps, absolute ticks. */
  readonly plan: readonly PlanStep[];
  /** Window of every timed input of this chamber's plan. */
  readonly windows: readonly TimingWindow[];
  /** Smallest jump/rope window (move changes are listed but excluded here). */
  readonly tightestWindow: TimingWindow | null;
  readonly search: {
    readonly expansions: number;
    readonly simTicks: number;
    readonly deathsEncountered: number;
  };
}

export interface SolutionFile {
  readonly format: typeof SOLVER_VERSION;
  readonly level: string;
  readonly solved: boolean;
  /** 'spawn', or the checkpoint a single-chamber run started on. */
  readonly start: string;
  readonly totalTicks: number | null;
  readonly chambers: readonly ChamberReport[];
  /** Findings worth an author's attention (unused required shots, unsolved chambers). */
  readonly notes: readonly string[];
  /** Encoded full-level replay from the spawn (null when unsolved or not from the spawn). */
  readonly replay: string | null;
}

/** Parse level and tuning JSON and solve. */
export function solveLevelJson(
  levelJson: unknown,
  tuningJson: unknown,
  options: Partial<SolverOptions> = {},
): SolutionFile {
  return solveLevel(parseLevel(levelJson), parseRuntimeTuning(tuningJson), {
    ...DEFAULT_SOLVER,
    ...options,
  });
}

/**
 * Solve every chamber in order from the spawn, chaining each chamber's route into the next, then
 * shrink each route (drop unneeded steps, centre jump/rope inputs in their windows), measure the
 * timing windows and record the whole route as a replay re-verified from a fresh simulation.
 */
export function solveLevel(
  level: LevelDef,
  tuning: RuntimeTuning,
  options: SolverOptions = DEFAULT_SOLVER,
): SolutionFile {
  const specs = chamberSpecs(level);
  const notes: string[] = [];
  if (specs.length === 0) {
    return {
      format: SOLVER_VERSION,
      level: level.id,
      solved: false,
      start: 'spawn',
      totalTicks: null,
      chambers: [],
      notes: ['Skipped: the level has no chambers and no exit, so there is no goal to prove.'],
      replay: null,
    };
  }

  let world = World.create(level, tuning);
  let todo = specs;
  let start = 'spawn';
  if (options.chamber !== undefined) {
    const index = specs.findIndex((s) => s.id === options.chamber);
    if (index < 0) throw new Error(`route-solver: no chamber "${options.chamber}" in ${level.id}`);
    if (options.fromCheckpoint) {
      const region = level.chambers?.find((c) => c.id === options.chamber)?.region;
      const cp = level.checkpoints?.find((c) => region && inside(c.position, region));
      if (!cp) throw new Error(`route-solver: chamber "${options.chamber}" has no checkpoint`);
      world.teleport(cp.position);
      start = cp.id;
      todo = specs.slice(index, index + 1);
    } else todo = specs.slice(0, index + 1);
  }

  let steps: PlanStep[] = [];
  const chambers: ChamberReport[] = [];
  let failed = false;
  for (const spec of todo) {
    const meta = level.chambers?.find((c) => c.id === spec.id);
    const base = {
      id: spec.id,
      problem: meta?.problem ?? null,
      challengeFamily: meta?.challengeFamily ?? null,
      goal: spec.goal,
      startTick: world.tick,
    };
    if (failed) {
      chambers.push({
        ...base,
        solved: false,
        endTick: null,
        ticks: null,
        plan: [],
        windows: [],
        tightestWindow: null,
        search: { expansions: 0, simTicks: 0, deathsEncountered: 0 },
      });
      continue;
    }
    const found = searchChamber(world, steps, spec, level, tuning, options.search);
    const search = {
      expansions: found.expansions,
      simTicks: found.simTicks,
      deathsEncountered: found.deaths,
    };
    if (!found.solved) {
      failed = true;
      notes.push(
        `Chamber ${spec.id}: no route found within ${String(options.search.maxSimTicks)} simulated ticks.`,
      );
      chambers.push({
        ...base,
        solved: false,
        endTick: null,
        ticks: null,
        plan: [],
        windows: [],
        tightestWindow: null,
        search,
      });
      continue;
    }
    const from = world.tick;
    const run: ChamberRun = {
      start: world,
      goal: spec.goal,
      level,
      deadline: found.endTick + options.deadlineSlack,
    };
    let plan = simplify(run, found.steps, from);
    plan = centre(run, plan, from, options.maxShift);
    const windows = timedInputs(plan, from).map((input) =>
      measureWindow(run, plan, input, from, options.maxShift),
    );
    const timed = windows.filter((w) => w.action !== 'move');
    const tightest = timed.reduce<TimingWindow | null>(
      (best, w) => (best === null || w.size < best.size ? w : best),
      null,
    );
    const next = world.fork();
    const end = runPlan(next, new PlanSource(plan, level), run.deadline, (w, events) =>
      goalReached(spec.goal, w, events),
    );
    if (!end.stopped) throw new Error(`route-solver: refined route for ${spec.id} stopped working`);
    chambers.push({
      ...base,
      solved: true,
      endTick: end.tick,
      ticks: end.tick - from,
      plan: plan.filter((s) => s.t >= from),
      windows,
      tightestWindow: tightest,
      search,
    });
    steps = plan;
    world = next;
  }

  const solved = !failed;
  notes.push(...unusedRequiredShots(level, steps));
  let replay: string | null = null;
  let totalTicks: number | null = null;
  if (solved && start === 'spawn') {
    totalTicks = world.tick;
    replay = recordReplay(level, tuning, steps, totalTicks, todo);
  }
  return {
    format: SOLVER_VERSION,
    level: level.id,
    solved,
    start,
    totalTicks,
    chambers,
    notes,
    replay,
  };
}

/** Anchors tagged as required shots that the found route never ropes to. */
function unusedRequiredShots(level: LevelDef, steps: readonly PlanStep[]): string[] {
  const used = new Set(steps.flatMap((s) => (s.action === 'rope' ? [s.anchor] : [])));
  return level.anchors.flatMap((a, i) =>
    a.requiredFrom && !used.has(i)
      ? [
          `Anchor ${a.id} is tagged as a required shot, but the found route does not use it: the chamber can be completed without that shot.`,
        ]
      : [],
  );
}

/** Record the whole route from a fresh simulation and check it again before encoding. */
function recordReplay(
  level: LevelDef,
  tuning: RuntimeTuning,
  steps: readonly PlanStep[],
  ticks: number,
  specs: readonly ChamberSpec[],
): string {
  const world = World.create(level, tuning);
  const plan = new PlanSource(steps, level);
  const inputs: ReplayInput[] = [];
  const recorder = {
    intents: (tick: number, before: Parameters<PlanSource['intents']>[1]) => {
      const intents = plan.intents(tick, before);
      if (intents.length > 0) inputs.push({ tick, intents });
      return intents;
    },
  };
  let next = 0;
  const r = runPlan(world, recorder, ticks, (w, events) => {
    const spec = specs[next];
    if (spec && goalReached(spec.goal, w, events)) next++;
    return false;
  });
  if (r.died || next !== specs.length)
    throw new Error(`route-solver: recorded route for ${level.id} does not reach every goal`);
  return encodeReplay({
    version: REPLAY_VERSION,
    build: BUILD_HASH,
    level: level.id,
    seed: 0,
    ticks,
    inputs,
  });
}

export interface Verification {
  readonly ok: boolean;
  /** Goals reached, in chamber order. */
  readonly reached: number;
  readonly goals: number;
  readonly deaths: number;
  readonly ticks: number;
}

/**
 * Replay a committed solution from a fresh simulation (no search) and check that it still reaches
 * every chamber goal in order, ending at the exit when the level has one, without dying.
 */
export function verifySolution(
  level: LevelDef,
  tuning: RuntimeTuning,
  file: Pick<SolutionFile, 'replay' | 'chambers'>,
): Verification {
  const goals = file.chambers.map((c) => c.goal);
  if (!file.replay) return { ok: false, reached: 0, goals: goals.length, deaths: 0, ticks: 0 };
  const replay = decodeReplay(file.replay, BUILD_HASH).replay;
  const source = new ReplayIntentSource(replay);
  const world = World.create(level, tuning);
  let reached = 0;
  let deaths = 0;
  while (world.tick < replay.ticks) {
    const events = world.step({ intents: (tick) => source.poll(tick) });
    deaths += events.filter((e) => e.type === 'death').length;
    const goal = goals[reached];
    if (goal && goalReached(goal, world, events)) reached++;
  }
  return {
    ok: deaths === 0 && reached === goals.length && goals.length > 0,
    reached,
    goals: goals.length,
    deaths,
    ticks: replay.ticks,
  };
}
