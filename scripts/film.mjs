#!/usr/bin/env node
// GMR-115: renderer capture at simulation ticks, never at wall-clock intervals.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { build } from 'rolldown';
import { createServer } from 'vite';
import { layoutGrid, selectFrameTicks, selectSheetFrames } from './film-math.mjs';
import { filmRange, parseFilmArgs } from './film-options.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const { GIFEncoder, quantize, applyPalette } = gifenc;

function encodeGif(frames) {
  const gif = GIFEncoder();
  for (const [i, frame] of frames.entries()) {
    // GIF stores hundredths of a second. Round cumulative tick times, so 4-tick intervals
    // alternate 60/70 ms rather than drifting by rounding every delay independently.
    const next = frames[i + 1];
    const delay = next
      ? (Math.round((next.tick * 100) / 60) - Math.round((frame.tick * 100) / 60)) * 10
      : 500;
    gif.writeFrame(frame.index, frame.width, frame.height, {
      palette: frame.palette,
      delay: Math.max(10, Math.min(655350, delay)),
      repeat: 0,
    });
  }
  gif.finish();
  return gif.bytes();
}

async function contactSheet(page, frames) {
  const selected = selectSheetFrames(frames.map((frame) => frame.tick));
  const images = selected.map((tick) => frames.find((frame) => frame.tick === tick));
  const first = images[0];
  const grid = layoutGrid(images.length, first.width, first.height);
  return page.evaluate(
    async ({ images, grid }) => {
      const canvas = document.createElement('canvas');
      canvas.width = grid.width;
      canvas.height = grid.height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#f3efe6';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = 'bold 24px sans-serif';
      context.textBaseline = 'top';
      for (const [i, frame] of images.entries()) {
        const image = new Image();
        image.src = `data:image/png;base64,${frame.png}`;
        await image.decode();
        const cell = grid.cells[i];
        context.drawImage(image, cell.x, cell.y, grid.frameWidth, grid.frameHeight);
        context.fillStyle = '#16161a';
        context.fillText(`tick ${frame.tick}`, cell.x + 6, cell.labelY + 4);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { images: images.map(({ tick, width, height, png }) => ({ tick, width, height, png })), grid },
  );
}

async function main() {
  const started = performance.now();
  const options = parseFilmArgs(process.argv.slice(2));
  const levelsDir = join(root, 'content', 'levels');
  const level = readdirSync(levelsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(join(levelsDir, file)))
    .find((level) => level.id === options.id);
  if (!level) throw new Error(`unknown level id: ${options.id}`);
  let solution;
  try {
    solution = readJson(join(root, 'content', 'solutions', `${options.id}.json`));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`no solution for ${options.id}; run npm run levels:solve -- ${options.id}`);
  }
  if (
    solution.format !== 1 ||
    solution.level !== options.id ||
    !solution.solved ||
    solution.start !== 'spawn' ||
    typeof solution.replay !== 'string' ||
    !Number.isSafeInteger(solution.totalTicks) ||
    solution.totalTicks <= 0
  )
    throw new Error(
      `no full solved route for ${options.id}; run npm run levels:solve -- ${options.id}`,
    );
  const { start, end } = filmRange(options, solution);
  const ticks = selectFrameTicks(start, end, options.every, 600);

  // Verify the committed route against current code/content before filming, including lab goals.
  // Also compare every captured browser state with the GMR-29 replay path in Node.
  const cache = join(root, 'node_modules', '.cache', 'film');
  mkdirSync(cache, { recursive: true });
  const entry = join(cache, 'entry.mjs');
  const module = join(cache, 'reference.mjs');
  writeFileSync(
    entry,
    `export { FilmSession } from ${JSON.stringify(join(root, 'src/tools/film/session.ts').replaceAll('\\', '/'))};\nexport { verifySolution } from ${JSON.stringify(join(root, 'src/tools/route-solver/solve.ts').replaceAll('\\', '/'))};\n`,
  );
  await build({
    input: entry,
    cwd: root,
    platform: 'node',
    logLevel: 'warn',
    output: { file: module, format: 'esm' },
  });
  const { FilmSession, verifySolution } = await import(pathToFileURL(module).href);
  const tuning = readJson(join(root, 'content', 'tuning', 'runtime.json'));
  const reference = new FilmSession(level, tuning, solution.replay);
  const expected = new Map();
  try {
    if (reference.replay.ticks !== solution.totalTicks)
      throw new Error('solution tick count does not match replay');
    const verification = verifySolution(reference.level, reference.tuning, solution);
    if (!verification.ok)
      throw new Error(
        `route no longer verifies: goals ${verification.reached}/${verification.goals}, deaths ${verification.deaths}; re-run levels:solve`,
      );
    const captureTicks = new Set(ticks);
    for (let tick = 0; tick <= end; tick++) {
      if (captureTicks.has(tick)) expected.set(tick, reference.result());
      if (tick < end) reference.advance();
    }
  } finally {
    reference.dispose();
  }

  let server;
  let browser;
  const cleanup = async () => {
    try {
      await browser?.close();
    } finally {
      await server?.close();
    }
  };
  const interrupt = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    // Bind directly to port 0: the OS allocates a free loopback port without a probe/start race.
    server = await createServer({
      root,
      server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
    });
    await server.listen();
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        `Chromium could not launch; run npx playwright install chromium. ${error.message}`,
      );
    }
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${server.resolvedUrls.local[0]}?film=1&level=${encodeURIComponent(options.id)}`,
      { waitUntil: 'load' },
    );
    try {
      await page.waitForFunction(() => window.__film, { timeout: 30000 });
    } catch (error) {
      throw new Error(`film renderer did not initialize: ${errors.join('; ') || error.message}`);
    }
    const frames = [];
    for (const tick of ticks) {
      const capture = await page.evaluate(
        ({ tick, scale }) => {
          const result = window.__film.advanceTo(tick);
          return { result, png: window.__film.capture(scale) };
        },
        { tick, scale: options.scale },
      );
      if (JSON.stringify(capture.result) !== JSON.stringify(expected.get(tick)))
        throw new Error(`Node/browser replay drift at tick ${tick}`);
      const png = PNG.sync.read(Buffer.from(capture.png, 'base64'));
      const palette = quantize(png.data, 64);
      frames.push({
        tick,
        png: capture.png,
        width: png.width,
        height: png.height,
        palette,
        index: applyPalette(png.data, palette),
      });
    }
    if (errors.length) throw new Error(`renderer errors: ${errors.join('; ')}`);
    const sheet = await contactSheet(page, frames);
    let gifFrames = frames;
    let gif = encodeGif(gifFrames);
    while (gif.byteLength > MAX_GIF_BYTES && gifFrames.length > 2) {
      const keep = new Set(
        selectSheetFrames(
          gifFrames.map((frame) => frame.tick),
          Math.max(2, Math.ceil(gifFrames.length / 2)),
        ),
      );
      gifFrames = gifFrames.filter((frame) => keep.has(frame.tick));
      gif = encodeGif(gifFrames);
    }
    if (gif.byteLength > MAX_GIF_BYTES)
      throw new Error('GIF exceeds 8 MiB even at two frames; use a smaller --scale');
    const output = join(root, 'artifacts', 'film');
    mkdirSync(output, { recursive: true });
    const gifPath = join(output, `${options.id}.gif`);
    const sheetPath = join(output, `${options.id}-sheet.png`);
    writeFileSync(gifPath, gif);
    writeFileSync(sheetPath, Buffer.from(sheet, 'base64'));
    console.log(`Verified route; Node/browser hashes match at ${frames.length} capture ticks.`);
    console.log(
      `${gifPath} (${gifFrames.length} frames, ${(gif.byteLength / 1024 / 1024).toFixed(2)} MiB, ticks ${start}..${end})`,
    );
    console.log(sheetPath);
    console.log(
      `Film finished in ${((performance.now() - started) / 1000).toFixed(1)}s; completion=${expected.get(end).completion}`,
    );
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`film: ${error.message}`);
  process.exitCode = 1;
});
