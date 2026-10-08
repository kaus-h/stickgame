/**
 * Procedural sound synthesis (GMR-41). A small, original parameterised synth in the spirit of
 * jsfxr/ZzFX: every sound is a text-editable parameter set rendered to a sample buffer at load,
 * so the game ships no recorded audio and every sound is reviewable as data.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

export interface SfxParams {
  readonly wave: Wave;
  /** Start frequency, Hz. */
  readonly freq: number;
  /** Frequency change per second, Hz/s (negative falls). */
  readonly slide?: number;
  /** Envelope, seconds. */
  readonly attack: number;
  readonly sustain: number;
  readonly release: number;
  /** Peak amplitude 0..1. */
  readonly gain: number;
  /** Square duty cycle 0..1 (square only). */
  readonly duty?: number;
  /** Vibrato depth (fraction of freq) and rate (Hz). */
  readonly vibratoDepth?: number;
  readonly vibratoRate?: number;
  /** One-pole low-pass cutoff, Hz (omit for none). */
  readonly lowpass?: number;
  /** Amount of noise mixed into a tonal wave 0..1. */
  readonly noiseMix?: number;
  /** Pitch jump: at `jumpAt` seconds multiply freq by `jumpBy` (arpeggio-style blips). */
  readonly jumpAt?: number;
  readonly jumpBy?: number;
  /** Seed for the noise generator, so renders are identical every load. */
  readonly seed?: number;
}

/** Deterministic noise in [-1, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

export function sfxDuration(p: SfxParams): number {
  return p.attack + p.sustain + p.release;
}

/** Render a parameter set to mono samples in [-1, 1]. */
export function renderSfx(p: SfxParams, sampleRate: number): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.ceil(sfxDuration(p) * sampleRate));
  const out = new Float32Array(new ArrayBuffer(n * 4));
  const noise = lcg(p.seed ?? 1);
  const duty = p.duty ?? 0.5;
  const alpha = p.lowpass === undefined ? 1 : 1 - Math.exp((-2 * Math.PI * p.lowpass) / sampleRate);
  let phase = 0;
  let lp = 0;
  let held = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let f = Math.max(10, p.freq + (p.slide ?? 0) * t);
    if (p.jumpAt !== undefined && t >= p.jumpAt) f *= p.jumpBy ?? 1;
    if (p.vibratoDepth) f *= 1 + p.vibratoDepth * Math.sin(2 * Math.PI * (p.vibratoRate ?? 6) * t);
    phase = (phase + f / sampleRate) % 1;

    let s: number;
    switch (p.wave) {
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case 'square':
        s = phase < duty ? 1 : -1;
        break;
      case 'saw':
        s = 2 * phase - 1;
        break;
      case 'noise':
        // Sample-and-hold at the wave frequency gives pitched noise (crunch vs hiss).
        if (phase < f / sampleRate) held = noise();
        s = held;
        break;
    }
    if (p.noiseMix) s = s * (1 - p.noiseMix) + noise() * p.noiseMix;

    lp += alpha * (s - lp);

    const env =
      t < p.attack
        ? t / Math.max(p.attack, 1e-6)
        : t < p.attack + p.sustain
          ? 1
          : Math.max(0, 1 - (t - p.attack - p.sustain) / Math.max(p.release, 1e-6));
    out[i] = Math.max(-1, Math.min(1, lp * env * p.gain));
  }
  return out;
}

export class SfxParamsError extends Error {}

const WAVES: readonly Wave[] = ['sine', 'triangle', 'square', 'saw', 'noise'];

/** Validate untrusted JSON (content/audio/sfx.json) into named parameter sets. */
export function parseSfxBank(json: unknown): Record<string, SfxParams> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new SfxParamsError('sfx bank must be an object');
  }
  const out: Record<string, SfxParams> = {};
  for (const [name, raw] of Object.entries(json as Record<string, unknown>)) {
    if (name.startsWith('$')) continue; // $comment and similar
    if (typeof raw !== 'object' || raw === null)
      throw new SfxParamsError(`${name}: must be an object`);
    const r = raw as Record<string, unknown>;
    if (!WAVES.includes(r.wave as Wave)) throw new SfxParamsError(`${name}.wave: unknown wave`);
    for (const key of ['freq', 'attack', 'sustain', 'release', 'gain']) {
      const v = r[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new SfxParamsError(`${name}.${key}: must be a non-negative number`);
      }
    }
    if ((r.gain as number) > 1) throw new SfxParamsError(`${name}.gain: must be ≤ 1`);
    if (sfxDuration(r as unknown as SfxParams) > 3) {
      throw new SfxParamsError(`${name}: longer than 3 s`);
    }
    out[name] = r as unknown as SfxParams;
  }
  return out;
}
