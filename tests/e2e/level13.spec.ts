import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const solution = JSON.parse(readFileSync('content/solutions/1-3.json', 'utf8')) as {
  replay: string;
  totalTicks: number;
};

interface Snapshot {
  tick: number;
  deaths: number;
  checkpoint: number;
  enemies: { id: string; alive: boolean }[];
  rope: { anchor: number; point: { x: number; y: number } } | null;
  completion: { family: string; accepted: boolean; attemptTicks: number } | null;
}

interface Hook {
  snapshot(): Snapshot;
  resources(): { cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
  playReplay(text: string): number;
  audio(): { sounds: string[] };
  save(): {
    data: {
      levels: Record<string, { cleared: boolean; bestTicks: number | null; totalDeaths: number }>;
    };
  };
  flushSave(): Promise<void>;
}

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.snapshot());

async function waitForAnchorAttachment(page: Page, index: number) {
  const handle = await page.waitForFunction(
    (anchor) => {
      const g = (window as unknown as { __stickgame: Hook }).__stickgame;
      const state = g.snapshot();
      if (!state.rope || state.rope.anchor !== anchor) return false;
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      return {
        tick: state.tick,
        point: state.rope.point,
        screen: g.worldToScreen(state.rope.point.x, state.rope.point.y),
        width: rect.width,
        height: rect.height,
      };
    },
    index,
    { timeout: 50_000 },
  );
  return (await handle.jsonValue()) as {
    tick: number;
    point: { x: number; y: number };
    screen: { x: number; y: number };
    width: number;
    height: number;
  };
}

test.setTimeout(120_000);

test('1-3 main replay clears the shaft with both checkpoints and every goon stomped', async ({
  page,
}, info) => {
  await page.goto('/?level=1-3&renderer=canvas');
  await page.waitForFunction(() => '__stickgame' in window);
  await page.waitForFunction(
    () => (window as unknown as { __stickgame: Hook }).__stickgame.resources().cameras === 4,
  );

  const totalTicks = await page.evaluate(
    (text) => (window as unknown as { __stickgame: Hook }).__stickgame.playReplay(text),
    solution.replay,
  );
  expect(totalTicks).toBe(solution.totalTicks);

  // The anchors at indices 1, 3 and 5 are a3, a5 and a7 in 1-3.json. Sample the live rope and
  // current camera transform at each real attachment, so these are frame-safe rather than
  // assumptions about a particular replay tick.
  for (const [name, index] of [
    ['a3', 1],
    ['a5', 3],
    ['a7', 5],
  ] as const) {
    const attached = await waitForAnchorAttachment(page, index);
    expect(attached.screen.x, `${name} x is visible`).toBeGreaterThanOrEqual(0);
    expect(attached.screen.x, `${name} x is within canvas`).toBeLessThanOrEqual(attached.width);
    expect(attached.screen.y, `${name} y is visible`).toBeGreaterThanOrEqual(0);
    expect(attached.screen.y, `${name} y is within canvas`).toBeLessThanOrEqual(attached.height);

    const screenshot = info.outputPath(`1-3-${name}-attached.png`);
    await page.screenshot({ path: screenshot });
    await info.attach(`${name} attachment in view`, { path: screenshot, contentType: 'image/png' });
  }

  await page.waitForFunction(
    () => (window as unknown as { __stickgame: Hook }).__stickgame.snapshot().completion !== null,
    undefined,
    { timeout: 90_000 },
  );
  const finished = await snap(page);
  expect(finished.deaths).toBe(0);
  expect(finished.checkpoint).toBe(1); // Both authored checkpoints were reached.
  expect(finished.completion).toMatchObject({ family: 'shaft', accepted: true });
  expect(finished.enemies).toHaveLength(3);
  expect(finished.enemies.every((enemy) => !enemy.alive)).toBe(true);

  // The dev hook exposes the sound bank, but not per-event playback. This confirms stomp audio is
  // shipped with the real main build; deterministic stomp/playback mapping stays covered in unit tests.
  expect(
    await page.evaluate(
      () => (window as unknown as { __stickgame: Hook }).__stickgame.audio().sounds,
    ),
  ).toContain('stomp');

  await page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flushSave());
  const saved = await page.evaluate(
    () => (window as unknown as { __stickgame: Hook }).__stickgame.save().data.levels['1-3'],
  );
  expect(saved).toMatchObject({ cleared: true, bestTicks: solution.totalTicks, totalDeaths: 0 });
});
