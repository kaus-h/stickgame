import { expect, test, type Page, type TestInfo } from '@playwright/test';

interface TerrainHook {
  kitPresentation(): {
    ready: boolean;
    theme: string;
    fingerprint: string;
    tiles: number;
    surfacePixels: number;
  };
  level(): { id: string; revision: number; error: string | null };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
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

function gameUrl(levelId: string, overview = false): string {
  // Flat light: these specs classify paper and ink by colour, which the lamplight shades.
  const query = new URLSearchParams({ level: levelId, renderer: 'canvas', lamp: '0' });
  if (overview) query.set('overview', '1');
  return `/?${query.toString()}`;
}

async function waitForKit(page: Page): Promise<void> {
  await page.locator('#game canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(
    () => {
      try {
        const game = (window as unknown as { __stickgame: TerrainHook }).__stickgame;
        return game.kitPresentation().ready && game.resources().cameras === 4;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 20_000 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

async function readPixels(page: Page, rect: WorldRect): Promise<PixelStats> {
  return page.evaluate((worldRect) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!canvas) throw new Error('Phaser canvas is missing');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Phaser Canvas 2D context is missing');
    const game = (window as unknown as { __stickgame: TerrainHook }).__stickgame;
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
      if (luminance > 210 && red - green < 24 && red - blue < 36) stats.paper++;
      if (red > 115 && red > green * 1.3 && red > blue * 1.3) stats.red++;
    }
    return stats;
  }, rect);
}

const share = (stats: PixelStats, key: keyof Omit<PixelStats, 'total'>): number =>
  stats.total ? stats[key] / stats.total : 0;

async function attachCanvas(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('1-3: a wall-floor T-junction joins the left-bound terrain without an inner contour', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 2560, height: 900 });
  await page.goto(gameUrl('1-3'));
  await waitForKit(page);

  const state = await page.evaluate(() => {
    const game = (window as unknown as { __stickgame: TerrainHook }).__stickgame;
    return { level: game.level(), kit: game.kitPresentation() };
  });
  expect(state.level).toMatchObject({ id: '1-3', revision: 0, error: null });
  expect(state.kit).toMatchObject({ ready: true, theme: 'paper' });
  await attachCanvas(page, info, '1-3-connected-floor-wall');

  // Production geometry: c1-floor (0..16m, y=8..11.4m) meets c1-wall
  // (16..17.5m, y=4.3..11.4m); wall-left is flush with bounds.minX=-1m.
  const join = await readPixels(page, {
    minX: 15.96,
    maxX: 16.04,
    minY: 8.15,
    maxY: 9.55,
  });
  const exposedWallEdge = await readPixels(page, {
    minX: 17.46,
    maxX: 17.54,
    minY: 8.15,
    maxY: 9.55,
  });
  const leftBoundContact = await readPixels(page, {
    minX: -0.98,
    maxX: -0.9,
    minY: 8.2,
    maxY: 9.2,
  });
  const contactBed = await readPixels(page, {
    minX: 4,
    maxX: 8,
    minY: 10.95,
    maxY: 11.35,
  });

  await info.attach('Connected terrain pixel metrics', {
    body: JSON.stringify(
      {
        join: { dark: share(join, 'dark'), ink: share(join, 'ink') },
        exposedWallEdge: {
          dark: share(exposedWallEdge, 'dark'),
          ink: share(exposedWallEdge, 'ink'),
        },
        leftBoundContact: {
          dark: share(leftBoundContact, 'dark'),
          ink: share(leftBoundContact, 'ink'),
        },
        floorContact: { dark: share(contactBed, 'dark'), ink: share(contactBed, 'ink') },
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  expect(
    share(leftBoundContact, 'ink'),
    'terrain should ink the left-bound wall face',
  ).toBeGreaterThan(0.02);
  expect(share(contactBed, 'ink'), 'the floor mass should remain visibly attached').toBeGreaterThan(
    0.02,
  );
  expect(
    share(exposedWallEdge, 'ink'),
    'the exposed wall edge is the contour control',
  ).toBeGreaterThan(0.005);
  expect(
    share(join, 'ink'),
    'the connected floor-wall join should not retain a doubled internal contour',
  ).toBeLessThan(share(exposedWallEdge, 'ink') * 0.8);
  expect(pageErrors).toEqual([]);
});

test('1-1: an isolated overhead platform has underside drips and keeps the paper open', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(gameUrl('1-1', true));
  await waitForKit(page);

  const state = await page.evaluate(() => {
    const game = (window as unknown as { __stickgame: TerrainHook }).__stickgame;
    return {
      level: game.level(),
      kit: game.kitPresentation(),
      resources: game.resources(),
    };
  });
  expect(state.level).toMatchObject({ id: '1-1', revision: 0, error: null });
  expect(state.kit).toMatchObject({ ready: true, theme: 'paper' });
  await attachCanvas(page, info, '1-1-ceiling-overview');

  // Production c6-ceiling spans x=98..122m and y=-1.6..-0.4m, isolated over open paper.
  const underside = await readPixels(page, {
    minX: 102,
    maxX: 118,
    // Sample the actual contact line; 0017's lighter hatch is not the collision datum.
    minY: -0.45,
    maxY: -0.35,
  });
  const drips = await readPixels(page, {
    minX: 102,
    maxX: 118,
    minY: -0.395,
    maxY: -0.2,
  });
  const openPaper = await readPixels(page, {
    minX: 102,
    maxX: 118,
    minY: 0.65,
    maxY: 1.45,
  });

  await info.attach('Ceiling underside pixel metrics', {
    body: JSON.stringify(
      {
        underside: {
          dark: share(underside, 'dark'),
          ink: share(underside, 'ink'),
        },
        drips: {
          dark: share(drips, 'dark'),
          ink: share(drips, 'ink'),
          paper: share(drips, 'paper'),
        },
        openPaper: {
          dark: share(openPaper, 'dark'),
          ink: share(openPaper, 'ink'),
          paper: share(openPaper, 'paper'),
        },
        resources: state.resources,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  expect(
    share(underside, 'ink'),
    'the exposed ceiling underside should carry visible ink',
  ).toBeGreaterThan(0.01);
  expect(
    share(drips, 'ink'),
    'the open side of the ceiling should show its ink drips',
  ).toBeGreaterThan(0.002);
  expect(share(drips, 'paper'), 'underside marks should remain broken over paper').toBeGreaterThan(
    0.55,
  );
  expect(
    share(openPaper, 'paper'),
    'the hanging platform should leave paper visible below its feathered skirt',
  ).toBeGreaterThan(0.72);
  expect(share(openPaper, 'dark'), 'no solid dark panel should fill the paper gap').toBeLessThan(
    0.05,
  );
  expect(pageErrors).toEqual([]);
});

test('1-3: outside the lower world bounds stays patterned paper without allocating a giant surface', async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(gameUrl('1-3', true));
  await waitForKit(page);

  const state = await page.evaluate(() => {
    const game = (window as unknown as { __stickgame: TerrainHook }).__stickgame;
    return {
      level: game.level(),
      kit: game.kitPresentation(),
      resources: game.resources(),
    };
  });
  expect(state.level).toMatchObject({ id: '1-3', revision: 0, error: null });
  expect(state.kit).toMatchObject({ ready: true, theme: 'paper' });
  await attachCanvas(page, info, '1-3-below-world-bounds-overview');

  // The production lower bound is y=16m. This sample sits clearly below it,
  // where only the finite patterned-paper surface should be visible.
  const outsideBottom = await readPixels(page, {
    minX: 30,
    maxX: 60,
    minY: 25,
    maxY: 30,
  });
  const maxBakedSurfacePixels = 185 * 64 * 28 * 64 + 2560 * 1440 + 256 * 256;
  await info.attach('Outside bottom bounds pixel and surface metrics', {
    body: JSON.stringify(
      {
        sample: { minX: 30, maxX: 60, minY: 25, maxY: 30 },
        pixels: {
          ink: share(outsideBottom, 'ink'),
          paper: share(outsideBottom, 'paper'),
          red: share(outsideBottom, 'red'),
        },
        kit: { tiles: state.kit.tiles, surfacePixels: state.kit.surfacePixels },
        maxBakedSurfacePixels,
        resources: state.resources,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  expect(
    share(outsideBottom, 'ink'),
    'the paper pattern should remain visible below the bottom world bound',
  ).toBeGreaterThan(0.02);
  expect(
    share(outsideBottom, 'paper'),
    'the lower outside area should remain mostly open paper',
  ).toBeGreaterThan(0.45);
  expect(
    share(outsideBottom, 'red'),
    'the outside-bottom paper sample should not be filled by hazard ink',
  ).toBeLessThan(0.005);
  expect(
    state.kit.surfacePixels,
    'the baked terrain surface should stay bounded by the padded level, viewport, and one spare tile',
  ).toBeLessThanOrEqual(maxBakedSurfacePixels);
  expect(pageErrors).toEqual([]);
});
