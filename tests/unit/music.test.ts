import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import { MusicDirector, type MusicTargets } from '../../src/audio/music/MusicDirector';
import {
  notesForBeat,
  SECONDS_PER_BEAT,
  SECTION_1,
  SECTION_2,
  stingNotes,
} from '../../src/audio/music/score';
import { Transport } from '../../src/audio/music/transport';
import type { LevelDef, SimEvent, SimSnapshot } from '../../src/sim';

describe('music score (GMR-42)', () => {
  it('is a pure function of the beat, and the pitched layers repeat every 8 bars', () => {
    const pitched = (beat: number) =>
      notesForBeat(SECTION_1, beat).filter((n) => n.voice !== 'click');
    for (let beat = 0; beat < 64; beat++) {
      expect(notesForBeat(SECTION_1, beat)).toEqual(notesForBeat(SECTION_1, beat));
      expect(pitched(beat)).toEqual(pitched(beat + 32));
    }
  });

  it('keeps every pitched note inside its section key (no stray accidentals)', () => {
    const dDorian = new Set([2, 4, 5, 7, 9, 11, 0]);
    // G Aeolian plus F# (the raised 7th of the D major V chord, harmonic-minor cadence; deliberate).
    const gAeolian = new Set([7, 9, 10, 0, 2, 3, 5, 6]);
    for (const [bank, scale] of [
      [SECTION_1, dDorian],
      [SECTION_2, gAeolian],
    ] as const) {
      for (let beat = 0; beat < 32 * 4; beat++) {
        for (const n of notesForBeat(bank, beat)) {
          if (n.voice === 'click') continue;
          // The tension layer's deliberate flattened-second rub is the one licensed exception.
          if (n.layer === 'tension' && n.velocity < 0.3) continue;
          expect(
            scale.has(n.note % 12),
            `${bank.id} beat ${String(beat)} note ${String(n.note)}`,
          ).toBe(true);
        }
      }
      for (const n of stingNotes(bank)) expect(scale.has(n.note % 12)).toBe(true);
    }
  });

  it('never puts a lead melody over gameplay: keys stay soft outside the phrase-end motif', () => {
    for (let beat = 0; beat < 32; beat++)
      for (const n of notesForBeat(SECTION_1, beat)) expect(n.velocity).toBeLessThanOrEqual(0.9);
  });
});

describe('music transport (GMR-42)', () => {
  it('returns each beat once, inside the lookahead, on the audio clock', () => {
    const t = new Transport(10);
    const seen: number[] = [];
    for (let now = 10; now < 14; now += 0.025) for (const b of t.pump(now)) seen.push(b.beat);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(Math.floor((4 + 0.15) / SECONDS_PER_BEAT) + 1);
  });

  it('skips a stall to the next bar line instead of replaying the backlog', () => {
    const t = new Transport(0);
    t.pump(0.1);
    // Hidden for 30 s, then the 25 ms timer resumes.
    const after: { beat: number; time: number }[] = [];
    for (let now = 30; now < 32.5; now += 0.025) after.push(...t.pump(now));
    expect(after.length).toBeGreaterThan(0);
    expect(after.length).toBeLessThanOrEqual(6);
    expect((after[0]?.beat ?? 1) % 4).toBe(0);
    expect(after[0]?.time ?? 0).toBeGreaterThanOrEqual(30);
    // Still on the original grid: beat n starts at n beats after the transport's start.
    expect(after[0]?.time ?? 0).toBeCloseTo((after[0]?.beat ?? 0) * SECONDS_PER_BEAT, 9);
  });
});

describe('music director (GMR-42)', () => {
  const level: LevelDef = {
    id: 'm',
    name: 'm',
    section: 'section-2',
    spawn: vec2(1, 0),
    bounds: { minX: 0, maxX: 30, minY: -5, maxY: 5 },
    killY: 10,
    solids: [],
    anchors: [],
    chambers: [
      {
        id: 'c1',
        region: { min: vec2(0, -5), max: vec2(10, 5) },
        problem: 'a',
        challengeFamily: 'x',
      },
      {
        id: 'c2',
        region: { min: vec2(10, -5), max: vec2(20, 5) },
        problem: 'b',
        challengeFamily: 'x',
      },
      {
        id: 'c3',
        region: { min: vec2(20, -5), max: vec2(30, 5) },
        problem: 'c',
        challengeFamily: 'x',
      },
    ],
  };
  const snap = (x: number, speed: number): SimSnapshot =>
    ({ player: { position: vec2(x, 0), velocity: vec2(speed, 0) } }) as unknown as SimSnapshot;
  const make = () => {
    const targets: MusicTargets[] = [];
    let stings = 0;
    const d = new MusicDirector(
      {
        setTargets: (t) => targets.push(t),
        sting: () => {
          stings++;
        },
      },
      level,
    );
    return { d, targets, stings: () => stings };
  };

  it('pulse follows movement energy: swells while moving, fades when standing to plan', () => {
    const { d, targets } = make();
    for (let i = 0; i < 60; i++) d.onFrame(snap(2, 9), 1 / 60);
    const moving = targets.at(-1)?.pulse ?? 0;
    for (let i = 0; i < 300; i++) d.onFrame(snap(2, 0), 1 / 60);
    const still = targets.at(-1)?.pulse ?? 1;
    expect(moving).toBeGreaterThan(0.85);
    expect(still).toBeLessThan(0.3);
  });

  it('stings once per newly reached chamber, rises in tension, and keeps the section bank', () => {
    const { d, targets, stings } = make();
    d.onFrame(snap(2, 0), 1 / 60);
    d.onFrame(snap(12, 0), 1 / 60);
    d.onFrame(snap(2, 0), 1 / 60); // walking back is not progress
    d.onFrame(snap(12, 0), 1 / 60);
    d.onFrame(snap(25, 0), 1 / 60);
    expect(stings()).toBe(2);
    expect(targets.at(-1)?.tension).toBeGreaterThan(targets[0]?.tension ?? 1);
    expect(targets.at(-1)?.bank).toBe('section-2');
  });

  it('a death only dips the tension; it never resets progress or the run', () => {
    const { d, targets, stings } = make();
    d.onFrame(snap(12, 0), 1 / 60);
    const before = targets.at(-1)?.tension ?? 0;
    d.onEvents([{ type: 'death' } as SimEvent]);
    d.onFrame(snap(2, 0), 1 / 60); // respawned back in chamber 1
    expect(targets.at(-1)?.tension).toBeLessThan(before);
    for (let i = 0; i < 120; i++) d.onFrame(snap(2, 0), 1 / 60);
    d.onFrame(snap(12, 0), 1 / 60);
    expect(stings()).toBe(0); // chamber 2 was already reached this run: no second sting
  });
});
