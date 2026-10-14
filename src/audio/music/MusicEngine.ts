import type { MusicSink, MusicTargets } from './MusicDirector';
import {
  BANKS,
  midiToHz,
  notesForBeat,
  SECONDS_PER_BEAT,
  SECTION_1,
  stingNotes,
  type Bank,
  type StingCue,
  type Layer,
  type NoteEvent,
} from './score';
import { Transport } from './transport';

/**
 * Plays the score on the shared AudioContext's music bus (GMR-42). Raw WebAudio, no library. The
 * transport starts once and is never restarted; layer gains ramp toward the director's targets on
 * the audio clock. Nothing here can block or feed back into the game.
 */
const WAKE_MS = 25;
const RAMP_TC = 0.25;
const LAYERS: readonly Layer[] = ['base', 'pulse', 'tension', 'sting'];
/** Clear-sting level, about -6 dB from #92 (owner 2026-10-14: "reduce levels a bit, subtle"). */
const STING_GAIN = 0.5;

export class MusicEngine implements MusicSink {
  private transport: Transport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly gains = new Map<Layer, GainNode>();
  private echo: AudioNode[] = [];
  /** Shared dotted-8th "space" send for the plucks, arpeggio and clap (clean width, no mud). */
  private space: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bank: Bank = SECTION_1;
  private pendingBank: Bank | null = null;
  private targets: MusicTargets = {
    base: 1,
    pulse: 0.2,
    tension: 0.15,
    dipping: false,
    bank: 'section-1',
  };
  /** The bank being left: its base layer plays softly for one more bar (a 1-bar overlap). */
  private fading: { bank: Bank; until: number } | null = null;

  constructor(private readonly output: () => { ctx: AudioContext; bus: GainNode } | null) {}

  /** Start the clock once audio is unlocked. Safe to call repeatedly; it only starts once. */
  start(): void {
    if (this.transport) return;
    const out = this.output();
    if (!out || out.ctx.state !== 'running') return;
    const { ctx, bus } = out;
    for (const layer of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = layer === 'sting' ? STING_GAIN : 0;
      g.connect(bus);
      this.gains.set(layer, g);
    }
    // The sting rings into a soft dotted-8th echo, darkened each repeat: a tail, not a slapback.
    const sting = this.gains.get('sting');
    if (sting) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = SECONDS_PER_BEAT * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1900;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      sting.connect(delay).connect(tone).connect(fb).connect(delay);
      tone.connect(wet).connect(bus);
      this.echo = [delay, tone, fb, wet];
    }
    {
      const send = ctx.createGain();
      send.gain.value = 0.16;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = SECONDS_PER_BEAT * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      send.connect(delay).connect(hp).connect(lp).connect(fb).connect(delay);
      lp.connect(bus);
      this.space = send;
      this.echo.push(send, delay, hp, lp, fb);
    }
    this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    // Fixed pseudo-random noise (no Math.random in the score path; any noise works, this is stable).
    let s = 0x1234567;
    for (let i = 0; i < data.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
    this.transport = new Transport(ctx.currentTime + 0.1);
    this.applyTargets(ctx.currentTime);
    this.timer = setInterval(() => {
      this.wake();
    }, WAKE_MS);
  }

  setTargets(t: MusicTargets): void {
    const changed =
      Math.abs(t.base - this.targets.base) > 0.01 ||
      Math.abs(t.pulse - this.targets.pulse) > 0.01 ||
      Math.abs(t.tension - this.targets.tension) > 0.01 ||
      t.dipping !== this.targets.dipping;
    if (t.bank !== this.bank.id && BANKS[t.bank]) this.pendingBank = BANKS[t.bank] ?? null;
    this.targets = t;
    const out = this.output();
    if (changed && out && this.transport) this.applyTargets(out.ctx.currentTime);
  }

  /** One line for the debug overlay (AGENTS: new state is visible). */
  debugLine(): string {
    if (!this.transport) return 'music: waiting for audio unlock';
    const t = this.targets;
    const bar = Math.floor(this.transport.beat / 4);
    return `music ${this.bank.id} bar ${String(bar)} | base ${t.base.toFixed(2)} pulse ${t.pulse.toFixed(2)} tension ${t.tension.toFixed(2)}${t.dipping ? ' (dip)' : ''}`;
  }

