import { describe, expect, it } from 'vitest';
import type { LevelDef, SimEvent, SimSnapshot } from '../../src/sim';
import { installPlaytest, playtestEnabled } from '../../src/app/web/playtest';
import {
  PlaytestRecorder,
  QUESTIONS,
  TelemetryDirector,
  type EventName,
} from '../../src/telemetry';

const level: LevelDef = {
  id: 'lab',
  name: 'Lab',
  telemetry: { levelId: 'chapter-1.lab' },
  spawn: { x: 1, y: 1 },
  bounds: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
  killY: 11,
  anchors: [{ id: 'eye', position: { x: 6, y: 2 }, radius: 0.5 }],
  solids: [],
  chambers: [
    {
      id: 'start',
      problem: 'First tether',
      challengeFamily: 'static',
      region: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
    },
    {
      id: 'end',
      problem: 'Release',
      challengeFamily: 'release',
      region: { min: { x: 10, y: 0 }, max: { x: 20, y: 10 } },
    },
  ],
  checkpoints: [{ id: 'mid', position: { x: 12, y: 5 } }],
};

function snap(patch: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    tick: 0,
    attemptTick: 0,
    resets: 0,
    deaths: 0,
    enemies: [],
    player: { position: { x: 1, y: 1 }, velocity: { x: 0, y: 0 }, mode: 'grounded', facing: 1 },
    rope: null,
    anchors: [{ x: 6, y: 2 }],
    anchorVelocities: [{ x: 0, y: 0 }],
    anchorStates: [],
    aim: null,
    contacts: [],
    lastDeath: null,
    runTick: 0,
    lifeTick: 0,
    lives: 1,
    levelTick: 0,
    respawns: 0,
    checkpoint: -1,
    completion: null,
    lastExitAttempt: null,
    target: null,
    assist: 'standard',
    ...patch,
  };
}

describe('GMR-49 telemetry director', () => {
  it('maps a scripted run to the exact authored, quantized phase-1 events', () => {
    const director = new TelemetryDirector(level);
    expect(director.onEvents([], snap())).toEqual([
      {
        name: 'attempt_start',
        tick: 0,
        props: { levelId: 'chapter-1.lab', life: 1, fromCheckpoint: false },
      },
      {
        name: 'chamber_enter',
        tick: 0,
        props: { levelId: 'chapter-1.lab', chamberId: 'start', firstThisRun: true, runTicks: 0 },
      },
    ]);

    const attached = snap({
      tick: 3,
      attemptTick: 3,
      runTick: 3,
      player: {
        position: { x: 3, y: 3 },
        velocity: { x: 4.26, y: -6.84 },
        mode: 'tethered',
        facing: 1,
      },
      rope: {
        anchor: 0,
        point: { x: 6.32, y: 2.18 },
        length: 3.7,
        locked: true,
        taut: true,
        attachedTick: 2,
      },
    });
    expect(
      director.onEvents([{ type: 'ropeAttach', tick: 2, anchor: 0, length: 3.68 }], attached),
    ).toEqual([
      {
        name: 'rope_attach',
        tick: 2,
        props: {
          levelId: 'chapter-1.lab',
          chamberId: 'start',
          anchorId: 'eye',
          length: 3.7,
          impactOffsetX: 0.3,
          impactOffsetY: 0.2,
          vx: 4.3,
          vy: -6.8,
          grounded: false,
        },
      },
    ]);
    expect(
      director.onEvents(
        [{ type: 'ropeRelease', tick: 12, velocity: { x: 11.95, y: -3.08 } }],
        snap({ tick: 12, runTick: 12, player: { ...attached.player, mode: 'air' } }),
      ),
    ).toEqual([
      {
        name: 'rope_release',
        tick: 12,
        props: {
          levelId: 'chapter-1.lab',
          chamberId: 'start',
          anchorId: 'eye',
          vx: 12,
          vy: -3.1,
          heldTicks: 10,
          cause: 'player',
        },
      },
    ]);
    expect(
      director.onEvents(
        [{ type: 'ropeInvalid', tick: 14, reason: 'too-far', at: { x: 4.26, y: 3.94 } }],
        snap({ tick: 14, runTick: 14 }),
      ),
    ).toEqual([
      {
        name: 'rope_invalid',
        tick: 14,
        props: {
          levelId: 'chapter-1.lab',
          chamberId: 'start',
          reason: 'too-far',
          x: 4.3,
          y: 3.9,
        },
      },
    ]);
    expect(
      director.onEvents(
        [{ type: 'checkpoint', tick: 20, index: 0, id: 'mid', runTicks: 20 }],
        snap({
          tick: 20,
          runTick: 20,
          checkpoint: 0,
          player: { ...attached.player, position: { x: 12, y: 5 } },
        }),
      ),
    ).toEqual([
      {
        name: 'checkpoint',
        tick: 20,
        props: { levelId: 'chapter-1.lab', checkpointId: 'mid', runTicks: 20, lifeCount: 1 },
      },
      {
        name: 'chamber_enter',
        tick: 20,
        props: { levelId: 'chapter-1.lab', chamberId: 'end', firstThisRun: true, runTicks: 20 },
      },
    ]);

    const death: Extract<SimEvent, { type: 'death' }> = {
      type: 'death',
      tick: 30,
      cause: 'hazard',
      at: { x: 12.76, y: 8.96 },
      velocity: { x: 9, y: 10 },
      solid: 'thorns',
      attemptTicks: 30,
      rope: null,
    };
    expect(
      director.onEvents(
        [
          death,
          { type: 'lifeEnd', tick: 30, life: 1, lifeTicks: 30, runTicks: 30, reason: 'death' },
          { type: 'reset', tick: 30 },
          { type: 'respawn', tick: 30, checkpoint: 0, voluntary: false },
        ],
        snap({ tick: 30, runTick: 30, checkpoint: 0, lives: 2, attemptTick: 0 }),
      ),
    ).toEqual([
      {
        name: 'death',
        tick: 30,
        props: {
          levelId: 'chapter-1.lab',
          chamberId: 'end',
          cause: 'hazard',
          x: 12.8,
          y: 9,
          lifeTicks: 30,
          ropeAttached: false,
        },
      },
      {
        name: 'attempt_start',
        tick: 30,
        props: { levelId: 'chapter-1.lab', life: 2, fromCheckpoint: true },
      },
      {
        name: 'chamber_enter',
        tick: 30,
        props: { levelId: 'chapter-1.lab', chamberId: 'start', firstThisRun: false, runTicks: 30 },
      },
    ]);
    expect(
      director.onEvents(
        [
          { type: 'lifeEnd', tick: 60, life: 2, lifeTicks: 30, runTicks: 60, reason: 'exit' },
          { type: 'exit', tick: 60, attemptTicks: 30, runTicks: 60 },
        ],
        snap({ tick: 60, runTick: 60, lives: 2 }),
      ),
    ).toEqual([
      {
        name: 'level_complete',
        tick: 60,
        props: { levelId: 'chapter-1.lab', runTicks: 60, deaths: 1, lives: 2 },
      },
    ]);
    expect(director.onQuit(snap({ tick: 61, runTick: 61 }))).toEqual([]);
  });

  it('deduplicates chambers, resets run counts on restart, and records a single quit', () => {
    const director = new TelemetryDirector(level);
    director.onEvents([], snap());
    director.onEvents(
      [],
      snap({ tick: 5, runTick: 5, player: { ...snap().player, position: { x: 25, y: 5 } } }),
    );
    expect(director.onEvents([], snap({ tick: 6, runTick: 6 }))).toEqual([
      {
        name: 'chamber_enter',
        tick: 6,
        props: { levelId: 'chapter-1.lab', chamberId: 'start', firstThisRun: false, runTicks: 6 },
      },
    ]);
    expect(
      director.onEvents(
        [
          { type: 'lifeEnd', tick: 7, life: 1, lifeTicks: 7, runTicks: 7, reason: 'restart' },
          { type: 'reset', tick: 7 },
        ],
        snap({ tick: 8, runTick: 1 }),
      ),
    ).toEqual([
      {
        name: 'attempt_start',
        tick: 7,
        props: { levelId: 'chapter-1.lab', life: 1, fromCheckpoint: false },
      },
      {
        name: 'chamber_enter',
        tick: 8,
        props: { levelId: 'chapter-1.lab', chamberId: 'start', firstThisRun: true, runTicks: 1 },
      },
    ]);
    const quit = {
      name: 'quit',
      tick: 9,
      props: { levelId: 'chapter-1.lab', chamberId: 'start', runTicks: 2 },
    };
    expect(director.onQuit(snap({ tick: 9, runTick: 2 }))).toEqual([quit]);
    expect(director.onQuit(snap({ tick: 9, runTick: 2 }))).toEqual([]);
  });
});

