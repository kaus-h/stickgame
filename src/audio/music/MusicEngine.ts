import type { MusicSink, MusicTargets } from './MusicDirector';
import {
  BANKS,
  midiToHz,
  notesForBeat,
  SECONDS_PER_BEAT,
  SECTION_1,
  stingNotes,
  type Bank,
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

export class MusicEngine implements MusicSink {
  private transport: Transport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly gains = new Map<Layer, GainNode>();
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
      g.gain.value = layer === 'sting' ? 1 : 0;
      g.connect(bus);
      this.gains.set(layer, g);
    }
    this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
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

  sting(): void {
    const out = this.output();
    if (!out || !this.transport) return;
    const { time } = this.transport.nextBarTime();
    // Land on the next beat rather than the bar if the bar is far: stings answer the moment.
    const at = Math.min(time, out.ctx.currentTime + SECONDS_PER_BEAT);
    for (const n of stingNotes(this.bank)) this.play(out.ctx, n, at);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const g of this.gains.values()) g.disconnect();
    this.gains.clear();
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
    if (this.targets.dipping || !this.transport) set('tension', tension, now, 0.15 / 3);
    else set('tension', tension, this.transport.nextBarTime().time, (SECONDS_PER_BEAT * 4) / 3);
  }

  private play(ctx: AudioContext, n: NoteEvent, beatTime: number): void {
    const dest = this.gains.get(n.layer);
    if (!dest) return;
    const t = beatTime + n.at * SECONDS_PER_BEAT;
    const len = n.length * SECONDS_PER_BEAT;
    const amp = ctx.createGain();
    amp.connect(dest);
    const end = (stopAt: number, ...nodes: AudioScheduledSourceNode[]): void => {
      for (const node of nodes) {
        node.start(t);
        node.stop(stopAt);
      }
      // Free the per-note gain once the voice is done (no node build-up over a long session).
      nodes[0]?.addEventListener('ended', () => {
        amp.disconnect();
      });
    };
    switch (n.voice) {
      case 'keys': {
        const f = midiToHz(n.note);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3200;
        lp.connect(amp);
        const a = ctx.createOscillator();
        a.type = 'triangle';
        a.frequency.value = f;
        const b = ctx.createOscillator();
        b.type = 'sine';
        b.frequency.value = f * 2.003;
        const bg = ctx.createGain();
        bg.gain.value = 0.4;
        a.connect(lp);
        b.connect(bg).connect(lp);
        envelope(amp.gain, t, 0.012, 0.5 * n.velocity, 0.35, len, 0.5);
        end(t + len + 0.6, a, b);
        break;
      }
      case 'bass': {
        const f = midiToHz(n.note);
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.8;
        lp.frequency.setValueAtTime(950, t);
        lp.frequency.exponentialRampToValueAtTime(220, t + 0.22);
        osc.connect(lp).connect(amp);
        envelope(amp.gain, t, 0.004, 1.2 * n.velocity, 0.2, len, 0.12);
        end(t + len + 0.2, osc);
        break;
      }
      case 'click': {
        if (!this.noise) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = n.note >= 60 ? 3600 : 1300;
        bp.Q.value = 5;
        src.connect(bp).connect(amp);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(3.2 * n.velocity, t + 0.002);
        amp.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
        end(t + 0.06, src);
        break;
      }
      case 'drone': {
        const f = midiToHz(n.note);
        const a = ctx.createOscillator();
        a.type = 'sawtooth';
        a.frequency.value = f;
        const b = ctx.createOscillator();
        b.type = 'sawtooth';
        b.frequency.value = f * 1.004;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1300;
        const trem = ctx.createGain();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2;
        const depth = ctx.createGain();
        depth.gain.value = 0.35;
        lfo.connect(depth).connect(trem.gain);
        trem.gain.value = 0.65;
        a.connect(lp);
        b.connect(lp);
        lp.connect(trem).connect(amp);
        envelope(amp.gain, t, 1.2, 0.3 * n.velocity, 1, len, 1.8);
        end(t + len + 2, a, b, lfo);
        break;
      }
    }
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
