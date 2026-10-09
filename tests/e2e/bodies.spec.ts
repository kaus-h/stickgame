import { expect, test, type Page } from '@playwright/test';

interface BodyStats {
  count: number;
  simulating: number;
  visible: boolean;
  sweeping: boolean;
  clearing: boolean;
}

interface Snapshot {
  deaths: number;
  resets: number;
  completion: unknown;
}

interface Hook {
  snapshot(): Snapshot;
  bodies(): BodyStats;
  addBody(x: number, y: number, vx?: number, vy?: number, tick?: number): void;
  flow(): string;
  save(): { data: { settings: { bodies: boolean } } };
  flushSave(): Promise<void>;
  benchFrames(frames: number): number;
  resources(): { cameras: number };
  debugResults(ticks: number, deaths: number): void;
  touch: { state(): { controls: { id: string; x: number; y: number }[] } };
}

const snap = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.snapshot());
const bodyStats = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.bodies());
async function addBody(page: Page, x: number, y: number, tick = 1): Promise<void> {
  await page.evaluate(
    ([px, py, t]) => {
      (window as unknown as { __stickgame: Hook }).__stickgame.addBody(px, py, 0, 0, t);
    },
    [x, y, tick] as const,
  );
}

async function load(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => '__stickgame' in window);
  await page.waitForFunction(
    () => (window as unknown as { __stickgame: Hook }).__stickgame.resources().cameras === 2,
  );
}

async function dieToGoon(page: Page): Promise<void> {
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.mouse.up();
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).deaths, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.keyboard.up('KeyD');
}

/** Dispatch a touch pointer tap at canvas-relative CSS coordinates. */
async function tapCanvas(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([cx, cy]) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('no canvas');
      const r = canvas.getBoundingClientRect();
      for (const type of ['pointerdown', 'pointerup'] as const) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: r.left + cx,
            clientY: r.top + cy,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    [x, y] as const,
  );
}

async function touchPause(page: Page): Promise<void> {
  const pause = await page.evaluate(() =>
    (window as unknown as { __stickgame: Hook }).__stickgame.touch
      .state()
      .controls.find((control) => control.id === 'pause'),
  );
  if (!pause) throw new Error('touch pause control is unavailable');
  await tapCanvas(page, pause.x, pause.y);
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('paused');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
}

test.setTimeout(60_000);

test('a real goon-contact death leaves a body, and restart keeps the body and death tally', async ({
  page,
}, info) => {
  await load(page, '/?level=lab-goon-contact&renderer=canvas');
  await dieToGoon(page);

  await expect.poll(async () => (await bodyStats(page)).count).toBeGreaterThan(0);
  const screenshot = info.outputPath('goon-contact-death-body.png');
  await page.screenshot({ path: screenshot });
  await info.attach('Goon contact death body', { path: screenshot, contentType: 'image/png' });
  const deaths = (await snap(page)).deaths;
  expect(deaths).toBeGreaterThan(0);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snap(page)).resets).toBeGreaterThan(1);

  expect((await bodyStats(page)).count).toBeGreaterThan(0);
  expect((await snap(page)).deaths).toBe(deaths);
});

test('title-flow results wait for the completion eraser to be skipped', async ({ page }) => {
  await load(page, '/?renderer=canvas');
  await expect(page.getByRole('heading', { name: 'Precision Tether' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('playing');

  await addBody(page, 4, 7);
  await page.evaluate(() => {
    (window as unknown as { __stickgame: Hook }).__stickgame.debugResults(120, 1);
  });
  await expect.poll(async () => (await bodyStats(page)).sweeping).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
  ).toBe('playing');
  await expect(page.getByRole('heading', { name: /cleared/i })).toBeHidden();

  await page.keyboard.press('Space');
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('results');
  await expect(page.getByRole('heading', { name: /cleared/i })).toBeVisible();
  expect((await bodyStats(page)).count).toBe(0);
});

test('B hides and shows bodies, and the saved choice survives a reload', async ({ page }) => {
  await load(page, '/?level=lab-01&renderer=canvas');
  await addBody(page, 4, 7);
  expect(await bodyStats(page)).toMatchObject({ count: 1, visible: true });

  await page.keyboard.press('KeyB');
  expect((await bodyStats(page)).visible).toBe(false);
  expect(
    await page.evaluate(
      () => (window as unknown as { __stickgame: Hook }).__stickgame.save().data.settings.bodies,
    ),
  ).toBe(false);
  await page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flushSave());
  await page.reload();
  await page.waitForFunction(() => '__stickgame' in window);

  await addBody(page, 4, 7);
  expect(await bodyStats(page)).toMatchObject({ count: 1, visible: false });
  await page.keyboard.press('KeyB');
  expect((await bodyStats(page)).visible).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { __stickgame: Hook }).__stickgame.save().data.settings.bodies,
    ),
  ).toBe(true);
});

