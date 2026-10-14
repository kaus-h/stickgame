/**
 * The music score (GMR-42, Opus direction "torn-page pulse" thinning to "pencil ghosts"). Pure
 * data plus a pure pattern function, so the arrangement is unit-tested and the scheduler just plays
 * what this returns. Everything is derived from the bar and beat index alone: the same bar always
 * sounds the same, and a death never moves the music anywhere.
 */

export type Layer = 'base' | 'pulse' | 'tension' | 'sting';
export type Voice = 'keys' | 'bass' | 'click' | 'drone' | 'chime' | 'pad';

export interface NoteEvent {
  readonly layer: Layer;
  readonly voice: Voice;
  /** MIDI note number (clicks use it to pick a high or low click). */
  readonly note: number;
  /** Offset from the beat start, in beats (swing and 8ths live here). */
  readonly at: number;
  /** Length in beats. */
  readonly length: number;
  /** 0..1 before layer gain. */
  readonly velocity: number;
  /** Stereo position -1..1 (stings only; everything else sits in the centre). */
  readonly pan?: number;
}

export interface Bank {
  readonly id: string;
  /** Chord tones per bar (MIDI), keys voicing. Bass plays the first entry an octave down. */
  readonly bars: readonly (readonly number[])[];
  /** Pedal under the progression (MIDI), for the drone. */
  readonly drone: readonly number[];
  /** A 3-note figure played at the end of each 4-bar phrase, and as the clear sting. */
  readonly motif: readonly number[];
}

export const TEMPO_BPM = 100;
export const BEATS_PER_BAR = 4;
export const SECONDS_PER_BEAT = 60 / TEMPO_BPM;

/** Section 1: D Dorian. Dm9, Dm9, G6/D (the Dorian bright IV), Em7; then Dm9, Fmaj7, G6, Am7(sus). */
export const SECTION_1: Bank = {
  id: 'section-1',
  bars: [
    [50, 57, 60, 64, 65],
    [50, 57, 60, 64, 65],
    [50, 55, 59, 62, 64],
    [52, 55, 59, 62],
    [50, 57, 60, 64, 65],
    [53, 57, 60, 64],
    [55, 59, 62, 64],
    [57, 60, 62, 67],
  ],
  drone: [74, 76],
  motif: [69, 72, 74],
};

/** Section 2: G Aeolian, darker, still sparse. Gm9, Ebmaj7, Cm9, Dsus. */
export const SECTION_2: Bank = {
  id: 'section-2',
  bars: [
    [43, 50, 53, 57, 58],
    [43, 50, 53, 57, 58],
    [51, 55, 58, 62],
    [51, 55, 58, 62],
    [48, 55, 58, 62, 63],
    [48, 55, 58, 62, 63],
    [50, 55, 57, 62],
    [50, 54, 57, 62],
  ],
  drone: [74, 77],
  motif: [67, 70, 74],
};

export const BANKS: Readonly<Record<string, Bank>> = {
  'section-1': SECTION_1,
  'section-2': SECTION_2,
};

/** Deterministic 0..1 from integers (no Math.random: the score is the same every run). */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Everything that starts during `beat` (absolute beat index since the music began). */
export function notesForBeat(bank: Bank, beat: number): NoteEvent[] {
  const bar = Math.floor(beat / BEATS_PER_BAR);
  const inBar = beat % BEATS_PER_BAR;
  const chord = bank.bars[bar % bank.bars.length] ?? [];
  const out: NoteEvent[] = [];
  const root = chord[0] ?? 50;

  // Base: soft keys chord re-struck on beats 1 and 3, slightly spread like a hand on old keys.
  if (inBar === 0 || inBar === 2) {
    chord.slice(1).forEach((note, i) => {
      out.push({
        layer: 'base',
        voice: 'keys',
        note,
        at: i * 0.03,
        length: 1.9,
        velocity: inBar === 0 ? 0.55 : 0.4,
      });
    });
  }
  // Base: muted plucked bass on 1, the "and" of 2 (every other bar), and 3.
  if (inBar === 0)
    out.push({ layer: 'base', voice: 'bass', note: root - 12, at: 0, length: 0.6, velocity: 0.8 });
  if (inBar === 1 && bar % 2 === 1)
    out.push({
      layer: 'base',
      voice: 'bass',
      note: root - 12,
      at: 0.5,
      length: 0.35,
      velocity: 0.55,
    });
  if (inBar === 2)
    out.push({ layer: 'base', voice: 'bass', note: root - 5, at: 0, length: 0.5, velocity: 0.6 });
  // Base: the 3-note motif closes each 4-bar phrase, low in the mix (no lead over gameplay).
  if (bar % 4 === 3 && inBar === 2) {
    bank.motif.forEach((note, i) => {
      out.push({ layer: 'base', voice: 'keys', note, at: i * 0.5, length: 0.6, velocity: 0.32 });
    });
  }

  // Pulse: dry pen clicks in 8ths. Low click on the beat, high on the off-beat, with seeded ghost
  // notes and drops so it never sounds like a metronome (and never like an input cue).
  for (const half of [0, 0.5]) {
    const r = hash(beat, half === 0 ? 1 : 2);
    if (half === 0) {
      out.push({
        layer: 'pulse',
        voice: 'click',
        note: 40,
        at: 0,
        length: 0.1,
        velocity: inBar === 0 ? 0.9 : 0.6,
      });
    } else if (r > 0.18) {
      out.push({
        layer: 'pulse',
        voice: 'click',
        note: 80,
        at: 0.5 + (r - 0.5) * 0.04,
        length: 0.08,
        velocity: 0.35 + r * 0.3,
      });
    }
    if (r > 0.86)
      out.push({
        layer: 'pulse',
        voice: 'click',
        note: 80,
        at: half + 0.25,
        length: 0.05,
        velocity: 0.2,
      });
  }

  // Tension: a sparse high drone, one note per 2 bars, with a flattened-second rub every 8 bars.
  if (inBar === 0 && bar % 2 === 0) {
    const note = bank.drone[(bar / 2) % bank.drone.length] ?? 74;
    out.push({ layer: 'tension', voice: 'drone', note, at: 0, length: 7.5, velocity: 0.5 });
    if (bar % 8 === 6)
      out.push({
        layer: 'tension',
        voice: 'drone',
        note: note + 1,
        at: 4,
        length: 3,
        velocity: 0.22,
      });
  }
  return out;
}

