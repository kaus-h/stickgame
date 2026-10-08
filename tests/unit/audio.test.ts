import { describe, expect, it } from 'vitest';
import sfxJson from '../../content/audio/sfx.json';
import {
  parseSfxBank,
  renderSfx,
  SfxDirector,
  SfxParamsError,
  type SfxParams,
  type SfxSink,
} from '../../src/audio';
import { vec2 } from '../../src/core';
import type { SimEvent, SimSnapshot } from '../../src/sim';

const bank = parseSfxBank(sfxJson);

describe('procedural SFX (GMR-41)', () => {
  it('covers every doc 08 core event shipped in Section 1', () => {
    for (const name of [
      'jump',
      'stomp',
      'land',
      'ropeShot',
      'ropeConnect',
      'ropeInvalid',
      'ropeTaut',
      'ropeRelease',
      'death',
      'retry',
      'exit',
    ]) {
      expect(bank[name], name).toBeDefined();
    }
  });

  it('renders every sound finite, in range, short and identical on every load', () => {
    for (const [name, p] of Object.entries(bank)) {
      const a = renderSfx(p, 48_000);
      const b = renderSfx(p, 48_000);
      expect(a.length, name).toBeLessThan(48_000 * 0.6);
      expect(
        a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1),
        name,
      ).toBe(true);
      expect(Math.max(...a.map(Math.abs)), name).toBeGreaterThan(0.02); // audible
      expect(a).toEqual(b);
    }
  });

  it('death and retry sounds are short enough never to overlap the next attempt meaningfully', () => {
    const seconds = (n: string) => renderSfx(bank[n] as SfxParams, 48_000).length / 48_000;
    expect(seconds('death')).toBeLessThan(0.3);
    expect(seconds('retry')).toBeLessThan(0.1);
  });

  it('rejects malformed parameter sets with the offending field', () => {
    expect(() => parseSfxBank({ x: { wave: 'kazoo' } })).toThrow(SfxParamsError);
    expect(() =>
      parseSfxBank({ x: { wave: 'sine', freq: 1, attack: 0, sustain: 0, release: 0, gain: 2 } }),
    ).toThrow('x.gain');
    expect(() =>
      parseSfxBank({ x: { wave: 'sine', freq: 1, attack: 0, sustain: 5, release: 0, gain: 1 } }),
    ).toThrow('longer than 3 s');
  });
});

describe('SfxDirector', () => {
  const recorder = (): SfxSink & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, play: (name) => calls.push(name) };
  };

  it('maps simulation events to sounds, never waiting on audio', () => {
    const sink = recorder();
    const d = new SfxDirector(sink);
    const events: SimEvent[] = [
      { type: 'jump', tick: 1 },
      { type: 'land', tick: 2, speed: 1 }, // soft: silent
      { type: 'land', tick: 3, speed: 12 },
      { type: 'ropeAttach', tick: 4, anchor: 0, length: 6 },
      { type: 'ropeInvalid', tick: 5, reason: 'too-far', at: vec2(0, 0) },
      { type: 'ropeRelease', tick: 6, velocity: vec2(5, 0) },
      { type: 'exit', tick: 7, attemptTicks: 100, runTicks: 100 },
      { type: 'reset', tick: 8 },
    ];
    d.onEvents(events);
    expect(sink.calls).toEqual([
      'jump',
      'land',
      'ropeShot',
      'ropeConnect',
      'ropeShot',
      'ropeInvalid',
      'ropeRelease',
      'exit',
      'retry',
    ]);
  });

  it('twangs once when a locked rope snaps taut', () => {
    const sink = recorder();
    const d = new SfxDirector(sink);
    const snap = (taut: boolean): SimSnapshot =>
      ({
        player: { velocity: vec2(5, 0) },
        rope: { anchor: 0, point: vec2(0, 0), length: 5, locked: true, taut, attachedTick: 0 },
      }) as unknown as SimSnapshot;
    d.onFrame(snap(false));
    d.onFrame(snap(true));
    d.onFrame(snap(true));
    expect(sink.calls).toEqual(['ropeTaut']);
  });

  it('plays the distinct stomp cue on confirmed defeat only', () => {
    const sink = recorder();
    const director = new SfxDirector(sink);
    director.onEvents([
      {
        type: 'stomp',
        tick: 5,
        enemy: 'goon-a',
        at: vec2(2, 3),
        velocity: vec2(4, 8),
        rebound: vec2(4, -15),
      },
    ]);
    expect(sink.calls).toEqual(['stomp']);
    expect(renderSfx(bank.stomp as SfxParams, 48_000).length / 48_000).toBeLessThan(0.15);
  });

  it('keeps the success cue silent on a rejected exit', () => {
    const sink = recorder();
    new SfxDirector(sink).onEvents([
      {
        type: 'exitMiss',
        tick: 1,
        attempt: {
          exitId: 'slot-a',
          family: 'slot',
          at: vec2(1, 2),
          velocity: vec2(3, 4),
          speed: 5,
          angleCos: 0.6,
          alignment: 0.5,
          accepted: false,
          reason: 'angle',
        },
      },
    ]);
    expect(sink.calls).toEqual([]);
  });
});
