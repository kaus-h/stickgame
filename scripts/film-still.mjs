#!/usr/bin/env node
// GMR-114: full-resolution film stills at simulation ticks, for judging art and framing up close.
// Several ticks write <out>-0.png, <out>-1.png, ... Crop is x,y,w,h in pixels. Uses installed
// Chrome unless PW_CHANNEL says otherwise.
//
//   npm run film:still -- <level> <tick[,tick...]> <out.png> [x,y,w,h] [WxH] [query]
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { PNG } from 'pngjs';

const [id, tickArg, out, crop, size = '1920x1080', query = ''] = process.argv.slice(2);
const [vw, vh] = size.split('x').map(Number);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL ?? 'chrome',
});
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await page.goto(`${server.resolvedUrls.local[0]}?film=1&level=${id}${query}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => window.__film, { timeout: 60000 });
  const ticks = tickArg.split(',').map(Number);
  for (const [i, tick] of ticks.entries()) {
    const b64 = await page.evaluate((t) => {
      window.__film.advanceTo(t);
      return window.__film.capture(1);
    }, tick);
    let png = PNG.sync.read(Buffer.from(b64, 'base64'));
    if (crop) {
      const [x, y, w, h] = crop.split(',').map(Number);
      const c = new PNG({ width: w, height: h });
      PNG.bitblt(png, c, x, y, w, h, 0, 0);
      png = c;
    }
    const path = ticks.length > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
    writeFileSync(path, PNG.sync.write(png));
    console.log(path, png.width, png.height);
  }
} finally {
  await browser.close();
  await server.close();
}
