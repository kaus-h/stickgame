import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';
import { MusicDirector } from '../../src/audio/music/MusicDirector';
import { MusicEngine } from '../../src/audio/music/MusicEngine';
import { SECONDS_PER_BEAT } from '../../src/audio/music/score';
import { Transport } from '../../src/audio/music/transport';
import { vec2 } from '../../src/core';
import type { LevelDef, SimEvent, SimSnapshot } from '../../src/sim';

/** Just enough of Web Audio to run the engine headless and count nodes. */
function fakeContext() {
  const stats = { gains: 0, disconnects: 0, started: 0 };
  const ended: (() => void)[] = [];
  const param = () => ({
    value: 1,
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({
    connect: (n: unknown) => n,
    disconnect: () => {
      stats.disconnects++;
    },
  });
  const source = () => ({
    ...node(),
    type: '',
    frequency: param(),
    playbackRate: param(),
    buffer: null as unknown,
    start: () => {
      stats.started++;
    },
    stop: vi.fn(),
    addEventListener: (_e: string, cb: () => void) => ended.push(cb),
  });
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0,
    destination: node(),
    createGain: () => {
      stats.gains++;
      return { ...node(), gain: param() };
    },
    createOscillator: source,
    createBufferSource: source,
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createDelay: () => ({ ...node(), delayTime: param() }),
    createBuffer: (_c: number, n: number) => ({
      getChannelData: () => new Float32Array(n),
      copyToChannel: vi.fn(),
    }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, stats, ended };
}

const level: LevelDef = {
  id: 'm',
  name: 'm',
  spawn: vec2(1, 0),
  bounds: { minX: 0, maxX: 10, minY: -5, maxY: 5 },
  killY: 10,
  solids: [],
  anchors: [],
};
const snap = { player: { position: vec2(1, 0), velocity: vec2(0, 0) } } as unknown as SimSnapshot;

describe('music engine (GMR-42)', () => {
  it('starts exactly once, and 25 rapid deaths never restart the transport', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const bus = f.raw.createGain() as unknown as GainNode;
    const engine = new MusicEngine(() => ({ ctx: f.ctx, bus }));
    const director = new MusicDirector(engine, level);
    engine.start();
    const gainsAfterStart = f.stats.gains;
    engine.start();
    engine.start();
    expect(f.stats.gains).toBe(gainsAfterStart); // no second set of layers
    const transport = (engine as unknown as { transport: Transport }).transport;
    for (let i = 0; i < 25; i++) {
      director.onEvents([{ type: 'death' } as SimEvent, { type: 'reset' } as SimEvent]);
      director.onFrame(snap, 1 / 60);
      f.raw.currentTime += 60 / 25 / 60; // 25 deaths in about a minute... compressed to 1 s here
      vi.advanceTimersByTime(25);
    }
    expect((engine as unknown as { transport: Transport }).transport).toBe(transport);
    expect(transport.beat).toBeGreaterThan(0);
    engine.dispose();
    vi.useRealTimers();
  });

  it('frees every per-note node when its voice ends (no build-up over a session)', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const bus = f.raw.createGain() as unknown as GainNode;
    const engine = new MusicEngine(() => ({ ctx: f.ctx, bus }));
    engine.start();
    for (let i = 0; i < 80; i++) {
      f.raw.currentTime += 0.05;
      vi.advanceTimersByTime(25);
    }
    expect(f.ended.length).toBeGreaterThan(20);
    const before = f.stats.disconnects;
    for (const cb of f.ended) cb();
    expect(f.stats.disconnects - before).toBe(f.ended.length);
    engine.dispose();
    vi.useRealTimers();
  });

  it('a short stall (under a bar) skips the overdue beats instead of firing them late', () => {
    const t = new Transport(0);
    t.pump(0.1);
    const after = t.pump(1.3); // stalled ~1.2 s, half a bar
    for (const b of after) expect(b.time).toBeGreaterThanOrEqual(1.3 - 0.02);
    expect(after[0]?.time ?? 0).toBeCloseTo((after[0]?.beat ?? 0) * SECONDS_PER_BEAT, 9);
  });

  it('a death dip cancels a pending bar-line tension ramp, so the dip holds', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const bus = f.raw.createGain() as unknown as GainNode;
    const engine = new MusicEngine(() => ({ ctx: f.ctx, bus }));
    engine.start();
    const tension = (
      engine as unknown as {
        gains: Map<
          string,
          {
            gain: {
              setTargetAtTime: ReturnType<typeof vi.fn>;
              cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
            };
          }
        >;
      }
    ).gains.get('tension')?.gain;
    if (!tension) throw new Error('no tension layer');
    f.raw.currentTime = 1.0;
    vi.advanceTimersByTime(25); // the scheduler has caught up to now
    // Entering a harder chamber: the rise is scheduled for the next bar line (in the future).
    engine.setTargets({ base: 1, pulse: 0.2, tension: 0.8, dipping: false, bank: 'section-1' });
    const rise = tension.setTargetAtTime.mock.calls.at(-1) as [number, number, number];
    expect(rise[1]).toBeGreaterThan(1.0);
    // A death just before that bar line: the pending ramp is cancelled at once, then the dip.
    f.raw.currentTime = 1.1;
    engine.setTargets({ base: 1, pulse: 0.2, tension: 0.2, dipping: true, bank: 'section-1' });
    expect(tension.cancelAndHoldAtTime).toHaveBeenLastCalledWith(1.1);
    const dip = tension.setTargetAtTime.mock.calls.at(-1) as [number, number, number];
    expect(dip[0]).toBeCloseTo(0.22 * 0.2);
    expect(dip[1]).toBe(1.1);
    expect(dip[1]).toBeLessThan(rise[1]);
    engine.dispose();
    vi.useRealTimers();
  });

  it('mute silences the music bus, and unmute restores the music volume', () => {
    const f = fakeContext();
    const audio = new AudioEngine({}, () => f.ctx);
    audio.unlock();
    audio.setVolume('music', 0.6);
    const bus = audio.musicOutput()?.bus as unknown as { gain: { value: number } };
    expect(bus.gain.value).toBeCloseTo(0.6);
    audio.setMuted(true);
    expect(bus.gain.value).toBe(0);
    audio.setMuted(false);
    expect(bus.gain.value).toBeCloseTo(0.6);
  });
});
