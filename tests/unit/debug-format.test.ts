import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import runtimeJson from '../../content/tuning/runtime.json';
import { parseLevel, parseRuntimeTuning } from '../../src/content';
import { vec2 } from '../../src/core';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import { Simulation, type ExitAttempt, type SimEvent } from '../../src/sim';
import type { RuntimeStats } from '../../src/render/frame';
import { EventLog, formatEvent, formatOverlay } from '../../src/render/debug/format';

const stats: RuntimeStats = {
  simHz: 60,
  stepsLastFrame: 1,
  alpha: 0.5,
  frameMsAvg: 16.7,
  frameMsMax: 17,
  simStepMsAvg: 0.01,
  cappedFrames: 0,
  droppedSeconds: 0,
  tick: 0,
  attemptTick: 0,
  resets: 0,
  entities: 5,
  bodies: 1,
  joints: 0,
  paused: false,
};

describe('debug overlay formatting', () => {
  const attempt: ExitAttempt = {
    exitId: 'slot-a',
    family: 'slot',
    at: vec2(1, 2),
    velocity: vec2(3, 4),
    speed: 5,
    angleCos: 0.6,
    alignment: 0.4,
    accepted: false,
    reason: 'angle',
  };
  it('exposes authored exit identity and arrival evidence for misses and completion', () => {
    const miss = formatEvent({ type: 'exitMiss', tick: 10, attempt });
    expect(miss).toContain('slot-a slot angle at 1.00, 2.00');
    expect(miss).toContain('v(3.00, 4.00) 5.00 m/s cos 0.600 alignment 0.400');
    const accepted = { ...attempt, accepted: true, reason: null };
    expect(
      formatEvent({ type: 'exit', tick: 11, attemptTicks: 120, runTicks: 120, attempt: accepted }),
    ).toContain('slot-a slot accepted');
    const sim = new Simulation(
      parseRuntimeTuning(runtimeJson).sim,
      new KinematicPhysicsAdapter(),
      parseLevel(lab01),
    );
    const lines = formatOverlay(
      {
        ...sim.snapshot(),
        completion: { ...accepted, tick: 11, attemptTicks: 120, runTicks: 120 },
        lastExitAttempt: { ...attempt, tick: 10 },
      },
      stats,
    );
    expect(lines).toContain(
      'completion #11 2.00 s slot-a slot accepted at 1.00, 2.00 v(3.00, 4.00) 5.00 m/s cos 0.600 alignment 0.400',
    );
    expect(lines.some((line) => line.startsWith('last exit #10'))).toBe(true);
  });
  it('formats every event type on one line', () => {
    const events: SimEvent[] = [
      { type: 'reset', tick: 1 },
      { type: 'jump', tick: 2 },
      { type: 'land', tick: 3, speed: 12.25 },
      {
        type: 'death',
        tick: 4,
        cause: 'hazard',
        at: vec2(1, 2),
        velocity: vec2(3, 4),
        solid: 'lava',
        attemptTicks: 100,
        rope: { anchor: 0, point: vec2(0, 0), length: 5 },
      },
      { type: 'exit', tick: 5, attemptTicks: 120, runTicks: 120 },
      { type: 'ropeAttach', tick: 6, anchor: 1, length: 4.5 },
      { type: 'ropeLock', tick: 7, length: 4.25 },
      { type: 'ropeRelease', tick: 8, velocity: vec2(6, -8) },
      { type: 'ropeInvalid', tick: 9, reason: 'blocked', at: vec2(1, 1) },
    ];
    const lines = events.map(formatEvent);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
    expect(lines[3]).toContain('death hazard (lava)');
    expect(lines[3]).toContain('5.0 m/s');
    expect(lines[7]).toContain('10.0 m/s');
    expect(lines[8]).toContain('invalid blocked');
  });

  it('keeps a bounded log, newest last', () => {
    const log = new EventLog(3);
    log.push([1, 2, 3, 4, 5].map((tick) => ({ type: 'jump', tick }) as const));
    expect(log.events().map((e) => e.tick)).toEqual([3, 4, 5]);
    expect(log.tail(2)).toHaveLength(2);
    expect(log.tail(1)[0]).toContain('5');
  });

  it('exposes every required field from a live simulation', () => {
    const sim = new Simulation(
      parseRuntimeTuning(runtimeJson).sim,
      new KinematicPhysicsAdapter(),
      parseLevel(lab01),
    );
    sim.step([{ type: 'ropeAim', target: vec2(13.5, 2) }]);
    const text = formatOverlay(sim.snapshot(), stats).join('\n');
    for (const field of [
      'pos',
      'vel',
      'grounded',
      'rope',
      'target',
      'contacts',
      'last death',
      'resets',
      'step',
    ]) {
      expect(text).toContain(field);
    }
  });
});
