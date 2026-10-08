import { expect, it } from 'vitest';
import { exitTelemetry } from '../../src/telemetry/exitTelemetry';
import type { LevelDef, SimEvent } from '../../src/sim';

it('reports crossing location and authored identities rather than a player identifier', () => {
  const level: LevelDef = {
    id: 'lab',
    name: 'Lab',
    telemetry: { levelId: 'chapter1.lab' },
    spawn: { x: 1, y: 1 },
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    killY: 11,
    solids: [],
    anchors: [],
    chambers: [
      {
        id: 'room',
        problem: 'Arrival',
        challengeFamily: 'slot',
        region: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
      },
    ],
  };
  const event: SimEvent = {
    type: 'exitMiss',
    tick: 42,
    attempt: {
      exitId: 'finish',
      family: 'slot',
      at: { x: 8, y: 6 },
      velocity: { x: 12, y: 2 },
      speed: 12.16,
      angleCos: 0.98,
      alignment: 0.7,
      accepted: false,
      reason: 'speed',
    },
  };
  expect(exitTelemetry(level, event)).toEqual({
    name: 'exit_miss',
    props: {
      levelId: 'chapter1.lab',
      chamberId: 'room',
      exitId: 'finish',
      family: 'slot',
      tick: 42,
      x: 8,
      y: 6,
      vx: 12,
      vy: 2,
      speed: 12.16,
      angleCos: 0.98,
      alignment: 0.7,
      accepted: false,
      reason: 'speed',
    },
  });
  expect(exitTelemetry(level, { type: 'reset', tick: 43 })).toBeNull();
});
