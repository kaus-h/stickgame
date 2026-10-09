import { describe, expect, it } from 'vitest';
import levelJson from '../../content/levels/1-3.json';
import mainSolution from '../../content/solutions/1-3.json';
import runtimeJson from '../../content/tuning/runtime.json';
import masterySolution from '../../docs/levels/1-3-mastery-route.json';
import { ReplayIntentSource, decodeReplay } from '../../src/core';
import { parseLevel } from '../../src/content';
import {
  chamberSpecs,
  goalReached,
  parseRuntimeTuning as parseSolverRuntimeTuning,
  World,
} from '../../src/tools/route-solver';
import { measureWindow, timedInputs } from '../../src/tools/route-solver/windows';
import type { PlanStep } from '../../src/tools/route-solver/plan';
import type { SimEvent } from '../../src/sim';

const level = parseLevel(levelJson);
const tuning = parseSolverRuntimeTuning(runtimeJson);
const goals = chamberSpecs(level);

function replayFromSpawn(encoded: string) {
  const replay = decodeReplay(encoded, 'dev').replay;
  const source = new ReplayIntentSource(replay);
  const world = World.create(level, tuning);
  const events: SimEvent[] = [];
  const releaseEvidence: { before: { x: number; y: number }; event: { x: number; y: number } }[] =
    [];
  const reached: { id: string; tick: number }[] = [];
  let nextGoal = 0;

  for (let tick = 0; tick < replay.ticks; tick++) {
    const before = world.sim.snapshot();
    const tickEvents = world.step({ intents: (at) => source.poll(at) });
    for (const event of tickEvents) {
      if (event.type === 'ropeRelease') {
        releaseEvidence.push({ before: before.player.velocity, event: event.velocity });
      }
    }
    events.push(...tickEvents);
    while (nextGoal < goals.length) {
      const goal = goals[nextGoal];
      if (!goal || !goalReached(goal.goal, world, tickEvents)) break;
      reached.push({ id: goal.id, tick: world.tick });
      nextGoal++;
    }
  }

  return { replay, world, events, reached, releaseEvidence };
}

describe('level 1-3 route proofs', () => {
  it('keeps the default seven-chamber route complete, lethal-free, and inside its timing windows', () => {
    const run = replayFromSpawn(mainSolution.replay);
    const deaths = run.events.filter((event) => event.type === 'death');
    const stomps = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'stomp' }> => event.type === 'stomp',
    );
    const checkpoints = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'checkpoint' }> => event.type === 'checkpoint',
    );
    const releases = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'ropeRelease' }> => event.type === 'ropeRelease',
    );
    const exits = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'exit' }> => event.type === 'exit',
    );

    expect(mainSolution.totalTicks).toBe(1308);
    expect(run.replay.ticks).toBe(mainSolution.totalTicks);
    expect(run.reached.map(({ id }) => id)).toEqual(goals.map(({ id }) => id));
    expect(run.reached.map(({ tick }) => tick)).toEqual(
      mainSolution.chambers.map(({ endTick }) => endTick),
    );
    expect(deaths).toEqual([]);
    expect(stomps.map(({ enemy }) => enemy)).toEqual(['g1', 'g2', 'g7']);
    for (const stomp of stomps) {
      expect(stomp.velocity.y).toBeGreaterThan(0);
      expect(stomp.rebound.y).toBeLessThan(0);
      expect(stomp.rebound.x).toBeCloseTo(stomp.velocity.x, 8);
    }

    expect(checkpoints.map(({ id }) => id)).toEqual(['1-3-cpA', '1-3-cpB']);
    expect(releases).toHaveLength(6);
    expect(run.releaseEvidence).toHaveLength(releases.length);
    for (const { before, event } of run.releaseEvidence) expect(event).toEqual(before);
    expect(releases.every(({ velocity }) => Math.hypot(velocity.x, velocity.y) > 0)).toBe(true);
    expect(exits).toHaveLength(1);
    expect(exits[0]?.attempt).toMatchObject({ family: 'shaft', accepted: true });

    const windows = mainSolution.chambers.flatMap(({ windows: chamberWindows }) => chamberWindows);
    expect(windows).toHaveLength(24);
    expect(windows.every(({ size }) => size >= 4)).toBe(true);
    expect(mainSolution.chambers.map(({ tightestWindow }) => tightestWindow.size)).toEqual([
      30, 8, 7, 11, 10, 5, 4,
    ]);

    const firstChamber = mainSolution.chambers[0];
    const firstGoal = goals[0];
    if (!firstChamber || !firstGoal) throw new Error('level 1-3 must define its first chamber');
    const plan = firstChamber.plan as unknown as readonly PlanStep[];
    const from = firstChamber.startTick;
    const steeringRun = {
      start: World.create(level, tuning),
      goal: firstGoal.goal,
      level,
      deadline: firstChamber.endTick + 120,
    };
    const steeringWindows = timedInputs(plan, from)
      .filter(({ step }) => plan[step]?.action === 'move')
      .map((input) => measureWindow(steeringRun, plan, input, from, 40));

    expect(steeringWindows).toHaveLength(4);
    expect(
      steeringWindows.map(({ tick, earliest, latest, size, capped }) => ({
        tick,
        earliest,
        latest,
        size,
        capped,
      })),
    ).toEqual([
      { tick: 0, earliest: 0, latest: 6, size: 7, capped: false },
      { tick: 72, earliest: -3, latest: 0, size: 4, capped: false },
      { tick: 76, earliest: -1, latest: 4, size: 6, capped: false },
      { tick: 108, earliest: -25, latest: 40, size: 66, capped: true },
    ]);
    expect([...windows, ...steeringWindows].every(({ size }) => size >= 4)).toBe(true);
  });

  it('keeps the faster m1 mastery replay valid on the original level with g2 alive', () => {
    const run = replayFromSpawn(masterySolution.replay);
    const deaths = run.events.filter((event) => event.type === 'death');
    const stomps = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'stomp' }> => event.type === 'stomp',
    );
    const attaches = run.events.filter(
      (event): event is Extract<SimEvent, { type: 'ropeAttach' }> => event.type === 'ropeAttach',
    );
    const exits = run.events.filter((event) => event.type === 'exit');
    const g2 = run.world.sim.snapshot().enemies.find(({ id }) => id === 'g2');

    expect(run.replay.ticks).toBe(masterySolution.totalTicks);
    expect(masterySolution.totalTicks).toBeLessThan(mainSolution.totalTicks);
    expect(run.reached.map(({ id }) => id)).toEqual(goals.map(({ id }) => id));
    expect(deaths).toEqual([]);
    expect(g2?.alive).toBe(true);
    expect(stomps.map(({ enemy }) => enemy)).toContain('g1');
    expect(stomps.map(({ enemy }) => enemy)).not.toContain('g2');
    expect(attaches.some(({ anchor }) => level.anchors[anchor]?.id === 'm1')).toBe(true);
    expect(exits).toHaveLength(1);
  });
});
