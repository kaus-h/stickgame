import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { withRects } from './levelRects';

/** Chapter 1 pencil world (PR #102): the invariants the new look must keep. */
interface PencilHook {
  snapshot(): { tick: number };
  kitPresentation(): {
    ready: boolean;
    world: string;
    vista: {
      layers: number;
      offsets: { id: string; x: number; y: number }[];
      foreground: { offset: number; top: number; height: number } | null;
    } | null;
    motes: { drifting: boolean; clock: number } | null;
  };
  resources(): { textures: number; cameras: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
}

type Rect = { x: number; y: number; w: number; h: number };
interface LevelJson {
  spawn: number[];
  solids: { id: string; kind?: string; rect?: Rect }[];
}

const hook = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __stickgame: PencilHook }).__stickgame.kitPresentation(),
  );

async function boot(page: Page, level: string, extra = ''): Promise<void> {
  await page.goto(`/?level=${level}&renderer=canvas${extra}`);
  await page.waitForFunction(() => {
    try {
      const h = (window as unknown as { __stickgame: PencilHook }).__stickgame;
      return h.kitPresentation().ready && h.resources().cameras === 4;
    } catch {
      return false;
    }
  });
}

/** Canvas pixels (RGB) at world points, read from the Canvas renderer's backbuffer. */
function pixelsAt(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
  return page.evaluate((pts) => {
    const h = (window as unknown as { __stickgame: PencilHook }).__stickgame;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const c = canvas?.getContext('2d');
    if (!canvas || !c) throw new Error('Expected Canvas renderer');
    const box = canvas.getBoundingClientRect();
    return pts.map((p) => {
      const s = h.worldToScreen(p.x, p.y);
      const x = Math.round(((s.x - box.left) * canvas.width) / box.width);
      const y = Math.round(((s.y - box.top) * canvas.height) / box.height);
      const d = c.getImageData(x, y, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, x, y];
    });
  }, points);
}

test('1-1 boots in the pencil world without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    // The dev server has no favicon; that browser request is not the game's.
    if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico'))
      errors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  for (const id of ['1-1', '1-2', '1-3', '2-1']) {
    await boot(page, id);
    const kit = await hook(page);
    expect(kit.world, id).toBe('pencil');
    expect(kit.vista?.layers, id).toBe(4);
  }
  expect(errors).toEqual([]);
});

test('1-1: the walkable top line is drawn on the collision line', async ({ page }) => {
  const level = JSON.parse(
    await readFile('content/levels/1-1.json', 'utf8'),
    withRects,
  ) as LevelJson;
  const x = (level.spawn[0] ?? 0) + 1.5;
  const floor = level.solids.find(
    (s) =>
      s.kind !== 'hazard' &&
      s.rect &&
      x > s.rect.x &&
      x < s.rect.x + s.rect.w &&
      Math.abs(s.rect.y - (level.spawn[1] ?? 0) - 0.35) < 0.05,
  )?.rect;
  if (!floor) throw new Error('Missing spawn floor');
  await boot(page, '1-1');
  // Sample several columns along the ledge: the darkest ink row must sit on the collision y.
  const offsets = await page.evaluate(
    ({ xs, y }) => {
      const h = (window as unknown as { __stickgame: PencilHook }).__stickgame;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const c = canvas?.getContext('2d');
      if (!canvas || !c) throw new Error('Expected Canvas renderer');
      const box = canvas.getBoundingClientRect();
      return xs.map((wx) => {
        const s = h.worldToScreen(wx, y);
        const px = Math.round(((s.x - box.left) * canvas.width) / box.width);
        const py = Math.round(((s.y - box.top) * canvas.height) / box.height);
        const d = c.getImageData(px, py - 3, 1, 7).data;
        // Nearest ink-dark row to the collision row (tufts above and the lip shadow below
        // are dark too, so measure the nearest, not the darkest).
        let best = 99,
          dark = 999;
        for (let row = 0; row < 7; row++) {
          const i = row * 4;
          const lum =
            (d[i] ?? 255) * 0.2126 + (d[i + 1] ?? 255) * 0.7152 + (d[i + 2] ?? 255) * 0.0722;
          dark = Math.min(dark, lum);
          if (lum < 110 && Math.abs(row - 3) < Math.abs(best)) best = row - 3;
        }
        return { offset: best, dark };
      });
    },
    { xs: [x - 1, x, x + 1.3, x + 2.4], y: floor.y },
  );
  for (const o of offsets) {
    expect(o.dark, 'an ink line exists at the top').toBeLessThan(110);
    expect(Math.abs(o.offset), 'ink line within one pixel of collision').toBeLessThanOrEqual(1);
  }
});

test('1-1: the red floor reads fully red along its top, above the foreground strip', async ({
  page,
}) => {
  const level = JSON.parse(
    await readFile('content/levels/1-1.json', 'utf8'),
    withRects,
  ) as LevelJson;
  const red = level.solids.find((s) => s.id === 'red-ink')?.rect;
  if (!red) throw new Error('Missing red-ink floor');
  await boot(page, '1-1');
  const kit = await hook(page);
  const fg = kit.vista?.foreground;
  expect(fg).toBeTruthy();
  const view = await page.evaluate(() => {
    const h = (window as unknown as { __stickgame: PencilHook }).__stickgame;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!canvas) throw new Error('Missing canvas');
    const box = canvas.getBoundingClientRect();
    const a = h.worldToScreen(0, 0);
    const b = h.worldToScreen(1, 0);
    return { left: box.left, width: box.width, pxPerM: b.x - a.x, x0: a.x };
  });
  // Every visible half metre of the floor, just under its top edge.
  const xs: number[] = [];
  const first = (view.left - view.x0) / view.pxPerM;
  const last = (view.left + view.width - view.x0) / view.pxPerM;
  for (
    let x = Math.max(red.x + 0.2, first + 0.3);
    x < Math.min(red.x + red.w - 0.2, last - 0.3);
    x += 0.5
  )
    xs.push(x);
  expect(xs.length).toBeGreaterThan(10);
  const samples = await pixelsAt(
    page,
    xs.map((x) => ({ x, y: red.y + 0.15 })),
  );
  for (const [r = 0, g = 0, b = 0, px = 0, py = 0] of samples) {
    expect(r, `red at ${String(px)},${String(py)}`).toBeGreaterThan(g * 1.8);
    expect(r).toBeGreaterThan(b * 1.8);
    // The foreground strip stays below the floor's top.
    expect(py).toBeLessThan((fg?.top ?? 0) + 1);
  }
});

test('reduced motion holds the pencil parallax, foreground and dust still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, '1-1');
  const first = await hook(page);
  expect(first.motes?.drifting).toBe(false);
  await page.keyboard.down('ArrowRight');
  const tick = await page.evaluate(
    () => (window as unknown as { __stickgame: PencilHook }).__stickgame.snapshot().tick,
  );
  await page.waitForFunction(
    (t) => (window as unknown as { __stickgame: PencilHook }).__stickgame.snapshot().tick > t + 40,
    tick,
  );
  const later = await hook(page);
  await page.keyboard.up('ArrowRight');
  expect(later.vista?.offsets).toEqual(first.vista?.offsets);
  expect(later.vista?.foreground?.offset).toBe(first.vista?.foreground?.offset);
  expect(later.motes?.clock).toBe(0);
});
