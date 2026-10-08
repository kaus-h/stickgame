import { heapGrowthMb, samplePercentile, type FrameSummary, type MemorySample } from './stats';

/**
 * Proposed pass/fail thresholds for GMR-33 (justification in docs/device-validation.md). They are
 * proposals until the owner confirms them against real device numbers and records them in canon.
 */
export const THRESHOLDS = {
  /** Touch to the frame after the flash was submitted (presentation estimate), p95. */
  touchToRenderP95Ms: 50,
  frameP99Ms: 20,
  /** Share of frames longer than 33 ms (two missed 60 Hz frames), percent. */
  longFramePct: 0.5,
  /** Lowest 60 s-window average fps over the run. */
  sustainedMinFps: 55,
  audioClickLatencyMs: { android: 60, ios: 30, web: 60 },
  /** Net JS heap growth after the first minute (MB); Chromium-based WebViews only. */
  heapGrowthMb: 10,
  /** Audio context back to "running" after returning to the foreground. */
  audioRecoveryMs: 2000,
  /** WebGL context restored and drawing again after a forced loss. */
  webglRestoreMs: 3000,
} as const;

export type Verdict = 'pass' | 'fail' | 'n/a';

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly limit: string;
  readonly verdict: Verdict;
}

export type PlatformKind = 'android' | 'ios' | 'web';

export interface EvaluationInput {
  readonly platform: PlatformKind;
  readonly frames: FrameSummary;
  readonly touchLatenciesMs: readonly number[];
  readonly memory: readonly MemorySample[];
  readonly audioClickLatencyMs: number | null;
  readonly audioRecoveryMs: number | null;
  readonly webglRestoreMs: number | null;
  readonly deterministic: boolean | null;
  /** Seconds the run has covered, so a 20 s run is not mistaken for a 15 min one. */
  readonly runSeconds: number;
  readonly targetSeconds: number;
}

function check(
  id: string,
  label: string,
  value: number | null,
  limit: string,
  unit: string,
  ok: (v: number) => boolean,
  digits = 1,
): Check {
  if (value === null) return { id, label, value: 'not measured', limit, verdict: 'n/a' };
  return {
    id,
    label,
    value: `${value.toFixed(digits)} ${unit}`,
    limit,
    verdict: ok(value) ? 'pass' : 'fail',
  };
}

export function evaluate(input: EvaluationInput): Check[] {
  const t = THRESHOLDS;
  const touch =
    input.touchLatenciesMs.length >= 5 ? samplePercentile(input.touchLatenciesMs, 95) : null;
  const hasFrames = input.frames.frames > 0;
  const audioLimit = t.audioClickLatencyMs[input.platform];
  const growth = heapGrowthMb(input.memory);
  const deterministic = input.deterministic;
  return [
    {
      id: 'run-complete',
      label: 'Run covered the target duration',
      value: `${input.runSeconds.toFixed(0)} s`,
      limit: `>= ${input.targetSeconds.toFixed(0)} s`,
      verdict: input.runSeconds >= input.targetSeconds ? 'pass' : 'n/a',
    },
    check(
      'touch-p95',
      'Touch-to-render p95 (needs >= 5 taps)',
      touch,
      `<= ${String(t.touchToRenderP95Ms)} ms`,
      'ms',
      (v) => v <= t.touchToRenderP95Ms,
    ),
    check(
      'frame-p99',
      'Frame time p99',
      hasFrames ? input.frames.p99Ms : null,
      `<= ${String(t.frameP99Ms)} ms`,
      'ms',
      (v) => v <= t.frameP99Ms,
    ),
    check(
      'long-frames',
      'Frames longer than 33 ms',
      hasFrames ? input.frames.over33Pct : null,
      `< ${String(t.longFramePct)} %`,
      '%',
      (v) => v < t.longFramePct,
      3,
    ),
    check(
      'sustained-fps',
      'Lowest 60 s average fps (thermal throttling)',
      hasFrames ? input.frames.minWindowFps : null,
      `>= ${String(t.sustainedMinFps)} fps`,
      'fps',
      (v) => v >= t.sustainedMinFps,
    ),
    check(
      'heap-growth',
      'JS heap growth after minute 1',
      growth,
      `<= ${String(t.heapGrowthMb)} MB`,
      'MB',
      (v) => v <= t.heapGrowthMb,
    ),
    check(
      'audio-latency',
      'Audio click latency (estimated)',
      input.audioClickLatencyMs,
      `<= ${String(audioLimit)} ms (${input.platform})`,
      'ms',
      (v) => v <= audioLimit,
    ),
    check(
      'audio-recovery',
      'Audio back to running after foreground',
      input.audioRecoveryMs,
      `<= ${String(t.audioRecoveryMs)} ms`,
      'ms',
      (v) => v <= t.audioRecoveryMs,
      0,
    ),
    check(
      'webgl-restore',
      'WebGL restored and drawing after forced loss',
      input.webglRestoreMs,
      `<= ${String(t.webglRestoreMs)} ms`,
      'ms',
      (v) => v <= t.webglRestoreMs,
      0,
    ),
    {
      id: 'determinism',
      label: 'Replay hashes identical to the build golden',
      value: deterministic === null ? 'not measured' : deterministic ? 'identical' : 'DIFFERENT',
      limit: 'identical',
      verdict: deterministic === null ? 'n/a' : deterministic ? 'pass' : 'fail',
    },
  ];
}
