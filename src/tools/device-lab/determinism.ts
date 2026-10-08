import lab01 from '../../../content/levels/lab-01.json';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { runHarness } from '../replay-drift/scenario';
import { GOLDEN, type GoldenHashes } from './golden';

export interface DeterminismResult {
  readonly measured: GoldenHashes;
  readonly golden: GoldenHashes;
  readonly identical: boolean;
  /** Frame-clock run with jittery deltas equals direct stepping (GMR-29 invariant). */
  readonly framedMatchesDirect: boolean;
  readonly elapsedMs: number;
}

/** The hashes that identify a run: final and all-ticks digests of both GMR-29 scripted replays. */
export function digestOf(r: ReturnType<typeof runHarness>): GoldenHashes {
  return {
    mainFinal: r.direct.main.final,
    mainAll: r.direct.main.all,
    movingFinal: r.direct.moving.final,
    movingAll: r.direct.moving.all,
  };
}

/** Runs the GMR-29 replay scenario in this very environment and compares it with the build golden. */
export function runDeterminismCheck(): DeterminismResult {
  const start = performance.now();
  const result = runHarness(lab01, runtimeTuning);
  const measured = digestOf(result);
  const identical =
    measured.mainFinal === GOLDEN.mainFinal &&
    measured.mainAll === GOLDEN.mainAll &&
    measured.movingFinal === GOLDEN.movingFinal &&
    measured.movingAll === GOLDEN.movingAll;
  const framedMatchesDirect = JSON.stringify(result.framed) === JSON.stringify(result.direct);
  return {
    measured,
    golden: GOLDEN,
    identical,
    framedMatchesDirect,
    elapsedMs: performance.now() - start,
  };
}
