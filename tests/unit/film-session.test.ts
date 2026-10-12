import { describe, expect, it } from 'vitest';
import levelJson from '../../content/levels/1-1.json';
import labJson from '../../content/levels/lab-01.json';
import solution from '../../content/solutions/1-1.json';
import tuningJson from '../../content/tuning/runtime.json';
import {
  encodeReplay,
  REPLAY_VERSION,
  ReplayIntentSource,
  vec2,
  type Replay,
} from '../../src/core';
import type { SimEvent } from '../../src/sim';
import { FilmSession } from '../../src/tools/film/session';
import { hashRunDirect, makeFixture } from '../../src/tools/replay-drift/scenario';

describe('FilmSession', () => {
  it('replays the verified 1-1 solution with the GMR-29 per-tick hashes and completes', () => {
    const session = new FilmSession(levelJson, tuningJson, solution.replay);
    const reference = hashRunDirect(
      makeFixture(levelJson, tuningJson),
      new ReplayIntentSource(session.replay),
      session.replay.ticks,
    );
    const hashes = [session.result().hash];
    const events: SimEvent[] = [];
    const unsubscribe = session.onEvents((batch) => events.push(...batch));
    for (let tick = 0; tick < session.replay.ticks; tick++) {
      session.advance();
      hashes.push(session.result().hash);
    }
    expect(hashes).toEqual(reference);
    expect(session.result()).toMatchObject({
      tick: solution.totalTicks,
      completion: true,
      deaths: 0,
    });
    expect(events.some((event) => event.type === 'exit')).toBe(true);
    unsubscribe();
    session.dispose();
  });

  it('display frames never advance the replay, regardless of their delta', () => {
    const session = new FilmSession(levelJson, tuningJson, solution.replay);
    session.advance();
    const before = session.result();
    const first = session.frame(0);
    const later = session.frame(100);
    expect(session.result()).toEqual(before);
    expect(later).toEqual(first);
    expect(later).toMatchObject({
      previous: { tick: 0 },
      current: { tick: 1 },
      alpha: 1,
      stats: { tick: 1, alpha: 1, stepsLastFrame: 0, frameMsAvg: 0 },
    });
    session.dispose();
  });

  it('refuses to step beyond the recorded input duration', () => {
    const session = new FilmSession(levelJson, tuningJson, solution.replay);
    for (let tick = 0; tick < session.replay.ticks; tick++) session.advance();
    const before = session.result();
    expect(() => {
      session.advance();
    }).toThrow(/replay.*(ended|length|end)/i);
    expect(session.result()).toEqual(before);
    session.dispose();
  });

  it('rejects a route recorded for a different level', () => {
    expect(
      () => new FilmSession({ ...levelJson, id: 'different-level' }, tuningJson, solution.replay),
    ).toThrow(/level/i);
  });

  it('plays assisted recordings using their recorded tier', () => {
    const replay: Replay = {
      version: REPLAY_VERSION,
      build: 'dev',
      level: labJson.id,
      seed: 0,
      ticks: 1,
      inputs: [{ tick: 0, intents: [{ type: 'ropeAim' as const, target: vec2(15.5, 2) }] }],
    };
    for (const mode of ['standard', 'wide-select', 'snap'] as const) {
      const session = new FilmSession(
        { ...labJson, spawn: [10, 7.65] },
        tuningJson,
        encodeReplay({ ...replay, assist: mode }),
      );
      session.advance();
      const current = session.frame(0).current;
      expect(current.assist).toBe(mode);
      expect(current.target?.valid).toBe(mode !== 'standard');
      expect(current.target?.snapped).toBe(mode === 'snap');
      session.dispose();
    }
  });

  it('unsubscribes listeners and stops accepting ticks after disposal', () => {
    const session = new FilmSession(levelJson, tuningJson, solution.replay);
    const events: SimEvent[] = [];
    const unsubscribe = session.onEvents((batch) => events.push(...batch));
    unsubscribe();
    for (let tick = 0; tick < 60; tick++) session.advance();
    expect(events).toEqual([]);
    session.dispose();
    session.dispose();
    expect(() => {
      session.advance();
    }).toThrow(/disposed/i);
  });
});
