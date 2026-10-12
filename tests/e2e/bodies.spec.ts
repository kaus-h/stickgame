import { expect, test, type Page } from '@playwright/test';
import levelOneThree from '../../content/levels/1-3.json' with { type: 'json' };
import { PIXELS_PER_METER } from '../../src/core/units';

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
  eraser(): {
    scrollX: number;
    zoom: number;
    worldX: number | null;
    erased: number[];
    duration: number | null;
  };
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
  await expect(page.getByRole('heading', { name: 'StickSwing' })).toBeVisible();
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

test('completion presentation erases bodies across the level before showing results', async ({
  page,
}, info) => {
  await load(page, '/?level=1-3&renderer=canvas');
  // The dev hook accepts meters; these bodies span the level from its opening section.
  await addBody(page, 20, 7);
  await addBody(page, 90, 7);
  await addBody(page, 165, 7);
  expect((await bodyStats(page)).count).toBe(3);

  // Record in the page's RAF loop so Playwright does not poll during the presentation.
  await page.evaluate((pixelsPerMeter) => {
    const g = (window as unknown as { __stickgame: Hook }).__stickgame;
    const samples: {
      t: number;
      scrollX: number;
      zoom: number;
      worldX: number | null;
      erased: number[];
      bodyCount: number;
      sweeping: boolean;
      viewportWidth: number;
    }[] = [];
    const start = performance.now();
    const deadline = start + 6_500;
    const initialState = g.eraser();
    const initialCanvas = document.querySelector('canvas');
    const initialViewLeft =
      initialState.scrollX +
      (initialCanvas?.width ?? 0) / 2 -
      (initialCanvas?.width ?? 0) / (2 * initialState.zoom);
    let sawSweep = false;
    let duration: number | null = null;
    let midSweepPng: string | null = null;
    const erasedOrder: number[] = [];
    const seen = new Set<number>();
    const record = () => {
      try {
        if (performance.now() >= deadline) {
          (window as unknown as { __eraserCapture?: unknown }).__eraserCapture = {
            error: `RAF capture timed out; sweeping=${String(g.bodies().sweeping)}`,
          };
          return;
        }
        const state = g.eraser();
        sawSweep ||= state.duration !== null;
        if (state.duration !== null) duration = state.duration;
        for (const id of state.erased) {
          if (!seen.has(id)) {
            seen.add(id);
            erasedOrder.push(id);
          }
        }
        const canvas = document.querySelector('canvas');
        if (midSweepPng === null && state.worldX !== null && state.worldX >= 90 * pixelsPerMeter) {
          midSweepPng = canvas?.toDataURL('image/png') ?? null;
        }
        samples.push({
          t: performance.now() - start,
          scrollX: state.scrollX,
          zoom: state.zoom,
          worldX: state.worldX,
          erased: [...state.erased],
          bodyCount: g.bodies().count,
          sweeping: g.bodies().sweeping,
          viewportWidth: canvas?.width ?? 0,
        });
        if (!sawSweep || g.bodies().sweeping) requestAnimationFrame(record);
        else
          (window as unknown as { __eraserCapture?: unknown }).__eraserCapture = {
            samples,
            erasedOrder,
            duration,
            midSweepPng,
            initialViewLeft,
          };
      } catch (error) {
        (window as unknown as { __eraserCapture?: unknown }).__eraserCapture = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
    requestAnimationFrame(record);
  }, PIXELS_PER_METER);
  await page.evaluate(() => {
    (window as unknown as { __stickgame: Hook }).__stickgame.debugResults(120, 0);
  });
  const capture = (await page.evaluate(async () => {
    const g = (window as unknown as { __stickgame: Hook }).__stickgame;
    const deadline = performance.now() + 7_000;
    while (performance.now() < deadline) {
      const result = (window as unknown as { __eraserCapture?: unknown }).__eraserCapture;
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`eraser did not finish; sweeping=${String(g.bodies().sweeping)}`);
  })) as {
    duration: number | null;
    initialViewLeft: number;
    midSweepPng: string | null;
    error?: string;
    erasedOrder: number[];
    samples: {
      t: number;
      scrollX: number;
      zoom: number;
      worldX: number | null;
      erased: number[];
      bodyCount: number;
      sweeping: boolean;
      viewportWidth: number;
    }[];
  };
  expect(capture.error).toBeUndefined();
  if (capture.duration === null)
    throw new Error('eraser duration was not captured during presentation');
  const duration = capture.duration;
  expect(duration).toBeGreaterThanOrEqual(2.5);
  expect(duration).toBeLessThanOrEqual(4);
  expect((await bodyStats(page)).count).toBe(0);

  const viewLeft = (sample: (typeof capture.samples)[number]) =>
    sample.scrollX + sample.viewportWidth / 2 - sample.viewportWidth / (2 * sample.zoom);
  const activeSamples = capture.samples.filter((sample) => sample.sweeping);
  if (activeSamples.length === 0) throw new Error('eraser did not produce active RAF samples');
  const leftEdges = activeSamples.map(viewLeft);
  const zooms = activeSamples.map((sample) => sample.zoom);
  expect(zooms.every((zoom) => zoom > 0)).toBe(true);
  expect(Math.max(...zooms) - Math.min(...zooms)).toBeLessThan(0.01);
  const expectedLeftBound = levelOneThree.bounds.minX * PIXELS_PER_METER;
  const expectedRightBound = levelOneThree.bounds.maxX * PIXELS_PER_METER;
  const finished = capture.samples.at(-1);
  if (!finished) throw new Error('eraser capture has no final sample');
  const lastActiveLeft = leftEdges.at(-1);
  if (lastActiveLeft === undefined) throw new Error('eraser capture has no active left edge');
  expect(Math.abs(capture.initialViewLeft - expectedLeftBound)).toBeLessThanOrEqual(5);
  expect(
    Math.abs(viewLeft(finished) - (expectedRightBound - finished.viewportWidth / finished.zoom)),
  ).toBeLessThanOrEqual(5);
  expect(lastActiveLeft - capture.initialViewLeft).toBeGreaterThan(100 * PIXELS_PER_METER);
  expect(
    leftEdges.every((left, index) => {
      if (index === 0) return true;
      const previous = leftEdges[index - 1];
      if (previous === undefined)
        throw new Error(`missing camera sample at index ${String(index - 1)}`);
      return left >= previous - 2;
    }),
  ).toBe(true);
  // The last active RAF can precede the final step by a whole browser frame. Verify the
  // finished camera endpoint above; unit tests also verify the exact world-space exit edge.
  expect(finished.sweeping).toBe(false);
  const firstErasedSample = activeSamples.find((sample) => sample.erased.length > 0);
  expect(firstErasedSample).toBeDefined();
  if (!firstErasedSample) throw new Error('no body was erased during the presentation');
  expect(firstErasedSample.erased.length).toBeLessThan(3);
  expect(capture.erasedOrder).toEqual([0, 1, 2]);
  expect(
    activeSamples.some(
      (sample) =>
        sample.erased.includes(0) && sample.erased.includes(1) && !sample.erased.includes(2),
    ),
  ).toBe(true);
  expect(firstErasedSample.t).toBeLessThan(duration * 1_000);
  expect(activeSamples.every((sample) => sample.bodyCount === 3)).toBe(true);
  expect(capture.samples.some((sample) => !sample.sweeping && sample.bodyCount === 0)).toBe(true);

  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('results');
  await expect(page.getByRole('heading', { name: /cleared/i })).toBeVisible();

  await info.attach('Accepted exit eraser timeline', {
    body: JSON.stringify(capture, null, 2),
    contentType: 'application/json',
  });
  if (!capture.midSweepPng) throw new Error('mid-sweep screenshot was not captured');
  const midSweepBase64 = capture.midSweepPng.split(',')[1];
  if (!midSweepBase64) throw new Error('mid-sweep screenshot data URL is invalid');
  await info.attach('Mid-sweep eraser view', {
    body: Buffer.from(midSweepBase64, 'base64'),
    contentType: 'image/png',
  });
  const screenshot = info.outputPath('accepted-exit-eraser-results.png');
  await page.screenshot({ path: screenshot });
  await info.attach('Accepted exit eraser results', { path: screenshot, contentType: 'image/png' });
});

test('accepted exit clears bodies after its lab eraser presentation', async ({ page }) => {
  await load(page, '/?level=lab-exit-wide&renderer=canvas');
  await addBody(page, 8, 6);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await snap(page)).completion, { timeout: 15_000 }).not.toBeNull();
  await page.keyboard.up('KeyD');
  await expect.poll(async () => (await bodyStats(page)).sweeping).toBe(true);
  let duration = 0;
  await expect
    .poll(async () => {
      duration = await page.evaluate(
        () => (window as unknown as { __stickgame: Hook }).__stickgame.eraser().duration ?? 0,
      );
      return duration;
    })
    .toBeGreaterThanOrEqual(1.2);
  await expect
    .poll(
      async () => {
        const stats = await bodyStats(page);
        return !stats.sweeping && stats.count === 0;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  expect(duration).toBeGreaterThanOrEqual(1.2);
  expect(duration).toBeLessThanOrEqual(4);
});

test('reduced motion completes erasing in 200 ms without camera travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, '/?level=lab-01&renderer=canvas');
  await addBody(page, 8, 7);
  await expect.poll(async () => (await bodyStats(page)).count).toBe(1);
  const observed = await page.evaluate(() => {
    const g = (window as unknown as { __stickgame: Hook }).__stickgame;
    const before = g.eraser().scrollX;
    g.debugResults(120, 0);
    const duration = g.eraser().duration;
    return new Promise<{ duration: number | null; scrolls: number[]; count: number }>(
      (resolve, reject) => {
        const scrolls = [before];
        let frame = 0;
        const watchdog = window.setTimeout(() => {
          cancelAnimationFrame(frame);
          reject(new Error('Reduced-motion fade did not complete within 2 seconds'));
        }, 2_000);
        const record = (): void => {
          scrolls.push(g.eraser().scrollX);
          if (g.bodies().sweeping) frame = requestAnimationFrame(record);
          else {
            clearTimeout(watchdog);
            resolve({ duration, scrolls, count: g.bodies().count });
          }
        };
        frame = requestAnimationFrame(record);
      },
    );
  });
  expect(observed.duration).toBe(0.2);
  expect(observed.count).toBe(0);
  expect(Math.max(...observed.scrolls) - Math.min(...observed.scrolls)).toBeLessThan(1);
});

test('completion with no bodies goes directly to results', async ({ page }) => {
  await load(page, '/?level=lab-01&renderer=canvas');
  await page.evaluate(() => {
    (window as unknown as { __stickgame: Hook }).__stickgame.debugResults(120, 0);
  });
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('results');
  expect((await bodyStats(page)).sweeping).toBe(false);
});

test('the completion eraser can be skipped with a touch tap', async ({ page }) => {
  await load(page, '/?touch=1&level=lab-01&renderer=canvas');
  await addBody(page, 8, 7);
  await page.evaluate(() => {
    (window as unknown as { __stickgame: Hook }).__stickgame.debugResults(120, 0);
  });
  await expect.poll(async () => (await bodyStats(page)).sweeping).toBe(true);
  await tapCanvas(page, 480, 360);
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __stickgame: Hook }).__stickgame.flow()),
    )
    .toBe('results');
  expect((await bodyStats(page)).count).toBe(0);
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
