import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const LEVEL_IDS = ['1-1', '1-2', '1-3'] as const;

interface KitState {
  ready: boolean;
  theme: string;
  fingerprint: string;
}

interface LevelHook {
  kitPresentation(): KitState;
  level(): {
    id: string;
    revision: number;
    spawn: { x: number; y: number };
    error: string | null;
  };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
}

interface LevelJson {
  spawn: [number, number];
  solids: {
    kind?: 'solid' | 'hazard';
    rect?: { x: number; y: number; w: number; h: number };
  }[];
}

interface PixelStats {
  total: number;
  dark: number;
  ink: number;
  paper: number;
  red: number;
}

interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function readKit(page: Page): Promise<KitState> {
  return page.evaluate(() =>
    (window as unknown as { __stickgame: LevelHook }).__stickgame.kitPresentation(),
  );
}

function readLevel(page: Page): Promise<LevelHook['level'] extends () => infer R ? R : never> {
  return page.evaluate(() => (window as unknown as { __stickgame: LevelHook }).__stickgame.level());
}

function readResources(page: Page): Promise<{ textures: number; cameras: number }> {
  return page.evaluate(() =>
    (window as unknown as { __stickgame: LevelHook }).__stickgame.resources(),
  );
}

async function waitForKit(page: Page): Promise<void> {
  await page.locator('#game canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(
    () => {
      try {
        const game = (window as unknown as { __stickgame: LevelHook }).__stickgame;
        return game.kitPresentation().ready && game.resources().cameras === 2;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 20_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

function levelUrl(levelId: string, overview = false): string {
  const query = new URLSearchParams({ level: levelId, renderer: 'canvas' });
  if (overview) query.set('overview', '1');
  return `/?${query.toString()}`;
}

async function attachScreenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

/** Read broad world-space canvas regions so visual checks survive small rasterization shifts. */
async function sampleWorldRect(page: Page, rect: WorldRect): Promise<PixelStats> {
  return page.evaluate((worldRect) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!canvas) throw new Error('Phaser canvas is missing');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Phaser Canvas 2D context is missing');
    const game = (window as unknown as { __stickgame: LevelHook }).__stickgame;
    const view = canvas.getBoundingClientRect();
    const scaleX = canvas.width / view.width;
    const scaleY = canvas.height / view.height;
    const start = game.worldToScreen(worldRect.minX, worldRect.minY);
    const end = game.worldToScreen(worldRect.maxX, worldRect.maxY);
    const x = Math.max(0, Math.floor(start.x * scaleX));
    const y = Math.max(0, Math.floor(start.y * scaleY));
    const right = Math.min(canvas.width, Math.ceil(end.x * scaleX));
    const bottom = Math.min(canvas.height, Math.ceil(end.y * scaleY));
    if (right <= x || bottom <= y) throw new Error('World sample is outside the canvas');
    const pixels = context.getImageData(x, y, right - x, bottom - y).data;
    const stats: PixelStats = { total: 0, dark: 0, ink: 0, paper: 0, red: 0 };
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i] ?? 255;
      const green = pixels[i + 1] ?? 255;
      const blue = pixels[i + 2] ?? 255;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      stats.total++;
      if (luminance < 125) stats.dark++;
      if (luminance < 185) stats.ink++;
      // Warm, bright paper remains distinct from the blue ruling and red danger hatch.
      if (luminance > 210 && red - green < 24 && red - blue < 36) stats.paper++;
      if (red > 115 && red > green * 1.3 && red > blue * 1.3) stats.red++;
    }
    return stats;
  }, rect);
}

const share = (stats: PixelStats, key: 'dark' | 'ink' | 'paper' | 'red'): number =>
  stats.total ? stats[key] / stats.total : 0;

