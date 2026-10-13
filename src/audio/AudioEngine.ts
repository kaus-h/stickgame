import { renderRoomTone, ROOM_TONE_GAIN } from './ambience';
import { renderSfx, type SfxParams } from './synth';

export interface PlayOptions {
  /** Linear gain multiplier, default 1. */
  readonly gain?: number;
  /** Playback-rate multiplier (pitch and speed), default 1. */
  readonly rate?: number;
}

/**
 * Thin Web Audio layer (GMR-41): one AudioContext for the app's lifetime (iOS requirement),
 * master to sfx/music buses, sounds pre-rendered to AudioBuffers. Playing is fire-and-forget: it
 * never awaits, so audio can never delay simulation or retry.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly volume = { master: 0.8, sfx: 1, music: 0.6 };
  private muted = false;

  constructor(
    private readonly bank: Record<string, SfxParams>,
    private readonly createContext: () => AudioContext | null = () =>
      typeof AudioContext === 'undefined' ? null : new AudioContext({ latencyHint: 'interactive' }),
  ) {}

  /**
   * Create (once) and resume the context. Browsers only allow this from a user gesture, so the app
   * calls it on the first pointer or key press and on every later gesture until it is running.
   */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.createContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolume();
      for (const [name, params] of Object.entries(this.bank)) {
        const samples = renderSfx(params, this.ctx.sampleRate);
        const buf = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
        buf.copyToChannel(samples, 0);
        this.buffers.set(name, buf);
      }
      this.startRoomTone(this.ctx, this.music);
    }
    // iOS reports 'interrupted' after calls or Siri; any non-running state is retried on a gesture.
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  /** The context and music bus for the music engine (GMR-42); null until audio is unlocked. */
  /** The quiet room under the music: looped forever, so mute and the music slider govern it. */
  private startRoomTone(ctx: AudioContext, bus: GainNode): void {
    const samples = renderRoomTone(ctx.sampleRate);
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = ROOM_TONE_GAIN;
    src.connect(g).connect(bus);
    src.start();
  }

  musicOutput(): { ctx: AudioContext; bus: GainNode } | null {
    return this.ctx && this.music ? { ctx: this.ctx, bus: this.music } : null;
  }

  /** Suspend while the app is hidden; resume on return (paired with the runtime's pause). */
  setVisible(visible: boolean): void {
    if (!this.ctx) return;
    if (visible) void this.ctx.resume().catch(() => undefined);
    else void this.ctx.suspend().catch(() => undefined);
  }

  play(name: string, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.sfx || ctx.state !== 'running' || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    if (opts.gain !== undefined && opts.gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = opts.gain;
      src.connect(g).connect(this.sfx);
    } else {
      src.connect(this.sfx);
    }
    src.start();
  }

  setVolume(bus: 'master' | 'sfx' | 'music', value: number): void {
    this.volume[bus] = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  /** Output latency estimate in seconds (base + output), for the debug overlay and device lab. */
  latency(): number | null {
    if (!this.ctx) return null;
    // outputLatency is missing in some browsers (older Safari); treat it as 0 there.
    const output = (this.ctx as { outputLatency?: number }).outputLatency;
    return this.ctx.baseLatency + (typeof output === 'number' ? output : 0);
  }

  get state(): string {
    return this.ctx?.state ?? 'locked';
  }

  get soundNames(): string[] {
    return Object.keys(this.bank);
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.volume.master;
    if (this.sfx) this.sfx.gain.value = this.volume.sfx;
    if (this.music) this.music.gain.value = this.muted ? 0 : this.volume.music;
  }
}