  sting(cue: StingCue): void {
    const out = this.output();
    if (!out || !this.transport) return;
    // Land on the next 8th of the grid: it answers the moment and still sits in time.
    const { beat, time } = this.transport.gridAfter(out.ctx.currentTime + 0.03, 0.5);
    for (const n of stingNotes(this.bank, cue, beat)) this.play(out.ctx, n, time);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const g of this.gains.values()) g.disconnect();
    this.gains.clear();
    for (const n of this.echo) n.disconnect();
    this.echo = [];
    this.space = null;
    this.transport = null;
  }

  private wake(): void {
    const out = this.output();
    if (!out || !this.transport || out.ctx.state !== 'running') return;
    for (const { beat, time } of this.transport.pump(out.ctx.currentTime)) {
      if (beat % 4 === 0 && this.pendingBank) {
        this.fading = { bank: this.bank, until: beat + 4 };
        this.bank = this.pendingBank;
        this.pendingBank = null;
      }
      for (const n of notesForBeat(this.bank, beat)) this.play(out.ctx, n, time);
      if (this.fading && beat < this.fading.until) {
        for (const n of notesForBeat(this.fading.bank, beat))
          if (n.layer === 'base') this.play(out.ctx, { ...n, velocity: n.velocity * 0.5 }, time);
      } else this.fading = null;
    }
  }

  /**
   * Base and pulse follow at once with a short ramp (pulse tracks movement energy continuously, by
   * design). Tension is chamber-driven, so it changes on the next bar line and crossfades over one
   * bar, except a death dip, which drops at once (about 0.15 s) and recovers on a bar line.
   */
  private applyTargets(now: number): void {
    const set = (layer: Layer, v: number, at: number, tc: number): void => {
      this.gains.get(layer)?.gain.setTargetAtTime(v, at, tc);
    };
    set('base', 0.5 * this.targets.base, now, RAMP_TC);
    set('pulse', 0.35 * this.targets.pulse, now, RAMP_TC);
    const tension = 0.22 * this.targets.tension;
    const g = this.gains.get('tension')?.gain;
    if (!g) return;
    // Every tension instruction supersedes any ramp still pending (for example a bar-line chamber
    // ramp scheduled just before a death), so a dip can never be overridden mid-way.
    holdAt(g, now);
    if (this.targets.dipping || !this.transport) g.setTargetAtTime(tension, now, 0.15 / 3);
    else g.setTargetAtTime(tension, this.transport.nextBarTime().time, (SECONDS_PER_BEAT * 4) / 3);
  }

  private play(ctx: AudioContext, n: NoteEvent, beatTime: number): void {
    const dest = this.gains.get(n.layer);
    if (!dest) return;
    const t = beatTime + n.at * SECONDS_PER_BEAT;
    const len = n.length * SECONDS_PER_BEAT;
    const amp = ctx.createGain();
    let pan: StereoPannerNode | null = null;
    if (n.pan && typeof ctx.createStereoPanner === 'function') {
      pan = ctx.createStereoPanner();
      pan.pan.value = n.pan;
      amp.connect(pan).connect(dest);
    } else amp.connect(dest);
    const end = (stopAt: number, ...nodes: AudioScheduledSourceNode[]): void => {
      for (const node of nodes) {
        node.start(t);
        node.stop(stopAt);
      }
      // Free the per-note gain once the voice is done (no node build-up over a long session).
      nodes[0]?.addEventListener('ended', () => {
        amp.disconnect();
        pan?.disconnect();
      });
    };
    const toSpace = (): void => {
      if (this.space) amp.connect(this.space);
    };
    switch (n.voice) {
      case 'keys': {
        // Glass pluck: two slightly detuned saws through a resonant low-pass that snaps shut.
        const f = midiToHz(n.note);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 2.2;
        lp.frequency.setValueAtTime(3400, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.28);
        lp.connect(amp);
        const a = ctx.createOscillator();
        a.type = 'sawtooth';
        a.frequency.value = f * 0.998;
        const b = ctx.createOscillator();
        b.type = 'sawtooth';
        b.frequency.value = f * 1.002;
        const mix = ctx.createGain();
        mix.gain.value = 0.32;
        a.connect(mix);
        b.connect(mix);
        mix.connect(lp);
        envelope(amp.gain, t, 0.004, 0.42 * n.velocity, 0.25, len, 0.35);
        toSpace();
        end(t + len + 0.5, a, b);
        break;
      }
      case 'arp': {
        // Bright square blip, quickly closed: the whimsy sparkle riding on top of movement.
        const f = midiToHz(n.note);
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(5200, t);
        lp.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
        osc.connect(lp).connect(amp);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(0.16 * n.velocity, t + 0.003);
        amp.gain.setTargetAtTime(0, t + 0.01, 0.05);
        toSpace();
        end(t + len + 0.3, osc);
        break;
      }
      case 'chime': {
        // Digital bell: a sine carrier with a 2:1 FM modulator whose index falls away, so it
        // opens bright and glassy and settles to a pure tone. Long free decay, legato overlaps.
        const f = midiToHz(n.note);
        const a = ctx.createOscillator();
        a.type = 'sine';
        a.frequency.value = f;
        const m = ctx.createOscillator();
        m.type = 'sine';
        m.frequency.value = f * 2;
        const idx = ctx.createGain();
        idx.gain.setValueAtTime(f * 1.4, t);
        idx.gain.setTargetAtTime(f * 0.08, t, 0.18);
        m.connect(idx).connect(a.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5000;
        a.connect(lp).connect(amp);
        const peak = 0.55 * n.velocity;
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(peak, t + 0.01);
        amp.gain.setTargetAtTime(peak * 0.25, t + 0.01, 0.5);
        amp.gain.setTargetAtTime(0, t + len, 0.35);
        end(t + len + 1.6, a, m);
        break;
      }
      case 'pad': {
        const f = midiToHz(n.note);
        const a = ctx.createOscillator();
        a.type = 'triangle';
        a.frequency.value = f * 0.998;
        const b = ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = f * 1.002;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        a.connect(lp);
        b.connect(lp);
        lp.connect(amp);
        envelope(amp.gain, t, 0.35, 0.4 * n.velocity, 0.8, len, 1.4);
        end(t + len + 1.6, a, b);
        break;
      }
      case 'bass': {
        // Round sub: a sine body plus a quiet saw for definition, its filter closing fast.
        const f = midiToHz(n.note);
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = f;
        const saw = ctx.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 1.4;
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
        const sawGain = ctx.createGain();
        sawGain.gain.value = 0.35;
        saw.connect(sawGain).connect(lp);
        sub.connect(lp);
        lp.connect(amp);
        envelope(amp.gain, t, 0.005, 1.1 * n.velocity, 0.55, len, 0.12);
        end(t + len + 0.2, sub, saw);
        break;
      }
      case 'kick': {
        // Soft electronic kick: a sine that drops from a short click to a low thump.
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
        osc.connect(amp);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(1.3 * n.velocity, t + 0.003);
        amp.gain.exponentialRampToValueAtTime(0.0005, t + 0.32);
        end(t + 0.34, osc);
        break;
      }
      case 'clap':
      case 'hat': {
        if (!this.noise) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        const clap = n.voice === 'clap';
        f.type = clap ? 'bandpass' : 'highpass';
        f.frequency.value = clap ? 1700 : n.note === 46 ? 7600 : 9500;
        f.Q.value = clap ? 1.1 : 0.7;
        src.connect(f).connect(amp);
        const decay = clap ? 0.16 : n.note === 46 ? 0.07 : 0.03;
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime((clap ? 1.6 : 1.1) * n.velocity, t + 0.002);
        amp.gain.exponentialRampToValueAtTime(0.0005, t + decay);
        if (clap) toSpace();
        end(t + decay + 0.02, src);
        break;
      }
      case 'drone': {
        // Airy pad: three detuned saws under a low-pass that slowly opens and closes again.
        const f = midiToHz(n.note);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.6;
        lp.frequency.setValueAtTime(700, t);
        lp.frequency.linearRampToValueAtTime(2200, t + len * 0.5);
        lp.frequency.linearRampToValueAtTime(900, t + len);
        const oscs = [0.996, 1, 1.004].map((d) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f * d;
          o.connect(lp);
          return o;
        });
        lp.connect(amp);
        envelope(amp.gain, t, 1.2, 0.22 * n.velocity, 1, len, 1.8);
        end(t + len + 2, ...oscs);
        break;
      }
    }
  }
}

/** Cancel automation after `t` and hold the current value there (with a fallback for old browsers). */
function holdAt(p: AudioParam, t: number): void {
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(t);
  } else {
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
}

/** Attack to peak, decay to sustain×peak, hold until the note length, then release. */
function envelope(
  g: AudioParam,
  t: number,
  attack: number,
  peak: number,
  sustain: number,
  length: number,
  release: number,
): void {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setTargetAtTime(peak * sustain, t + attack, 0.12);
  g.setTargetAtTime(0, t + Math.max(attack, length), release / 4);
}
