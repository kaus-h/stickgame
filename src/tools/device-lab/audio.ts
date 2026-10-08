/** Audio probe: one AudioContext (iOS allows few), state-change log, click test and foreground recovery. */
export interface AudioInfo {
  readonly supported: boolean;
  readonly state: string;
  readonly sampleRate: number;
  readonly baseLatencyMs: number | null;
  readonly outputLatencyMs: number | null;
}

type Ctx = AudioContext;

export class AudioProbe {
  private ctx: Ctx | null = null;
  /** Estimated touch-to-sound latencies (ms) from click tests. */
  readonly clickLatenciesMs: number[] = [];
  /** Foreground recoveries: time until the context reported "running" again. */
  readonly recoveryMs: number[] = [];
  stateChanges = 0;

  constructor(private readonly log: (msg: string) => void) {}

  /** Create or resume the context. Must be called from a user gesture on iOS and Chrome. */
  async unlock(): Promise<void> {
    const Ctor =
      (window.AudioContext as typeof AudioContext | undefined) ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx) {
      if (!Ctor) return; // no Web Audio at all: info() reports supported=false
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx.addEventListener('statechange', () => {
        this.stateChanges++;
        this.log(`audio state -> ${this.ctx?.state ?? '?'}`);
      });
      this.log(`audio context created (${this.ctx.state})`);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
  }

  info(): AudioInfo {
    const c = this.ctx;
    if (!c) {
      return {
        supported: typeof AudioContext !== 'undefined',
        state: 'not created',
        sampleRate: 0,
        baseLatencyMs: null,
        outputLatencyMs: null,
      };
    }
    const out = (c as { outputLatency?: number }).outputLatency;
    return {
      supported: true,
      state: c.state,
      sampleRate: c.sampleRate,
      baseLatencyMs: c.baseLatency * 1000,
      // Safari and some WebViews report 0 or undefined here; treat as unknown, not as zero.
      outputLatencyMs: out !== undefined && out > 0 ? out * 1000 : null,
    };
  }

  /**
   * Play a 5 ms click now. The estimate is (gesture to scheduling) + base + output latency; the real
   * answer needs the loopback or camera method in docs/device-validation.md.
   */
  async click(gestureTimeStamp: number): Promise<number | null> {
    await this.unlock();
    const c = this.ctx;
    if (!c || c.state !== 'running') return null;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.005), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (i % 40 < 20 ? 1 : -1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start();
    const scheduleMs = performance.now() - gestureTimeStamp;
    const info = this.info();
    const est = scheduleMs + (info.baseLatencyMs ?? 0) + (info.outputLatencyMs ?? 0);
    this.clickLatenciesMs.push(est);
    return est;
  }

  /** On returning to the foreground: resume if the OS suspended or interrupted us, and time it. */
  async recover(): Promise<void> {
    const c = this.ctx;
    if (!c) return;
    const before = c.state as string;
    if (before === 'running') return;
    const start = performance.now();
    this.log(`audio recovery: state was ${before}, calling resume()`);
    await c.resume().catch(() => undefined);
    // "interrupted" can lag behind resume(); poll briefly for "running".
    for (let i = 0; i < 40 && (c.state as string) !== 'running'; i++) {
      await new Promise((r) => window.setTimeout(r, 50));
    }
    const ms = performance.now() - start;
    if (c.state === 'running') this.recoveryMs.push(ms);
    this.log(`audio recovery: ${c.state} after ${ms.toFixed(0)} ms`);
  }
}
