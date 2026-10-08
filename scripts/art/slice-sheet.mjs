#!/usr/bin/env node
// Slice a transparent asset sheet into one PNG per object (doc 32 pipeline, GMR-40).
//
// Objects are found from the alpha channel: pixels are grouped when they lie within `--gap` pixels
// of each other, so loose hatching strokes stay with their object. Objects are ordered by row, then
// left to right. A spec file names them and gives each one's source scale (sheet pixels per meter);
// each object is then written at 1x (64 px/m, matching PIXELS_PER_METER) and 2x (128 px/m) with
// area-averaged downscaling, and listed in a manifest.
//
// Usage: node scripts/art/slice-sheet.mjs <sheet.png> <out-dir> [--spec spec.json] [--gap 14] [--min-area 400]
// Spec: { "objects": [ { "name": "platform-mid", "sourcePxPerMeter": 161 }, ... ] } in detected order.

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const PX_PER_METER_1X = 64;

function parseArgs(argv) {
  const [sheet, outDir, ...rest] = argv;
  if (!sheet || !outDir) {
    console.error(
      'usage: slice-sheet.mjs <sheet.png> <out-dir> [--spec file] [--gap N] [--min-area N]',
    );
    process.exit(2);
  }
  const opts = { gap: 14, minArea: 400, alpha: 16, spec: null };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    const raw = rest[i + 1];
    if (key === 'spec') opts.spec = JSON.parse(fs.readFileSync(raw, 'utf8'));
    else if (key === 'gap') opts.gap = Number(raw);
    else if (key === 'min-area') opts.minArea = Number(raw);
    else if (key === 'alpha') opts.alpha = Number(raw);
  }
  return { sheet, outDir, opts };
}

/** Group opaque pixels into objects: a coarse grid of `gap`-sized cells, flood-filled with 8-connectivity. */
function findObjects(png, { gap, alpha, minArea }) {
  const { width, height, data } = png;
  const cell = Math.max(1, Math.floor(gap / 2));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const occupied = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alpha)
        occupied[Math.floor(y / cell) * gw + Math.floor(x / cell)] = 1;
    }
  }

  const label = new Int32Array(gw * gh).fill(-1);
  const boxes = [];
  for (let start = 0; start < occupied.length; start++) {
    if (!occupied[start] || label[start] !== -1) continue;
    const id = boxes.length;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % gw;
      const cy = (c - cx) / gw;
      box.x0 = Math.min(box.x0, cx);
      box.y0 = Math.min(box.y0, cy);
      box.x1 = Math.max(box.x1, cx);
      box.y1 = Math.max(box.y1, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (occupied[n] && label[n] === -1) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
    }
    boxes.push(box);
  }

  return boxes
    .map((b) => {
      const x = b.x0 * cell;
      const y = b.y0 * cell;
      return {
        x,
        y,
        width: Math.min(width, (b.x1 + 1) * cell) - x,
        height: Math.min(height, (b.y1 + 1) * cell) - y,
      };
    })
    .filter((b) => b.width * b.height >= minArea)
    .map((b) => tighten(png, b, alpha))
    .sort((a, b) => rowOf(a) - rowOf(b) || a.x - b.x);

  function rowOf(b) {
    return Math.round((b.y + b.height / 2) / (gap * 12));
  }
}

/** Shrink a box to the exact opaque pixels inside it. */
function tighten(png, box, alpha) {
  const { width, data } = png;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (data[(y * width + x) * 4 + 3] > alpha) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(png, box, pad) {
  const out = new PNG({ width: box.width + pad * 2, height: box.height + pad * 2 });
  out.data.fill(0);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const s = ((box.y + y) * png.width + box.x + x) * 4;
      const d = ((y + pad) * out.width + x + pad) * 4;
      png.data.copy(out.data, d, s, s + 4);
    }
  }
  return out;
}

/** Area-averaging downscale on premultiplied alpha (no dark fringes around ink strokes). */
function downscale(src, scale) {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = new PNG({ width: w, height: h });
  const fx = src.width / w;
  const fy = src.height / h;
  for (let oy = 0; oy < h; oy++) {
    const sy0 = oy * fy;
    const sy1 = sy0 + fy;
    for (let ox = 0; ox < w; ox++) {
      const sx0 = ox * fx;
      const sx1 = sx0 + fx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          const weight = wx * wy;
          const i = (Math.min(sy, src.height - 1) * src.width + Math.min(sx, src.width - 1)) * 4;
          const sa = src.data[i + 3] / 255;
          r += src.data[i] * sa * weight;
          g += src.data[i + 1] * sa * weight;
          b += src.data[i + 2] * sa * weight;
          a += sa * weight;
          area += weight;
        }
      }
      const d = (oy * w + ox) * 4;
      out.data[d] = a > 0 ? Math.round(r / a) : 0;
      out.data[d + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[d + 2] = a > 0 ? Math.round(b / a) : 0;
      out.data[d + 3] = Math.round((a / area) * 255);
    }
  }
  return out;
}

const { sheet, outDir, opts } = parseArgs(process.argv.slice(2));
const png = PNG.sync.read(fs.readFileSync(sheet));
if (png.colorType !== 6 && png.alpha !== true) {
  console.warn('warning: sheet has no alpha channel; every pixel will count as opaque');
}
const objects = findObjects(png, opts);
const specs = opts.spec?.objects ?? [];
if (opts.spec && specs.length !== objects.length) {
  console.error(
    `spec lists ${String(specs.length)} objects but the sheet has ${String(objects.length)}; fix the spec or --gap`,
  );
  process.exit(1);
}
fs.mkdirSync(path.join(outDir, '2x'), { recursive: true });
fs.mkdirSync(path.join(outDir, '1x'), { recursive: true });

const manifest = { source: path.basename(sheet), pxPerMeter1x: PX_PER_METER_1X, objects: [] };
objects.forEach((box, i) => {
  const spec = specs[i];
  const name = spec?.name ?? `obj-${String(i).padStart(2, '0')}`;
  // Without a spec, assume the sheet is drawn at 2x.
  const sourcePxPerMeter = spec?.sourcePxPerMeter ?? PX_PER_METER_1X * 2;
  const full = crop(png, box, 2);
  const scale2x = (PX_PER_METER_1X * 2) / sourcePxPerMeter;
  const scale1x = PX_PER_METER_1X / sourcePxPerMeter;
  if (scale2x > 1)
    console.warn(
      `warning: ${name} would be upscaled for 2x (${scale2x.toFixed(2)}); source is too small`,
    );
  const img2x = downscale(full, Math.min(1, scale2x));
  const img1x = downscale(full, scale1x);
  fs.writeFileSync(path.join(outDir, '2x', `${name}.png`), PNG.sync.write(img2x));
  fs.writeFileSync(path.join(outDir, '1x', `${name}.png`), PNG.sync.write(img1x));
  manifest.objects.push({
    name,
    sourceBox: box,
    sourcePxPerMeter,
    sizeMeters: [
      +(full.width / sourcePxPerMeter).toFixed(3),
      +(full.height / sourcePxPerMeter).toFixed(3),
    ],
    size1x: [img1x.width, img1x.height],
    size2x: [img2x.width, img2x.height],
  });
});
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${String(objects.length)} objects -> ${outDir}`);
for (const o of manifest.objects) {
  console.log(
    `${o.name.padEnd(18)} ${o.sizeMeters.join(' x ')} m   1x ${o.size1x.join('x')}   2x ${o.size2x.join('x')}`,
  );
}
