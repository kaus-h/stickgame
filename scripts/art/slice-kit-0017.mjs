import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { format, resolveConfig } from 'prettier';

const out = 'assets/art/kit-0017';
const ppm1x = 64;
// Crop boxes are traced tightly around sheet artwork; 144 sheet px = 1m for the 1x terrain tiles.
const rows = [
  [
    [32, 43, 174, 175, 't01-solid-infill', 'block'],
    [259, 42, 187, 172, 't02-top-edge-a', 'ledge'],
    [499, 44, 185, 172, 't03-top-edge-b', 'ledge'],
    [739, 46, 184, 164, 't04-bottom-edge', 'rock-lip'],
    [987, 45, 107, 172, 't05-left-edge', 'wall'],
    [1279, 40, 110, 177, 't06-right-edge', 'wall'],
    [1449, 42, 184, 184, 't07-interior-seam', 'block'],
  ],
  [
    [32, 272, 178, 178, 't08-outer-tl', 'corner'],
    [264, 269, 183, 176, 't09-outer-tr', 'corner'],
    [497, 271, 177, 166, 't10-outer-bl', 'corner'],
    [741, 272, 174, 168, 't11-outer-br', 'corner'],
    [979, 273, 175, 170, 't12-inner-tl', 'overhang-corner'],
    [1219, 274, 171, 165, 't13-inner-tr', 'overhang-corner'],
    [1448, 274, 178, 177, 't14-inner-bl', 'corner'],
  ],
  [
    [34, 489, 180, 183, 't15-inner-br', 'corner'],
    [283, 485, 145, 188, 't16-vertical-wall-strip', 'wall'],
    [489, 538, 184, 74, 't17-wall-top-cap', 'ledge'],
    [736, 534, 170, 112, 't18-wall-bottom-cap', 'block'],
    [971, 486, 134, 187, 't19-left-wall-attachment', 'corner'],
    [1235, 486, 136, 187, 't20-right-wall-attachment', 'corner'],
    [1409, 533, 233, 71, 't21-ceiling-span', 'ledge'],
  ],
  [
    [32, 715, 184, 179, 't22-ceiling-left-join', 'corner'],
    [264, 717, 181, 177, 't23-ceiling-right-join', 'corner'],
    [496, 723, 178, 163, 't25-left-ledge-end', 'corner'],
    [749, 723, 175, 163, 't26-right-ledge-end', 'corner'],
    [985, 771, 359, 73, 't27-thin-solid-bridge', 'ledge'],
    [1423, 761, 183, 108, 't28-isolated-platform', 'overhang'],
  ],
];
const pools = [
  [34, 145, 283, 160, 't34-pool-surface-span', 'water-edge'],
  [357, 108, 220, 196, 't35-pool-left-wall-join', 'water-edge'],
  [634, 108, 221, 196, 't36-pool-right-wall-join', 'water-edge'],
  [895, 108, 201, 196, 't37-pool-inner-left-corner', 'water-edge'],
  [1156, 108, 194, 196, 't38-pool-inner-right-corner', 'water-edge'],
  [1398, 140, 237, 160, 't39-pool-depth-fill', 'water-edge'],
];
const backgrounds = [
  [25, 396, 1624, 132, 't40-background-distant-mesa', 'distant'],
  [25, 574, 1624, 131, 't41-background-arches', 'midground'],
  [25, 750, 1624, 139, 't42-background-rock-spires', 'foreground'],
];
const extras = {
  't01-solid-infill': {
    semanticRole: 'infill',
    renderRole: 'interior-texture',
    interiorCropRatio: 0.3,
  },
  't07-interior-seam': {
    semanticRole: 'interior-seam',
    renderRole: 'interior-texture',
    interiorCropRatio: 0.3,
  },
  't02-top-edge-a': {
    semanticRole: 'top-edge',
    renderRole: 'ledge',
    orientation: 'top',
    shapeRole: 'standard',
  },
  't03-top-edge-b': {
    semanticRole: 'top-edge',
    renderRole: 'ledge',
    orientation: 'top',
    shapeRole: 'standard',
  },
  't04-bottom-edge': {
    semanticRole: 'bottom-edge',
    renderRole: 'underside',
    orientation: 'bottom',
  },
  't05-left-edge': { renderRole: 'wall-strip', orientation: 'left' },
  't06-right-edge': { renderRole: 'wall-strip', orientation: 'right' },
  't08-outer-tl': {
    renderRole: 'convex-corner',
    cornerTopology: 'convex',
    cornerOrientation: 'top-left',
  },
  't09-outer-tr': {
    renderRole: 'convex-corner',
    cornerTopology: 'convex',
    cornerOrientation: 'top-right',
  },
  't10-outer-bl': {
    renderRole: 'convex-corner',
    cornerTopology: 'convex',
    cornerOrientation: 'bottom-left',
  },
  't11-outer-br': {
    renderRole: 'convex-corner',
    cornerTopology: 'convex',
    cornerOrientation: 'bottom-right',
  },
  't12-inner-tl': {
    renderRole: 'concave-corner',
    cornerTopology: 'concave',
    cornerOrientation: 'top-left',
  },
  't13-inner-tr': {
    renderRole: 'concave-corner',
    cornerTopology: 'concave',
    cornerOrientation: 'top-right',
  },
  't14-inner-bl': {
    renderRole: 'concave-corner',
    cornerTopology: 'concave',
    cornerOrientation: 'bottom-left',
  },
  't15-inner-br': {
    renderRole: 'concave-corner',
    cornerTopology: 'concave',
    cornerOrientation: 'bottom-right',
  },
  't16-vertical-wall-strip': {
    semanticRole: 'wall-strip',
    renderRole: 'wall-strip',
    orientation: 'vertical',
  },
  't17-wall-top-cap': {
    semanticRole: 'wall-top-cap',
    renderRole: 'ledge',
    orientation: 'top',
    shapeRole: 'short-island',
  },
  't18-wall-bottom-cap': {
    semanticRole: 'wall-bottom-cap',
    renderRole: 'underside',
    orientation: 'bottom',
  },
  't19-left-wall-attachment': {
    semanticRole: 'wall-bracket',
    renderRole: 'wall-bracket',
    orientation: 'left',
  },
  't20-right-wall-attachment': {
    semanticRole: 'wall-bracket',
    renderRole: 'wall-bracket',
    orientation: 'right',
  },
  't21-ceiling-span': {
    semanticRole: 'ceiling-span',
    renderRole: 'underside',
    orientation: 'bottom',
    shapeRole: 'layered',
  },
  't22-ceiling-left-join': {
    semanticRole: 'ceiling-join',
    renderRole: 'ceiling-join',
    orientation: 'left',
    cornerTopology: 'convex',
    cornerOrientation: 'bottom-left',
  },
  't23-ceiling-right-join': {
    semanticRole: 'ceiling-join',
    renderRole: 'ceiling-join',
    orientation: 'right',
    cornerTopology: 'convex',
    cornerOrientation: 'bottom-right',
  },
  't25-left-ledge-end': { semanticRole: 'ledge-end', renderRole: 'ledge-end', orientation: 'left' },
  't26-right-ledge-end': {
    semanticRole: 'ledge-end',
    renderRole: 'ledge-end',
    orientation: 'right',
  },
  't27-thin-solid-bridge': {
    semanticRole: 'bridge',
    renderRole: 'ledge',
    orientation: 'top',
    shapeRole: 'bridge',
  },
  't28-isolated-platform': {
    semanticRole: 'short-island',
    renderRole: 'ledge',
    orientation: 'top',
    shapeRole: 'short-island',
  },
  't34-pool-surface-span': { renderRole: 'water-edge', orientation: 'top' },
  't35-pool-left-wall-join': { renderRole: 'water-edge', orientation: 'left' },
  't36-pool-right-wall-join': { renderRole: 'water-edge', orientation: 'right' },
  't37-pool-inner-left-corner': { renderRole: 'water-edge', orientation: 'left' },
  't38-pool-inner-right-corner': { renderRole: 'water-edge', orientation: 'right' },
  't39-pool-depth-fill': { renderRole: 'water-edge', orientation: 'bottom' },
};
function convertPaper(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i],
      g = png.data[i + 1],
      b = png.data[i + 2];
    let a = 255 - Math.min(r, g, b);
    if (a < 8) {
      png.data[i + 3] = 0;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
      continue;
    }
    const matte = 255 - a;
    png.data[i] = Math.max(0, Math.min(255, Math.round(((r - matte) * 255) / a)));
    png.data[i + 1] = Math.max(0, Math.min(255, Math.round(((g - matte) * 255) / a)));
    png.data[i + 2] = Math.max(0, Math.min(255, Math.round(((b - matte) * 255) / a)));
    png.data[i + 3] = a;
  }
}
function crop(src, box) {
  const p = new PNG({ width: box.width, height: box.height });
  for (let y = 0; y < box.height; y++)
    for (let x = 0; x < box.width; x++) {
      const s = ((box.y + y) * src.width + box.x + x) * 4,
        d = (y * p.width + x) * 4;
      src.data.copy(p.data, d, s, s + 4);
    }
  return p;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePalette(png) {
  const colors = new Map(),
    palette = [],
    pixels = new Uint8Array(png.width * png.height);
  for (let p = 0, i = 0; p < pixels.length; p++, i += 4) {
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]},${png.data[i + 3]}`;
    let index = colors.get(key);
    if (index === undefined) {
      index = palette.length;
      if (index === 256) return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
      colors.set(key, index);
      palette.push([png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]);
    }
    pixels[p] = index;
  }
  const freq = new Uint32Array(palette.length);
  for (const index of pixels) freq[index]++;
  const order = palette.map((color, index) => index).sort((a, b) => freq[b] - freq[a] || a - b),
    remap = new Uint8Array(order.length),
    sorted = [];
  order.forEach((old, index) => {
    remap[old] = index;
    sorted.push(palette[old]);
  });
  for (let i = 0; i < pixels.length; i++) pixels[i] = remap[pixels[i]];
  palette.splice(0, palette.length, ...sorted);
  const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8,
    perByte = 8 / depth,
    rowBytes = Math.ceil(png.width / perByte),
    plte = Buffer.from(palette.flatMap((c) => c.slice(0, 3))),
    alpha = Buffer.from(palette.map((c) => c[3]));
  let alphaEnd = alpha.length;
  while (alphaEnd && alpha[alphaEnd - 1] === 255) alphaEnd--;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(png.width, 0);
  ihdr.writeUInt32BE(png.height, 4);
  ihdr[8] = depth;
  ihdr[9] = 3;
  const raw = Buffer.alloc(rowBytes * png.height);
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const shift = 8 - depth - (x % perByte) * depth;
      raw[y * rowBytes + Math.floor(x / perByte)] |= pixels[y * png.width + x] << shift;
    }
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const scans = Array.from({ length: 5 }, () => Buffer.alloc((rowBytes + 1) * png.height)),
    scan = scans[0],
    none = Buffer.alloc((rowBytes + 1) * png.height);
  for (let y = 0; y < png.height; y++) {
    const base = y * rowBytes,
      prev = (y - 1) * rowBytes,
      out = y * (rowBytes + 1) + 1;
    none[y * (rowBytes + 1)] = 0;
    raw.copy(none, y * (rowBytes + 1) + 1, base, base + rowBytes);
    let bestType = 0,
      bestCost = Infinity,
      best = null;
    for (let type = 0; type <= 4; type++) {
      const filtered = Buffer.alloc(rowBytes);
      let cost = 0;
      for (let x = 0; x < rowBytes; x++) {
        const v = raw[base + x],
          left = x ? raw[base + x - 1] : 0,
          up = y ? raw[prev + x] : 0,
          upperLeft = y && x ? raw[prev + x - 1] : 0;
        const predictor =
          type === 1
            ? left
            : type === 2
              ? up
              : type === 3
                ? Math.floor((left + up) / 2)
                : type === 4
                  ? paeth(left, up, upperLeft)
                  : 0;
        const value = (v - predictor) & 255;
        filtered[x] = value;
        cost += Math.min(value, 256 - value);
      }
      filtered.copy(scans[type], y * (rowBytes + 1) + 1);
      scans[type][y * (rowBytes + 1)] = type;
      if (cost < bestCost) {
        bestType = type;
        bestCost = cost;
        best = filtered;
      }
    }
    scan[y * (rowBytes + 1)] = bestType;
    best.copy(scan, out);
  }
  let data = null;
  for (const candidate of [...scans, none])
    for (const strategy of [
      zlib.constants.Z_DEFAULT_STRATEGY,
      zlib.constants.Z_FILTERED,
      zlib.constants.Z_RLE,
    ]) {
      const compressed = zlib.deflateSync(candidate, { level: 9, strategy });
      if (!data || compressed.length < data.length) data = compressed;
    }
  const parts = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
  ];
  if (alphaEnd) parts.push(chunk('tRNS', alpha.subarray(0, alphaEnd)));
  parts.push(chunk('IDAT', data), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
function resize(src, w, h, preserveRed = false) {
  const p = new PNG({ width: w, height: h });
  const sx = src.width / w,
    sy = src.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0,
        r = 0,
        g = 0,
        b = 0,
        n = 0;
      const x0 = Math.floor(x * sx),
        x1 = Math.ceil((x + 1) * sx),
        y0 = Math.floor(y * sy),
        y1 = Math.ceil((y + 1) * sy);
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4,
            aa = src.data[i + 3] / 255;
          r += src.data[i] * aa;
          g += src.data[i + 1] * aa;
          b += src.data[i + 2] * aa;
          a += aa;
          n++;
        }
      const d = (y * w + x) * 4;
      const q = (v) => (a ? Math.round(v / a / 127.5) * 127.5 : 0);
      p.data[d] = q(r);
      p.data[d + 1] = q(g);
      p.data[d + 2] = q(b);
      p.data[d + 3] = n ? Math.round((a / n) * 3) * 85 : 0;
    }
  return p;
}
const sheetA = PNG.sync.read(fs.readFileSync('assets/art/kit-0017/source/kit-0017-sheet-a.png'));
convertPaper(sheetA);
const sheetB = PNG.sync.read(fs.readFileSync('assets/art/kit-0017/source/kit-0017-sheet-b.png'));
convertPaper(sheetB);
fs.mkdirSync(`${out}/1x`, { recursive: true });
const objects = [];
function emit(sheet, source, rowSpecs, ppm) {
  for (const [x, y, width, height, name, role] of rowSpecs) {
    let box = { x, y, width, height };
    let src = crop(sheet, box);
    // Pool slices retain the red waterline. Other assets are monochrome stone ink.
    for (let i = 0; i < src.data.length; i += 4) {
      const r = src.data[i],
        g = src.data[i + 1],
        b = src.data[i + 2],
        isRed = name.startsWith('t3') && r > g * 1.1 && r > b * 1.05;
      if (isRed) continue;
      if (!name.startsWith('t3') && r > g * 1.35 && r > b * 1.35) {
        src.data[i] = src.data[i + 1] = src.data[i + 2] = 0;
        continue;
      }
      const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      src.data[i] = src.data[i + 1] = src.data[i + 2] = gray;
    }
    const sw = Math.max(1, Math.round((width * ppm1x) / ppm)),
      sh = Math.max(1, Math.round((height * ppm1x) / ppm));
    src = resize(src, sw, sh, name.startsWith('t3'));
    // Encode the same white-paper composite with black alpha; the art is monochrome ink, not gray RGB.
    // Pool join/corner stamps contain auxiliary stone banks; those banks belong to sheet-A terrain.
    for (let i = 0; i < src.data.length; i += 4) {
      const r = src.data[i],
        g = src.data[i + 1],
        b = src.data[i + 2],
        isRed = name.startsWith('t3') && r > g * 1.1 && r > b * 1.05;
      if (name.startsWith('t3') && name !== 't39-pool-depth-fill' && !isRed) {
        src.data[i + 3] = 0;
        src.data[i] = src.data[i + 1] = src.data[i + 2] = 0;
        continue;
      }
      if (isRed) {
        src.data[i] = 221;
        src.data[i + 1] = 38;
        src.data[i + 2] = 38;
        continue;
      }
      src.data[i + 3] = Math.round((src.data[i + 3] * (255 - r)) / 255 / 36) * 36;
      src.data[i] = src.data[i + 1] = src.data[i + 2] = 0;
    }
    const dest = `${out}/1x/${name}.png`;
    fs.writeFileSync(dest, encodePalette(src));
    const metadata = {
      role,
      material: name.startsWith('t3') ? 'waterline-and-stone-ink' : 'stone-ink',
      ...(name.startsWith('t3')
        ? {
            hazardDatum1x: {
              type: 'waterline',
              points: [
                [0, Math.round(sh * 0.28)],
                [sw, Math.round(sh * 0.28)],
              ],
            },
          }
        : {}),
      ...(extras[name] ?? {}),
    };
    const yTop = Math.max(1, Math.round(sh * 0.055)),
      yBottom = sh - 1,
      xLeft = 1,
      xRight = sw - 1;
    if (
      [
        't02-top-edge-a',
        't03-top-edge-b',
        't17-wall-top-cap',
        't27-thin-solid-bridge',
        't28-isolated-platform',
      ].includes(name)
    )
      metadata.contactDatum1x = {
        type: 'top-surface',
        points: [
          [xLeft, yTop],
          [xRight, yTop],
        ],
      };
    else if (name === 't04-bottom-edge' || name === 't18-wall-bottom-cap')
      metadata.contactDatum1x = {
        type: 'bottom-edge',
        points: [
          [xLeft, yBottom],
          [xRight, yBottom],
        ],
      };
    else if (name === 't05-left-edge' || name === 't06-right-edge')
      metadata.contactDatum1x = {
        type: 'vertical-edge',
        points:
          name === 't05-left-edge'
            ? [
                [xLeft, 0],
                [xLeft, sh - 1],
              ]
            : [
                [xRight, 0],
                [xRight, sh - 1],
              ],
      };
    else if (
      name.startsWith('t08-outer-') ||
      name.startsWith('t09-outer-') ||
      name.startsWith('t10-outer-') ||
      name.startsWith('t11-outer-') ||
      name.startsWith('t12-inner-') ||
      name.startsWith('t13-inner-') ||
      name.startsWith('t14-inner-') ||
      name.startsWith('t15-inner-') ||
      name.startsWith('t22-ceiling-') ||
      name.startsWith('t23-ceiling-')
    ) {
      const o = metadata.cornerOrientation ?? 'top-left',
        left = o.endsWith('left'),
        top = o.startsWith('top');
      metadata.contactDatum1x = {
        type: 'corner-contour',
        segments: [
          [
            [left ? xLeft : xRight, top ? yTop : yBottom],
            [left ? Math.round(sw * 0.58) : Math.round(sw * 0.42), top ? yTop : yBottom],
          ],
          [
            [left ? xLeft : xRight, top ? yTop : yBottom],
            [left ? xLeft : xRight, top ? Math.round(sh * 0.58) : Math.round(sh * 0.42)],
          ],
        ],
      };
    } else if (name === 't16-vertical-wall-strip')
      metadata.contactDatum1x = {
        type: 'wall-strip',
        points: [
          [Math.round(sw * 0.08), 0],
          [Math.round(sw * 0.08), sh - 1],
        ],
      };
    else if (name === 't19-left-wall-attachment' || name === 't20-right-wall-attachment')
      metadata.contactDatum1x = {
        type: 'wall-bracket',
        segments: [
          [
            [xLeft, yTop],
            [xRight, yTop],
          ],
          name.includes('left')
            ? [
                [xLeft, yTop],
                [xLeft, sh - 1],
              ]
            : [
                [xRight, yTop],
                [xRight, sh - 1],
              ],
        ],
      };
    else if (name === 't21-ceiling-span')
      metadata.contactDatum1x = {
        type: 'underside',
        points: [
          [xLeft, yBottom],
          [xRight, yBottom],
        ],
      };
    else if (name === 't25-left-ledge-end' || name === 't26-right-ledge-end')
      metadata.contactDatum1x = {
        type: 'ledge-end',
        points: [
          [xLeft, yTop],
          [xRight, yTop],
        ],
      };
    if (metadata.contactDatum1x)
      metadata.contactGuides1x = {
        coordinateSpace: 'asset-pixels',
        origin: 'top-left',
        approximate: true,
      };
    objects.push({
      name,
      source,
      sourceBox: box,
      sourcePxPerMeter: ppm,
      sizeMeters: [+(width / ppm).toFixed(3), +(height / ppm).toFixed(3)],
      size1x: [sw, sh],
      metadata,
    });
  }
}
for (const row of rows) emit(sheetA, 'kit-0017-sheet-a.png', row, 144);
emit(sheetB, 'kit-0017-sheet-b.png', pools, 144);
emit(sheetB, 'kit-0017-sheet-b.png', backgrounds, 101.5);
const data = {
  source: ['kit-0017-sheet-a.png', 'kit-0017-sheet-b.png'],
  pxPerMeter1x: ppm1x,
  objects,
  scaleVariants: ['1x'],
};
const formatOptions = await resolveConfig(`${out}/manifest.json`);
fs.writeFileSync(
  `${out}/manifest.json`,
  await format(JSON.stringify(data), { ...formatOptions, parser: 'json' }),
);
const runtime = {
  objects: objects
    .filter(({ name }) => /^t(0[1-9]|1[0-9]|2[0-3]|2[5-8])-/.test(name))
    .map(({ name, metadata }) => ({
      name,
      metadata: {
        ...Object.fromEntries(
          [
            'semanticRole',
            'renderRole',
            'orientation',
            'shapeRole',
            'interiorCropRatio',
            'cornerTopology',
            'cornerOrientation',
          ]
            .filter((key) => metadata[key] !== undefined)
            .map((key) => [
              { semanticRole: 'semantic', renderRole: 'role' }[key] ?? key,
              metadata[key],
            ]),
        ),
        ...(metadata.contactDatum1x
          ? {
              datum: Object.fromEntries(
                ['points', 'segments']
                  .filter((key) => metadata.contactDatum1x[key] !== undefined)
                  .map((key) => [key, metadata.contactDatum1x[key]]),
              ),
            }
          : {}),
      },
    })),
};
fs.writeFileSync(
  `${out}/runtime.json`,
  await format(JSON.stringify(runtime), { ...formatOptions, parser: 'json' }),
);