describe('GMR-49 local recording and consent gate', () => {
  it('has a written question for every event name', () => {
    const names: EventName[] = [
      'attempt_start',
      'death',
      'rope_attach',
      'rope_release',
      'rope_invalid',
      'chamber_enter',
      'checkpoint',
      'level_complete',
      'quit',
    ];
    expect(Object.keys(QUESTIONS).sort()).toEqual([...names].sort());
    for (const name of names) expect(QUESTIONS[name].trim().length).toBeGreaterThan(0);
  });

  it('retains only the latest 50,000 events in chronological order and exports valid JSON', () => {
    const recorder = new PlaytestRecorder('unit-build', 'ephemeral-test-session');
    for (let i = 0; i < 50_003; i++) {
      recorder.record({
        name: 'attempt_start',
        tick: i,
        props: { levelId: 'lab', life: i + 1, fromCheckpoint: false },
      });
    }
    expect(recorder.length).toBe(50_000);
    const data = JSON.parse(recorder.export()) as {
      format: number;
      build: string;
      sessionId: string;
      date: string;
      events: { tick: number }[];
    };
    expect(data.format).toBe(1);
    expect(data.build).toBe('unit-build');
    expect(data.sessionId).toBe('ephemeral-test-session');
    expect(Number.isNaN(Date.parse(data.date))).toBe(false);
    expect(data.events).toHaveLength(50_000);
    expect(data.events[0]?.tick).toBe(3);
    expect(data.events.at(-1)?.tick).toBe(50_002);
  });

  it('does not install any listener or record anything without ?playtest=1', () => {
    for (const search of ['', '?playtest=0', '?playtest', '?x=playtest%3D1', '?playtest=true'])
      expect(playtestEnabled(search)).toBe(false);
    expect(playtestEnabled('?playtest=1')).toBe(true);
    expect(playtestEnabled('?level=lab&playtest=1')).toBe(true);
    let subscribed = 0;
    let snapshots = 0;
    const installed = installPlaytest({
      levelRef: () => level,
      onEvents: () => {
        subscribed++;
        return () => undefined;
      },
      snapshot: () => {
        snapshots++;
        return snap();
      },
      window: { location: { search: '?level=lab' } } as unknown as Window,
    });
    installed.dispose();
    expect(subscribed).toBe(0);
    expect(snapshots).toBe(0);
  });
});
