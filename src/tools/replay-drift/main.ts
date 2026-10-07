import lab01 from '../../../content/levels/lab-01.json';
import runtimeTuning from '../../../content/tuning/runtime.json';
import { runHarness, type HarnessResult } from './scenario';

// Dev-only page (/replay-drift.html): records, round-trips and replays the harness runs, then
// exposes the result for Playwright to compare against the Node reference.
const result = runHarness(lab01, runtimeTuning);
(window as unknown as { __replayDrift: HarnessResult }).__replayDrift = result;
document.body.textContent = `${result.direct.main.final} ${result.direct.moving.final}`;