/** Which clear the sting celebrates (owner 2026-10-13: smoother, and never the same jingle twice). */
export interface StingCue {
  /** The chamber just reached (1-based progress through the level), or the chamber count on exit. */
  readonly index: number;
  /** 0..1 through the level: later clears start higher, so the stings climb with the player. */
  readonly progress: number;
  /** The exit: a longer figure that resolves home to the section's tonic over a held chord. */
  readonly final: boolean;
}

/** Index walks through the sting's pitch pool (chord tones and the motif, stacked in the key). */
const CONTOURS: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [1, 0, 2, 4],
  [0, 1, 3, 2],
  [2, 1, 3, 4],
  [0, 2, 3, 5],
];
/** Onsets in beats: triplets, a lilt, an unhurried walk, a quick lean into a held note. */
const RHYTHMS: readonly (readonly number[])[] = [
  [0, 1 / 3, 2 / 3, 1],
  [0, 0.5, 0.75, 1.25],
  [0, 0.5, 1, 1.5],
  [0, 0.25, 0.5, 1],
];
const STING_LOW = 64;
const STING_SPAN = 22;

/**
 * The clear sting: a soft chime arpeggio over a pad bloom, built from the chord that is sounding
 * when it lands, so it always belongs to the bar it falls in. Contour and rhythm change with the
 * chamber and the bar, and the register climbs through the level. Notes ring on into each other
 * (legato, like a held pedal) instead of blipping. The exit resolves to the tonic.
 */
export function stingNotes(bank: Bank, cue: StingCue, beat: number): NoteEvent[] {
  const bar = Math.floor(beat / BEATS_PER_BAR);
  const chord = cue.final ? (bank.bars[0] ?? []) : (bank.bars[bar % bank.bars.length] ?? []);
  const classes = new Set([...chord.slice(1), ...bank.motif].map((n) => n % 12));
  const pool: number[] = [];
  // Skip a note a semitone above one already taken: ringing chimes a half step apart turn muddy.
  for (let n = STING_LOW; n <= STING_LOW + STING_SPAN; n++)
    if (classes.has(n % 12) && pool.at(-1) !== n - 1) pool.push(n);
  const tonic = (bank.bars[0]?.[0] ?? 50) % 12;
  const pick = (k: number) => pool[Math.max(0, Math.min(pool.length - 1, k))] ?? STING_LOW;
  const out: NoteEvent[] = [];

  if (cue.final) {
    // Up through the home chord in triplets, then land on the high tonic and let it ring.
    const top = 79 + ((tonic - 7 + 12) % 12);
    const line = [...pool.filter((n) => n < top).slice(-4), top];
    line.forEach((note, i) => {
      const last = i === line.length - 1;
      out.push({
        layer: 'sting',
        voice: 'chime',
        note,
        at: last ? 2 : i / 3,
        length: last ? 4 : 3 - i / 3,
        velocity: last ? 0.46 : 0.3 + i * 0.02,
        pan: -0.3 + (0.6 * i) / (line.length - 1),
      });
    });
    [(chord[0] ?? 50) + 12, ...chord.slice(1, 3)].forEach((note, i) => {
      out.push({
        layer: 'sting',
        voice: 'pad',
        note,
        at: 1.5 + i * 0.04,
        length: 5,
        velocity: 0.3,
      });
    });
    return out;
  }

  const r = hash(cue.index * 7 + 3, bar);
  const contour = CONTOURS[Math.floor(r * CONTOURS.length)] ?? CONTOURS[0] ?? [0];
  const rhythm = RHYTHMS[(cue.index + Math.floor(r * 97)) % RHYTHMS.length] ?? RHYTHMS[0] ?? [0];
  const start = Math.round(cue.progress * Math.max(0, pool.length - 6));
  const end = (rhythm[rhythm.length - 1] ?? 1) + 1.5;
  contour.forEach((step, i) => {
    const at = rhythm[i] ?? i * 0.5;
    const last = i === contour.length - 1;
    out.push({
      layer: 'sting',
      voice: 'chime',
      note: pick(start + step),
      // Tiny seeded push and pull so the figure breathes like a hand, not a sequencer.
      at: i === 0 ? at : at + (hash(cue.index, bar * 8 + i) - 0.5) * 0.03,
      length: end - at,
      // A gentle swell into the arrival note.
      velocity: last ? 0.42 : 0.32 + i * 0.02,
      pan: (r < 0.5 ? -1 : 1) * (-0.25 + (0.5 * i) / Math.max(1, contour.length - 1)),
    });
  });
  // The bloom under it: two chord tones an octave below the figure, slow in, slow out.
  chord.slice(1, 3).forEach((note, i) => {
    out.push({ layer: 'sting', voice: 'pad', note, at: i * 0.05, length: end, velocity: 0.22 });
  });
  return out;
}

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
