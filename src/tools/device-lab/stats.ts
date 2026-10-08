/** Fixed-bucket histogram of frame times: allocation-free in steady state, so a 15 minute run does not grow the heap. */
const BUCKET_MS = 0.25;
const MAX_MS = 200;
const BUCKETS = Math.ceil(MAX_MS / BUCKET_MS) + 1; // last bucket = overflow

export interface FrameSummary {
  readonly frames: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly over20Ms: number;
  readonly over33Ms: number;
  readonly over50Ms: number;
  readonly over20Pct: number;
  readonly over33Pct: number;
  /** Frames dropped from the histogram because the page was hidden or stalled for > 1 s. */
  readonly stalls: number;
  /** Average fps per completed window (default 60 s), oldest first. */
  readonly windowFps: readonly number[];
  readonly minWindowFps: number;
  /** Median-based display refresh estimate (Hz), 0 before enough frames. */
  readonly refreshHzEstimate: number;
}

export class FrameStats {
  private readonly counts = new Uint32Array(BUCKETS);
  private frames = 0;
  private sum = 0;
  private min = Infinity;
  private max = 0;
  private over20 = 0;
  private over33 = 0;
  private over50 = 0;
  private stalls = 0;
  private windowStart = -1;
  private windowFrames = 0;
  private readonly windows: number[] = [];

  constructor(private readonly windowMs = 60_000) {}

  /** Record one frame. `now` is the rAF timestamp (ms) and `dt` the delta since the previous frame. */
  record(now: number, dt: number): void {
    if (dt > 1000) {
      // Backgrounded or suspended: not a rendering problem, but never silently dropped.
      this.stalls++;
      this.windowStart = -1;
      this.windowFrames = 0;
      return;
    }
    this.frames++;
    this.sum += dt;
    if (dt < this.min) this.min = dt;
    if (dt > this.max) this.max = dt;
    if (dt > 20) this.over20++;
    if (dt > 33) this.over33++;
    if (dt > 50) this.over50++;
    const i = Math.min(BUCKETS - 1, Math.floor(dt / BUCKET_MS));
    this.counts[i] = (this.counts[i] ?? 0) + 1;

    if (this.windowStart < 0) {
      this.windowStart = now;
      this.windowFrames = 0;
    }
    this.windowFrames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.windows.push((this.windowFrames * 1000) / elapsed);
      this.windowStart = now;
      this.windowFrames = 0;
    }
  }

  percentile(p: number): number {
    if (this.frames === 0) return 0;
    const target = Math.ceil((p / 100) * this.frames);
    let acc = 0;
    for (let i = 0; i < BUCKETS; i++) {
      acc += this.counts[i] ?? 0;
      if (acc >= target) return Math.min((i + 1) * BUCKET_MS, this.max);
    }
    return this.max;
  }

  /** Counts per 1 ms bin (0..40+) for the on-screen chart. */
  histogram(binMs = 1, bins = 41): number[] {
    const out = new Array<number>(bins).fill(0);
    const per = Math.round(binMs / BUCKET_MS);
    for (let i = 0; i < BUCKETS; i++) {
      const bin = Math.min(bins - 1, Math.floor(i / per));
      out[bin] = (out[bin] ?? 0) + (this.counts[i] ?? 0);
    }
    return out;
  }

  summary(): FrameSummary {
    const n = this.frames;
    const p50 = this.percentile(50);
    const windowFps = this.windows.slice();
    const mean = n === 0 ? 0 : this.sum / n;
    // With no completed window yet, fall back to whole-run average fps so short runs still evaluate.
    const minWindowFps = windowFps.length > 0 ? Math.min(...windowFps) : mean > 0 ? 1000 / mean : 0;
    return {
      frames: n,
      meanMs: mean,
      minMs: n === 0 ? 0 : this.min,
      maxMs: this.max,
      p50Ms: p50,
      p95Ms: this.percentile(95),
      p99Ms: this.percentile(99),
      over20Ms: this.over20,
      over33Ms: this.over33,
      over50Ms: this.over50,
      over20Pct: n === 0 ? 0 : (this.over20 / n) * 100,
      over33Pct: n === 0 ? 0 : (this.over33 / n) * 100,
      stalls: this.stalls,
      windowFps,
      minWindowFps,
      refreshHzEstimate: p50 > 0 ? Math.round(1000 / p50) : 0,
    };
  }
}

/** Plain percentile of a small sample (touch latencies); nearest-rank. */
export function samplePercentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? 0;
}

export interface MemorySample {
  /** Seconds since the run started. */
  readonly t: number;
  readonly usedMb: number;
}

/** Net heap growth in MB between the first sample after `warmupSec` and the last sample; null if unmeasurable. */
export function heapGrowthMb(samples: readonly MemorySample[], warmupSec = 60): number | null {
  const after = samples.filter((s) => s.t >= warmupSec);
  const first = after[0];
  const last = after[after.length - 1];
  if (!first || !last || first === last) return null;
  return last.usedMb - first.usedMb;
}
