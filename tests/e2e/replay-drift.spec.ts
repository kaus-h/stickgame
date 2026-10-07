import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { runHarness, type HarnessResult } from '../../src/tools/replay-drift/scenario';

const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// Golden values computed in Node from the same modules. Every browser engine must match them
// bit for bit: recorded inputs, per-second hashes, final hash and the hash of every tick (GMR-29).
const golden = runHarness(json('content/levels/lab-01.json'), json('content/tuning/runtime.json'));

test('recorded replays reproduce the Node reference in every browser', async ({
  page,
  browserName,
}) => {
  await page.goto('/replay-drift.html');
  const handle = await page.waitForFunction(
    () => (window as unknown as { __replayDrift?: HarnessResult }).__replayDrift,
  );
  const result = (await handle.jsonValue()) as HarnessResult;
  console.log(
    `[replay-drift] ${browserName}: main=${result.direct.main.final} moving=${result.direct.moving.final}`,
  );
  expect(result.encoded).toEqual(golden.encoded);
  expect(result.direct).toEqual(golden.direct);
  expect(result.framed).toEqual(golden.framed);
  // Jittery frame timing must not change a single tick.
  expect(result.framed).toEqual(result.direct);
});
