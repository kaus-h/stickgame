#!/usr/bin/env node
// Film a level (GMR-115): replay the committed solver route through the real renderer in headless
// Chromium and write an animated GIF plus a contact sheet, so motion can be judged without playing.
//
//   npm run film -- 1-1                          whole route
//   npm run film -- 2-1 --from c3 --to c4        chambers c3..c4 only
//   npm run film -- 1-1 --fps 20 --scale 0.4 --size 1600x900 --sheet 16 --renderer canvas
//
// Writes artifacts/film/<level>[-<from>].gif and <level>[-<from>]-sheet.png. Frames are taken on a
// tick cadence (the page steps the fixed 60 Hz sim itself), so a route always films the same frames.
// Uses Playwright's Chromium when installed, otherwise the installed Chrome or Edge.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const id = argv[0];
const usage =
  'usage: npm run film -- <level-id> [--from <chamber>] [--to <chamber>] [--fps 15] [--scale 0.5] ' +
  '[--size 1280x720] [--sheet 16] [--tail 45] [--colors 64] [--renderer webgl|canvas] [--headed]';
if (!id || id.startsWith('--')) {
  console.error(usage);
  process.exit(1);
}
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const fps = Number(opt('fps', '15'));
const every = Math.max(1, Math.round(60 / fps));
const scale = Number(opt('scale', '0.5'));
const [vw, vh] = opt('size', '1280x720').split('x').map(Number);
const sheetFrames = Number(opt('sheet', '16'));
const tail = Number(opt('tail', '45'));
const renderer = opt('renderer', 'webgl');
const colors = Number(opt('colors', '64'));

const solutionPath = join(root, 'content', 'solutions', `${id}.json`);
let solution;
try {
  solution = JSON.parse(readFileSync(solutionPath, 'utf8'));
} catch {
  console.error(`No solver route at ${relative(root, solutionPath)}. Run npm run levels:solve.`);
  process.exit(1);
}
if (typeof solution.replay !== 'string') {
  console.error(`${id}: the solution has no replay to film.`);
  process.exit(1);
}
const chambers = solution.chambers ?? [];
const findChamber = (key) => {
  const c =
    chambers.find((ch) => ch.id === key || ch.id.endsWith(`-${key}`)) ?? chambers[Number(key) - 1];
  if (!c)
    throw new Error(
      `No chamber "${key}" in ${id} (have ${chambers.map((ch) => ch.id).join(', ')})`,
    );
  return c;
};
const fromKey = opt('from', null);
const toKey = opt('to', null);
const from = fromKey ? findChamber(fromKey).startTick : 0;
const to = toKey
  ? (findChamber(toKey).endTick ?? solution.totalTicks) + tail
  : solution.totalTicks + tail;
const short = (chamberId) => chamberId.replace(`${id}-`, '');
const labels = chambers.map((c) => ({ tick: c.startTick, text: short(c.id) }));
const name = fromKey ? `${id}-${short(findChamber(fromKey).id)}` : id;

const started = Date.now();
const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 5190, strictPort: false, open: false },
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5190/';

async function launch() {
  const headless = !flag('headed');
  const attempts = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  for (const extra of attempts) {
    try {
      return await chromium.launch({ headless, ...extra });
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('No Chromium found. Run `npx playwright install chromium` or install Chrome.');
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const query = new URLSearchParams({ level: id });
  if (renderer === 'canvas') query.set('renderer', 'canvas');
  await page.goto(`${base}?${query.toString()}`);
  await page.waitForFunction(
    () => {
      try {
        return window.__stickgame.kitPresentation().ready;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60_000 },
  );
  const result = await page.evaluate(
    async (o) => {
      const mod = await import('/src/tools/film/capture.ts');
      return mod.film(o);
    },
    {
      replay: solution.replay,
      from,
      to,
      every,
      scale,
      sheetFrames,
      sheetColumns: 4,
      sheetWidth: 1600,
      labels,
      colors,
      title: `${id}${fromKey ? ` from ${short(findChamber(fromKey).id)}` : ''}  ·  ticks ${from}-${to}  ·  ${fps} fps  ·  ${renderer}`,
    },
  );
  if (errors.length) console.warn(`page errors:\n  ${errors.join('\n  ')}`);
  const outDir = join(root, 'artifacts', 'film');
  mkdirSync(outDir, { recursive: true });
  const gifPath = join(outDir, `${name}.gif`);
  const sheetPath = join(outDir, `${name}-sheet.png`);
  writeFileSync(gifPath, Buffer.from(result.gif, 'base64'));
  writeFileSync(sheetPath, Buffer.from(result.sheet.split(',')[1], 'base64'));
  const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;
  console.log(
    `${relative(root, gifPath)} (${kb(gifPath)}, ${result.frames} frames ${result.width}x${result.height})\n` +
      `${relative(root, sheetPath)} (${kb(sheetPath)})\n` +
      `capture ${(result.ms / 1000).toFixed(1)} s, total ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
} finally {
  await browser.close();
  await server.close();
}
