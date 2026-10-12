import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface KitHook {
  snapshot(): { tick: number };
  kitPresentation(): {
    ready: boolean;
    kitId: string;
    usedParts: string[];
    fingerprint: string;
    backgrounds: {
      active: boolean;
      surfacePixels: number;
      layers: { id: string; rate: number; offsetX: number }[];
    };
  };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
}

const hook = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __stickgame: KitHook }).__stickgame.kitPresentation(),
  );

async function boot(page: Page, level: string, extra = ''): Promise<void> {
  await page.goto(`/?level=${level}&renderer=canvas${extra}`);
  await page.waitForFunction(() => {
    try {
      const h = (window as unknown as { __stickgame: KitHook }).__stickgame;
      return h.kitPresentation().ready && h.resources().cameras === 4;
    } catch {
      return false;
    }
  });
}

for (const id of ['1-1', '1-2', '1-3']) {
  test(`${id}: 0017 contact datum and fallback preserve collision`, async ({ page }, info) => {
    const level = JSON.parse(await readFile(`content/levels/${id}.json`, 'utf8')) as {
      spawn: number[];
      solids: { kind?: string; rect?: { x: number; y: number; w: number; h: number } }[];
    };
    const x = (level.spawn[0] ?? 0) + 1.5;
    const floor = level.solids.find(
      (s) =>
        s.kind !== 'hazard' &&
        s.rect &&
        x > s.rect.x &&
        x < s.rect.x + s.rect.w &&
        Math.abs(s.rect.y - (level.spawn[1] ?? 0) - 0.35) < 0.05,
    );
    expect(floor?.rect).toBeDefined();
    if (!floor?.rect) throw new Error('Missing spawn floor');
    await boot(page, id);
    const kit = await hook(page);
    expect(kit.kitId).toBe('0017');
    expect(kit.usedParts.length).toBeGreaterThan(3);
    const distance = await page.evaluate(
      ({ px, py }) => {
        const h = (window as unknown as { __stickgame: KitHook }).__stickgame;
        const point = h.worldToScreen(px, py);
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) throw new Error('Missing canvas');
        const c = canvas.getContext('2d');
        if (!c) throw new Error('Expected Canvas renderer');
        const box = canvas.getBoundingClientRect();
        const x = Math.round(((point.x - box.left) * canvas.width) / box.width);
        const y = Math.round(((point.y - box.top) * canvas.height) / box.height);
        const pixels = c.getImageData(x - 3, y - 2, 7, 5).data;
        let nearest = 10;
        for (let row = 0; row < 5; row++)
          for (let col = 0; col < 7; col++) {
            const i = (row * 7 + col) * 4;
            if (
              (pixels[i] ?? 255) * 0.2126 +
                (pixels[i + 1] ?? 255) * 0.7152 +
                (pixels[i + 2] ?? 255) * 0.0722 <
              160
            )
              nearest = Math.min(nearest, Math.abs(row - 2));
          }
        return nearest;
      },
      { px: x, py: floor.rect.y },
    );
    expect(distance, 'contact contour within one screen pixel at native zoom').toBeLessThanOrEqual(
      1,
    );
    await info.attach(`${id}-0017-play`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await boot(page, id, '&overview=1');
    const overview = await hook(page);
    expect(overview.fingerprint).toBe(kit.fingerprint);
    expect(overview.backgrounds.surfacePixels).toBe(kit.backgrounds.surfacePixels);
    await info.attach(`${id}-0017-overview`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await boot(page, id, '&kit=0016');
    const fallback = await hook(page);
    expect(fallback.kitId).toBe('0016');
    expect(fallback.fingerprint).toBe(kit.fingerprint);
  });
}

test('reduced motion freezes all three scenery layers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, '1-1');
  const first = await hook(page);
  expect(first.backgrounds.active).toBe(true);
  expect(first.backgrounds.layers.map((l) => l.id)).toEqual(['T40', 'T41', 'T42']);
  expect(first.backgrounds.layers.map((l) => l.rate)).toEqual([0.08, 0.16, 0.28]);
  await page.keyboard.down('ArrowRight');
  const tick = await page.evaluate(
    () => (window as unknown as { __stickgame: KitHook }).__stickgame.snapshot().tick,
  );
  await page.waitForFunction(
    (firstTick) =>
      (window as unknown as { __stickgame: KitHook }).__stickgame.snapshot().tick > firstTick + 20,
    tick,
  );
  expect((await hook(page)).backgrounds.layers.map((l) => l.offsetX)).toEqual(
    first.backgrounds.layers.map((l) => l.offsetX),
  );
  await page.keyboard.up('ArrowRight');
});