async function checkLevelKitLevel(page: Page, info: TestInfo, levelId: (typeof LEVEL_IDS)[number]) {
  const source = JSON.parse(
    await readFile(new URL(`../../content/levels/${levelId}.json`, import.meta.url), 'utf8'),
  ) as LevelJson;
  const sampleX = source.spawn[0] + 3;
  const floorY = source.spawn[1] + 0.35;
  const floor = source.solids.find(
    (solid) =>
      solid.kind !== 'hazard' &&
      solid.rect &&
      Math.abs(solid.rect.y - floorY) < 1e-6 &&
      sampleX > solid.rect.x &&
      sampleX < solid.rect.x + solid.rect.w,
  );
  expect(floor, `${levelId} needs a safe rect floor under the sample point`).toBeDefined();
  if (!floor?.rect) throw new Error(`${levelId} floor rect was not found`);

  await page.goto(levelUrl(levelId));
  await waitForKit(page);
  expect((await readLevel(page)).id).toBe(levelId);
  expect(await readKit(page)).toMatchObject({ ready: true, theme: 'paper' });

  const pixels = await page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      if (!canvas) throw new Error('Phaser canvas is missing');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Phaser Canvas 2D context is missing');
      const probe = (window as unknown as { __stickgame: LevelHook }).__stickgame;
      const point = probe.worldToScreen(x, y);
      const bounds = canvas.getBoundingClientRect();
      const px = Math.round(((point.x - bounds.left) * canvas.width) / bounds.width);
      const py = Math.round(((point.y - bounds.top) * canvas.height) / bounds.height);
      const data = context.getImageData(px - 3, py - 2, 7, 5).data;
      const darkRows: number[] = [];
      for (let row = 0; row < 5; row++) {
        let dark = 0;
        for (let col = 0; col < 7; col++) {
          const i = (row * 7 + col) * 4;
          const red = data[i] ?? 255;
          const green = data[i + 1] ?? 255;
          const blue = data[i + 2] ?? 255;
          const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          if (luminance < 160) dark++;
        }
        darkRows.push(dark);
      }
      const nearestDarkOffset = darkRows.reduce(
        (nearest, count, row) => (count > 0 ? Math.min(nearest, Math.abs(row - 2)) : nearest),
        Infinity,
      );
      return { px, py, screenY: point.y, darkRows, nearestDarkOffset };
    },
    { x: sampleX, y: floor.rect.y },
  );
  expect(
    pixels.nearestDarkOffset,
    `${levelId} floor crest at screen y=${pixels.screenY.toFixed(2)}; dark samples by row ${pixels.darkRows.join(',')}`,
  ).toBeLessThanOrEqual(2);

  await attachScreenshot(page, info, `${levelId}-play-default-zoom`);
  await page.goto(levelUrl(levelId, true));
  await waitForKit(page);
  expect(await readKit(page)).toMatchObject({ ready: true, theme: 'paper' });
  await attachScreenshot(page, info, `${levelId}-overview`);
}

for (const levelId of LEVEL_IDS) {
  test(`${levelId}: kit is ready and the floor crest follows collision at default zoom`, async ({
    page,
  }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await checkLevelKitLevel(page, info, levelId);
    expect(pageErrors).toEqual([]);
  });
}

test('1-2: grounded kit mass continues to the hazard bed and hazards retain paper gaps', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(levelUrl('1-2'));
  await waitForKit(page);
  await attachScreenshot(page, info, '1-2-kit-paper-hazard-detail');

  // c1-start meets the wall and hazard bed. GMR-111 requires continuous ground mass here;
  // isolated-platform fading is tested separately in terrain-connections.spec.ts.
  const upperSkirt = await sampleWorldRect(page, {
    minX: 7.4,
    maxX: 8.6,
    minY: 8.2,
    maxY: 8.65,
  });
  const lowerSkirt = await sampleWorldRect(page, {
    minX: 7.4,
    maxX: 8.6,
    minY: 9.2,
    maxY: 9.6,
  });
  const interior = await sampleWorldRect(page, {
    minX: 7.4,
    maxX: 8.6,
    minY: 10.1,
    maxY: 10.6,
  });
  const lowerEdge = await sampleWorldRect(page, {
    minX: 7.4,
    maxX: 8.6,
    minY: 11.15,
    maxY: 11.38,
  });
  expect(share(upperSkirt, 'dark'), 'upper skirt should contain ink').toBeGreaterThan(0.02);
  expect(share(lowerSkirt, 'dark'), 'ground hatching should continue downward').toBeGreaterThan(
    0.02,
  );
  expect(
    share(interior, 'paper'),
    'thin ground hatching should retain open paper between strokes',
  ).toBeGreaterThan(0.45);
  expect(share(lowerEdge, 'dark'), 'ground mass should meet the hazard bed').toBeGreaterThan(0.02);

  // A tooth patch and the lethal floor each contain red marks and visible paper between them.
  const spikePatch = await sampleWorldRect(page, {
    minX: 5.55,
    maxX: 6.45,
    minY: 7.53,
    maxY: 7.97,
  });
  const poolPatch = await sampleWorldRect(page, {
    minX: 1,
    maxX: 3,
    minY: 11.55,
    maxY: 12.85,
  });
  expect(share(spikePatch, 'red'), 'spikes should be visibly red').toBeGreaterThan(0.005);
  expect(share(spikePatch, 'paper'), 'spikes should have paper-negative gaps').toBeGreaterThan(
    0.08,
  );
  expect(share(poolPatch, 'red'), 'pool should contain red hatch').toBeGreaterThan(0.08);
  expect(share(poolPatch, 'paper'), 'pool hatching should leave paper gaps').toBeGreaterThan(0.08);
  expect(pageErrors).toEqual([]);
});

