import { expect, it } from 'vitest';
import type { LevelDef, SimEvent } from '../../src/sim';
import { enemyTelemetry } from '../../src/telemetry/enemyTelemetry';

const level: LevelDef = {
  id: 'goon-lab',
  name: 'Goon lab',
  spawn: { x: 1, y: 1 },
  bounds: { minX: 0, minY: 0, maxX: 20, maxY: 10 },
  killY: 11,
  solids: [],
  anchors: [],
  telemetry: { levelId: 'chapter1.stomp' },
  chambers: [
    {
      id: 'bounce',
      problem: 'Continue after contact',
      challengeFamily: 'stomp',
      region: { min: { x: 0, y: 0 }, max: { x: 20, y: 10 } },
    },
  ],
};

it('reports a stomp at contact with authored identity and momentum, without player data', () => {
  const event: SimEvent = {
    type: 'stomp',
    tick: 12,
    enemy: 'goon-1',
    at: { x: 6, y: 7 },
    velocity: { x: 20, y: 26 },
    rebound: { x: 20, y: -15 },
  };
  expect(enemyTelemetry(level, event)).toEqual({
    name: 'enemy_stomp',
    props: {
      levelId: 'chapter1.stomp',
      chamberId: 'bounce',
      enemyId: 'goon-1',
      tick: 12,
      x: 6,
      y: 7,
      vx: 20,
      vy: 26,
      reboundVx: 20,
      reboundVy: -15,
    },
  });
});

it('reports the machine-readable unsafe-contact cause before the instantaneous reset', () => {
  const event: SimEvent = {
    type: 'death',
    cause: 'enemy-contact',
    enemy: 'goon-2',
    solid: null,
    tick: 30,
    attemptTicks: 30,
    at: { x: 8, y: 8 },
    velocity: { x: 7.5, y: 0 },
    rope: null,
  };
  expect(enemyTelemetry(level, event)).toEqual({
    name: 'enemy_contact_death',
    props: {
      levelId: 'chapter1.stomp',
      chamberId: 'bounce',
      enemyId: 'goon-2',
      tick: 30,
      x: 8,
      y: 8,
      vx: 7.5,
      vy: 0,
      cause: 'enemy-contact',
      attemptTicks: 30,
    },
  });
  expect(enemyTelemetry(level, { ...event, cause: 'hazard' })).toBeNull();
  expect(enemyTelemetry(level, { type: 'reset', tick: 31 })).toBeNull();
});