test('0017 pool meniscus repeats continuously and depth has no extra contact stripe', async ({
  page,
}, info) => {
  await boot(page, '1-2');
  const pixels = await page.evaluate(() => {
    const h = (window as unknown as { __stickgame: KitHook }).__stickgame;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const c = canvas?.getContext('2d');
    if (!canvas || !c) throw new Error('Missing Canvas renderer');
    const view = canvas.getBoundingClientRect();
    const a = h.worldToScreen(4, 11.4),
      b = h.worldToScreen(11, 12.95);
    const sx = canvas.width / view.width,
      sy = canvas.height / view.height;
    const x = Math.round((a.x - view.left) * sx),
      y = Math.round((a.y - view.top) * sy);
    const width = Math.round((b.x - a.x) * sx),
      height = Math.round((b.y - a.y) * sy);
    const topRows = Math.round((h.worldToScreen(4, 11.65).y - a.y) * sy);
    const depthStart = Math.round((h.worldToScreen(4, 12).y - a.y) * sy);
    const data = c.getImageData(x, y, width, height).data;
    let red = 0,
      gap = 0,
      longestGap = 0,
      interiorRed = 0,
      interiorPale = 0,
      maxDepthRow = 0,
      interiorPixels = 0;
    for (let col = 0; col < width; col++) {
      let marked = false;
      for (let row = 0; row < topRows; row++) {
        const i = (row * width + col) * 4;
        const r = data[i] ?? 255,
          g = data[i + 1] ?? 255,
          b = data[i + 2] ?? 255;
        if (r > 115 && r > g * 1.3 && r > b * 1.3) {
          marked = true;
          red++;
        }
      }
      gap = marked ? 0 : gap + 1;
      longestGap = Math.max(longestGap, gap);
    }
    for (let row = depthStart; row < height; row++) {
      let dark = 0;
      for (let col = 0; col < width; col++) {
        const i = (row * width + col) * 4;
        const r = data[i] ?? 255,
          g = data[i + 1] ?? 255,
          b = data[i + 2] ?? 255,
          luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance < 160 && Math.abs(r - g) < 25 && Math.abs(r - b) < 25) dark++;
        if (r > g * 1.3 && r > b * 1.3) interiorRed++;
        if (luminance > 175) interiorPale++;
        interiorPixels++;
      }
      maxDepthRow = Math.max(maxDepthRow, dark / width);
    }
    return {
      redCoverage: red / (width * topRows),
      longestGap,
      maxDepthRow,
      interiorRedCoverage: interiorRed / interiorPixels,
      interiorPaleCoverage: interiorPale / interiorPixels,
    };
  });
  await info.attach('0017 pool pixel metrics', {
    body: JSON.stringify(pixels),
    contentType: 'application/json',
  });
  expect(pixels.redCoverage).toBeGreaterThan(0.02);
  expect(pixels.longestGap, 'no visible paper seam between meniscus repeats').toBeLessThanOrEqual(
    3,
  );
  expect(pixels.maxDepthRow, 'depth cannot imply another horizontal contact line').toBeLessThan(
    0.25,
  );
  expect(
    pixels.interiorRedCoverage,
    'the entire lethal pool interior reads as red ink',
  ).toBeGreaterThan(0.9);
  expect(pixels.interiorPaleCoverage, 'depth contains no pale repeating glyph band').toBeLessThan(
    0.05,
  );
});

test('1-2: a continuous ink crest remains underneath the spike strip', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await boot(page, '1-2');
  const coverage = await page.evaluate(() => {
    const h = (window as unknown as { __stickgame: KitHook }).__stickgame;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const c = canvas?.getContext('2d');
    if (!canvas || !c) throw new Error('Missing Canvas renderer');
    const a = h.worldToScreen(5.55, 8),
      b = h.worldToScreen(6.45, 8.08);
    const x = Math.floor(a.x),
      y = Math.floor(a.y);
    const width = Math.ceil(b.x) - x,
      height = Math.ceil(b.y) - y;
    const pixels = c.getImageData(x, y, width, height).data;
    let inkColumns = 0;
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < height; row++) {
        const i = (row * width + col) * 4;
        const r = pixels[i] ?? 255,
          g = pixels[i + 1] ?? 255,
          b = pixels[i + 2] ?? 255;
        if (r < 170 && Math.abs(r - g) < 25 && Math.abs(r - b) < 25) {
          inkColumns++;
          break;
        }
      }
    }
    return inkColumns / width;
  });
  expect(coverage, 'spike art must not cut a pale notch in the supporting floor').toBeGreaterThan(
    0.95,
  );
});