test('1-2: pool tile joins stay even and grounded ledge sides remain readable', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // The wider viewport exposes several full 7m pool repeats at the left-side start framing.
  await page.setViewportSize({ width: 2560, height: 900 });
  await page.goto(levelUrl('1-2'));
  await waitForKit(page);

  const seams = await Promise.all(
    [7, 14, 21, 28].map(async (x) => {
      const left = await sampleWorldRect(page, {
        minX: x - 0.16,
        maxX: x - 0.04,
        minY: 11.9,
        maxY: 12.8,
      });
      const right = await sampleWorldRect(page, {
        minX: x + 0.04,
        maxX: x + 0.16,
        minY: 11.9,
        maxY: 12.8,
      });
      return {
        x,
        leftRed: share(left, 'red'),
        rightRed: share(right, 'red'),
        difference: Math.abs(share(left, 'red') - share(right, 'red')),
      };
    }),
  );

  // c1-start ends at x=12m. Compare the final skirt band to nearby hatch below the crest, then
  // check that the thin side contour survives without becoming a broad dark end cap.
  const skirtInterior = await sampleWorldRect(page, {
    minX: 11.15,
    maxX: 11.5,
    minY: 8.12,
    maxY: 8.8,
  });
  const skirtEnd = await sampleWorldRect(page, {
    minX: 11.76,
    maxX: 11.96,
    minY: 8.12,
    maxY: 8.8,
  });
  const sideContour = await sampleWorldRect(page, {
    minX: 11.97,
    maxX: 12.03,
    minY: 8.2,
    maxY: 9.4,
  });
  const skirtFade = {
    interiorDark: share(skirtInterior, 'dark'),
    endDark: share(skirtEnd, 'dark'),
    sideDark: share(sideContour, 'dark'),
    sideInk: share(sideContour, 'ink'),
  };

  // Attach all measurements before assertions so a red run still leaves useful diagnostics.
  await info.attach('Pool seam and skirt fade pixel metrics', {
    body: JSON.stringify({ seams, skirtFade }, null, 2),
    contentType: 'application/json',
  });

  for (const seam of seams) {
    expect(seam.leftRed, `pool should remain visible left of x=${String(seam.x)}m`).toBeGreaterThan(
      0.01,
    );
    expect(
      seam.rightRed,
      `pool should remain visible right of x=${String(seam.x)}m`,
    ).toBeGreaterThan(0.01);
    expect(
      seam.difference,
      `red coverage should match across the x=${String(seam.x)}m tile join`,
    ).toBeLessThanOrEqual(0.015);
  }

  expect(skirtFade.interiorDark, 'nearby skirt hatch should contain ink').toBeGreaterThan(0.02);
  expect(skirtFade.endDark, 'connected ground continues to its exposed side').toBeGreaterThan(0.02);
  expect(skirtFade.sideInk, 'the side contour should remain visible').toBeGreaterThan(0.005);
  expect(skirtFade.sideInk, 'the side contour and hatch should retain paper gaps').toBeLessThan(
    0.75,
  );
  expect(pageErrors).toEqual([]);
});

/** Windows file watchers can briefly deny opening a watched fixture during write or cleanup. */
async function updateFixture(file: URL, text: string | null): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (text === null) await unlink(file);
      else await writeFile(file, text);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (text === null && code === 'ENOENT') return;
      if (attempt >= 9 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(code ?? '')) throw error;
      await delay(50);
    }
  }
}

test('theme-only level edits survive HMR without changing simulation or growing Phaser resources', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'catalog HMR has one file writer');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const fixtureId = `kit-theme-e2e-${randomUUID().slice(0, 8)}`;
  const file = new URL(`../../content/levels/${fixtureId}.json`, import.meta.url);
  const template = JSON.parse(
    await readFile(new URL('../../content/levels/lab-exit-wide.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown> & { telemetry: { levelId: string } };
  const fixture = {
    ...template,
    id: fixtureId,
    telemetry: { ...template.telemetry, levelId: fixtureId },
    theme: 'paper',
  };
  let created = false;

  try {
    created = true;
    await updateFixture(file, `${JSON.stringify(fixture, null, 2)}\n`);
    await expect
      .poll(async () => {
        const response = await request.get('/src/app/web/level-catalog.ts');
        if (!response.ok()) return false;
        return (await response.text()).includes(`${fixtureId}.json`);
      })
      .toBe(true);

    await page.goto(levelUrl(fixtureId));
    await waitForKit(page);
    await page.evaluate(() => Object.assign(window, { __kitThemeDocument: 'still-here' }));
    const initial = await readLevel(page);
    const initialKit = await readKit(page);
    const initialResources = await readResources(page);

    expect(initial).toMatchObject({ id: fixtureId, revision: 0, error: null });
    expect(initialKit).toMatchObject({ ready: true, theme: 'paper' });
    expect(initialResources.cameras).toBe(2);

    for (let revision = 1; revision <= 10; revision++) {
      const theme = revision % 2 === 1 ? 'scenery' : 'paper';
      await updateFixture(file, `${JSON.stringify({ ...fixture, theme }, null, 2)}\n`);
      await expect.poll(() => readLevel(page)).toMatchObject({ revision, error: null });
      await expect.poll(() => readKit(page)).toMatchObject({ theme });
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      });
      const currentKit = await readKit(page);
      const resources = await readResources(page);
      expect(currentKit.fingerprint).toBe(initialKit.fingerprint);
      expect(resources.cameras).toBe(initialResources.cameras);
      expect(resources.textures).toBe(initialResources.textures);
      expect(
        await page.evaluate(
          () => (window as unknown as { __kitThemeDocument: string }).__kitThemeDocument,
        ),
      ).toBe('still-here');
    }

    expect(pageErrors).toEqual([]);
  } finally {
    if (!page.isClosed()) await page.close();
    if (created) await updateFixture(file, null);
  }
});