test('C clears the current level bodies', async ({ page }) => {
  await load(page, '/?level=lab-01&renderer=canvas');
  await addBody(page, 4, 7);
  await page.keyboard.press('KeyC');

  await expect.poll(async () => (await bodyStats(page)).count).toBe(0);
  expect((await snap(page)).deaths).toBe(0);
});

test('the touch pause menu exposes body show, hide, and clear controls', async ({ page }) => {
  await load(page, '/?touch=1&level=lab-01&renderer=canvas');
  await addBody(page, 4, 7);
  await touchPause(page);
  await page.getByRole('button', { name: 'Hide bodies (B)' }).click();
  await expect.poll(async () => (await bodyStats(page)).visible).toBe(false);

  await touchPause(page);
  await page.getByRole('button', { name: 'Show bodies (B)' }).click();
  await expect.poll(async () => (await bodyStats(page)).visible).toBe(true);

  await touchPause(page);
  await page.getByRole('button', { name: 'Clear bodies (C)' }).click();
  await expect.poll(async () => (await bodyStats(page)).count).toBe(0);
});

test('the completion eraser can be skipped with a key and removes the bodies', async ({ page }) => {
  await load(page, '/?level=lab-exit-wide&renderer=canvas');
  await addBody(page, 8, 6);
  await expect.poll(async () => (await bodyStats(page)).count).toBe(1);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).completion, { timeout: 15_000 }).not.toBeNull();
  await page.keyboard.up('KeyD');
  await expect.poll(async () => (await bodyStats(page)).sweeping).toBe(true);

  await page.keyboard.press('Space');
  await expect.poll(async () => (await bodyStats(page)).sweeping).toBe(false);
  expect((await bodyStats(page)).count).toBe(0);
});

test('the default completion sweep removes bodies within 1.2 seconds', async ({ page }) => {
  await load(page, '/?level=lab-exit-wide&renderer=canvas');
  await addBody(page, 8, 6);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).completion, { timeout: 15_000 }).not.toBeNull();
  await page.keyboard.up('KeyD');
  await expect.poll(async () => (await bodyStats(page)).sweeping, { timeout: 2_000 }).toBe(true);
  await expect
    .poll(
      async () => {
        const stats = await bodyStats(page);
        return !stats.sweeping && stats.count === 0;
      },
      { timeout: 1_200 },
    )
    .toBe(true);
});

test('reduced motion completes the eraser sweep promptly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, '/?level=lab-exit-wide&renderer=canvas');
  await addBody(page, 8, 6);
  await expect.poll(async () => (await bodyStats(page)).count).toBe(1);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).completion, { timeout: 15_000 }).not.toBeNull();
  await page.keyboard.up('KeyD');
  await expect
    .poll(
      async () => {
        const stats = await bodyStats(page);
        return !stats.sweeping && stats.count === 0;
      },
      { timeout: 1_200 },
    )
    .toBe(true);
});

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

test('60 settled death bodies stay within the render budget', async ({ page }) => {
  test.skip(
    process.env.STICKGAME_BODIES_PERF !== '1',
    "Opt-in isolated GPU budget profile; run STICKGAME_BODIES_PERF=1 npx playwright test tests/e2e/bodies.spec.ts --project=chromium --grep '60 settled' --workers=2.",
  );
  test.setTimeout(180_000);
  await load(page, '/?level=lab-01');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();

  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'missing-canvas';
    return canvas.getContext('webgl2') || canvas.getContext('webgl') ? 'WebGL' : 'Canvas 2D';
  });
  const bench = (frames: number) =>
    page.evaluate(
      (n) => (window as unknown as { __stickgame: Hook }).__stickgame.benchFrames(n),
      frames,
    );
  const addBodies = (count: number) =>
    page.evaluate((n) => {
      const g = (window as unknown as { __stickgame: Hook }).__stickgame;
      for (let i = 0; i < n; i++) g.addBody(3, 7.65, 0, 0, i);
    }, count);

  await bench(30);
  await bench(30); // Warm up shader and renderer before measuring the baseline.
  const baseline = median([await bench(100), await bench(100), await bench(100)]);
  await addBodies(60);
  expect((await bodyStats(page)).count).toBe(60);
  await bench(300); // Advance render-side physics until each body settles and is baked.
  expect((await bodyStats(page)).simulating).toBe(0);
  const withBodies = median([await bench(100), await bench(100), await bench(100)]);
  const delta = withBodies - baseline;
  console.log(
    `GMR-104 render budget: ${renderer}, baseline ${baseline.toFixed(3)} ms/frame, ` +
      `60 settled bodies ${withBodies.toFixed(3)} ms/frame, delta ${delta.toFixed(3)} ms/frame`,
  );
  expect(delta).toBeLessThan(0.5);
});
