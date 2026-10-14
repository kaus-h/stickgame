import {
  graphite,
  hatchBox,
  mist,
  mistBand,
  pine,
  ridge,
  root,
  sketchLine,
  sketchPath,
  smudge,
  type Rand,
} from './sketch';

/**
 * Chapter 1 vista painters (concept 0018-worlds/pencil.jpg, qualities only). Each paints one
 * parallax layer into a canvas `w` wide and `h` tall, in texture pixels, where `u` is the visible
 * view height. Content is laid out from the layer bottom, which is what the camera shows in play.
 * Light comes from the upper right, so shaded faces are on the left.
 */
export interface LayerCanvas {
  readonly c: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly u: number;
}

type Pt = { x: number; y: number };

const poly = (c: CanvasRenderingContext2D, pts: readonly Pt[]): void => {
  c.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.closePath();
};

const boxOf = (pts: readonly Pt[]): { x: number; y: number; w: number; h: number } => {
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** Clustered positions: groups of a few items with wide irregular gaps (never evenly spaced). */
function clustered(
  r: Rand,
  x0: number,
  x1: number,
  gap: number,
  spread: number,
  per: [number, number],
): number[] {
  const out: number[] = [];
  for (let x = x0 + r() * gap; x < x1; x += gap * (0.6 + r() * 1.1)) {
    const n = per[0] + Math.floor(r() * (per[1] - per[0] + 1));
    for (let i = 0; i < n; i++) out.push(x + (r() - 0.3) * spread);
  }
  return out;
}

// --- sky ------------------------------------------------------------------------------------------

/** Rubbed graphite clouds and a far mountain range, all very low contrast. */
export function paintSky({ c, w, h, u }: LayerCanvas, r: Rand): void {
  const top = h - u; // top of the view when the camera is at its lowest
  // A darker rubbed sky toward the top; lighter where the light enters (upper right).
  const sky = c.createLinearGradient(0, 0, 0, h - u * 0.35);
  sky.addColorStop(0, graphite(0.34));
  sky.addColorStop(Math.max(0, (top - 0) / (h - u * 0.35)) * 0.6 + 0.15, graphite(0.16));
  sky.addColorStop(1, graphite(0));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h - u * 0.35);
  // Billowing cloud banks: soft dark undersides, lifted light tops, swirled pencil contours.
  const banks = Math.ceil(w / (u * 0.35));
  for (let i = 0; i < banks; i++) {
    const cx = r() * w;
    const cy = top + u * (0.02 + r() * 0.3);
    const size = u * (0.08 + r() * 0.16);
    for (let k = 0; k < 6; k++) {
      const bx = cx + (r() - 0.5) * size * 2.6;
      const by = cy + (r() - 0.5) * size * 0.7;
      const br = size * (0.45 + r() * 0.6);
      smudge(c, bx, by + br * 0.35, br * 1.3, br * 0.7, graphite, 0.1 + r() * 0.08);
      smudge(c, bx + br * 0.2, by - br * 0.25, br, br * 0.65, mist, 0.16 + r() * 0.12);
      // A loose swirled pencil contour on some billows (never a regular stamp).
      if (r() < 0.45) {
        c.strokeStyle = graphite(0.06 + r() * 0.07);
        c.lineWidth = 0.6 + r() * 0.5;
        c.beginPath();
        const ox = (r() - 0.5) * br * 0.5,
          oy = (r() - 0.5) * br * 0.3;
        const a0 = Math.PI * (0.9 + r() * 0.4);
        c.ellipse(
          bx + ox,
          by + oy,
          br * (0.5 + r() * 0.4),
          br * (0.3 + r() * 0.3),
          (r() - 0.5) * 0.6,
          a0,
          a0 + Math.PI * (0.35 + r() * 0.5),
        );
        c.stroke();
      }
    }
  }
  // Far mountains: one jagged range, half-erased into mist.
  const base = h - u * 0.33;
  const pts: Pt[] = [{ x: 0, y: h }];
  let y = base - u * 0.1;
  for (let x = 0; x <= w; x += u * (0.03 + r() * 0.05)) {
    const peak = r() < 0.18;
    y = Math.min(base, Math.max(base - u * 0.32, y + (r() - 0.5) * u * (peak ? 0.2 : 0.07)));
    pts.push({ x, y });
  }
  pts.push({ x: w, y: h });
  c.save();
  poly(c, pts);
  c.fillStyle = graphite(0.1);
  c.fill();
  c.clip();
  hatchBox(c, { x: 0, y: base - u * 0.35, w, h: u * 0.4 }, 1.2, 5, 0.09, r, 0.7);
  c.restore();
  sketchPath(c, pts.slice(1, -1), r, 0.16, 0.8, 1);
  mistBand(c, 0, w, base - u * 0.16, h, 0.75);
}

// --- far: the colossal landmark ------------------------------------------------------------------

/** One sketched tower: body, roof (spire, crenels or broken), arched slits and left-side shade. */
function tower(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  tw: number,
  th: number,
  roof: 'spire' | 'crenel' | 'broken',
  r: Rand,
  a: number,
): void {
  const left = x - tw / 2,
    right = x + tw / 2,
    top = baseY - th;
  const body: Pt[] = [
    { x: left, y: baseY },
    { x: left + tw * 0.03, y: top },
  ];
  if (roof === 'crenel') {
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x0 = left + (tw * i) / n,
        x1 = left + (tw * (i + 0.5)) / n;
      body.push({ x: x0, y: top - tw * 0.12 }, { x: x1, y: top - tw * 0.12 }, { x: x1, y: top });
    }
  } else if (roof === 'broken') {
    for (let i = 1; i < 6; i++)
      body.push({ x: left + (tw * i) / 6, y: top + (r() - 0.3) * tw * 0.5 });
  }
  body.push({ x: right - tw * 0.03, y: top }, { x: right, y: baseY });
  c.save();
  poly(c, body);
  c.fillStyle = mist(0.22);
  c.fill();
  c.fillStyle = graphite(a * 0.18);
  c.fill();
  c.clip();
  // Shade the left face (light from the upper right).
  hatchBox(c, { x: left, y: top - tw, w: tw * 0.45, h: th + tw }, 1.25, 3.2, a * 0.5, r, 0.7);
  hatchBox(c, { x: left, y: top - tw, w: tw, h: th + tw }, 1.9, 9, a * 0.22, r, 0.6);
  c.restore();
  sketchPath(c, body, r, a * 0.75, 0.9, 2, 1.2);
  // Construction overshoot: the hand hasn't finished.
  sketchLine(c, left, baseY, left + tw * 0.03, top, r, a * 0.3, 0.6, tw * 0.5);
  sketchLine(c, right, baseY, right - tw * 0.03, top, r, a * 0.3, 0.6, tw * 0.4);
  if (roof === 'spire') {
    const sh = tw * (1.4 + r() * 1.2);
    const spire: Pt[] = [
      { x: left - tw * 0.06, y: top },
      { x: x + (r() - 0.5) * tw * 0.1, y: top - sh },
      { x: right + tw * 0.06, y: top },
    ];
    c.save();
    poly(c, spire);
    c.fillStyle = graphite(a * 0.22);
    c.fill();
    c.clip();
    hatchBox(c, { x: left - tw * 0.1, y: top - sh, w: tw * 0.6, h: sh }, 1.35, 2.6, a * 0.5, r);
    c.restore();
    sketchPath(c, spire, r, a * 0.8, 0.9, 2, 1);
    sketchLine(c, x, top - sh, x, top - sh - tw * 0.35, r, a * 0.6, 0.7);
  }
  // Arched slit windows in a loose column.
  const rows = Math.floor(th / (tw * 0.9));
  for (let i = 0; i < rows; i++) {
    if (r() < 0.35) continue;
    const wy = top + tw * 0.5 + i * tw * 0.9;
    const ww = tw * 0.14;
    const wx = x + (r() - 0.5) * tw * 0.3;
    c.fillStyle = graphite(a * 0.75);
    c.beginPath();
    c.moveTo(wx - ww, wy + ww * 3);
    c.lineTo(wx - ww, wy);
    c.arc(wx, wy, ww, Math.PI, 0);
    c.lineTo(wx + ww, wy + ww * 3);
    c.closePath();
    c.fill();
  }
}

/** A run of arches (aqueduct or bridge) from x0 to x1 with its deck at deckY. */
function arcade(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  deckY: number,
  depth: number,
  r: Rand,
  a: number,
  bays: number,
): void {
  const span = (x1 - x0) / bays;
  const pier = span * 0.2;
  const deck = Math.max(3, depth * 0.1);
  c.save();
  c.beginPath();
  c.rect(x0, deckY, x1 - x0, depth);
  for (let i = 0; i < bays; i++) {
    const ax = x0 + i * span + pier / 2,
      bx = ax + span - pier;
    const rad = (bx - ax) / 2;
    const spring = deckY + deck + rad;
    c.moveTo(ax, deckY + depth);
    c.lineTo(ax, spring);
    c.arc(ax + rad, spring, rad, Math.PI, 0);
    c.lineTo(bx, deckY + depth);
    c.closePath();
  }
  c.fillStyle = graphite(a * 0.22);
  c.fill('evenodd');
  c.clip('evenodd');
  hatchBox(c, { x: x0, y: deckY, w: x1 - x0, h: depth }, 1.3, 3.4, a * 0.45, r, 0.7);
  c.restore();
  sketchLine(c, x0, deckY, x1, deckY, r, a * 0.8, 1, span * 0.3);
  sketchLine(c, x0, deckY + deck, x1, deckY + deck, r, a * 0.5, 0.7);
  for (let i = 0; i < bays; i++) {
    const ax = x0 + i * span + pier / 2,
      bx = ax + span - pier;
    const rad = (bx - ax) / 2;
    const spring = deckY + deck + rad;
    c.strokeStyle = graphite(a * 0.7);
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(ax, deckY + depth);
    c.lineTo(ax, spring);
    c.arc(ax + rad, spring, rad, Math.PI, 0);
    c.lineTo(bx, deckY + depth);
    c.stroke();
  }
}

/** A craggy rock mass rising from the bottom of the layer, top at about `topY`. */
function crag(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  topY: number,
  bottom: number,
  r: Rand,
  a: number,
  fill: number,
  peak = 0,
): Pt[] {
  const width = x1 - x0;
  const pts: Pt[] = [{ x: x0 - width * 0.05, y: bottom }];
  // Tapering, stepped faces (ledges and overhangs), and a broken, sloping top.
  const taperL = 0.08 + r() * 0.22,
    taperR = 0.08 + r() * 0.22;
  const ls = 6 + Math.floor(r() * 4);
  const face = (t: number, side: number, taper: number): number =>
    taper * width * t ** 1.4 * side +
    (r() - 0.5) * width * 0.09 +
    (r() < 0.2 ? side * width * 0.06 * r() : 0);
  for (let i = 0; i <= ls; i++) {
    const t = i / ls;
    pts.push({ x: x0 + face(t, 1, taperL), y: bottom + (topY - bottom) * t });
  }
  const tilt = (r() - 0.5) * width * 0.25;
  // Background crags are peaked or sloped, never flat tops a player could mistake for a ledge.
  const crest = 0.25 + r() * 0.5;
  const top = ridge(x0 + width * taperL, x1 - width * taperR, topY, width * 0.09, 9, r).map(
    (p, i, all) => {
      const t = i / (all.length - 1);
      const hump = Math.max(0, 1 - Math.abs(t - crest) / Math.max(crest, 1 - crest)) ** 1.3;
      return { x: p.x, y: p.y + tilt * (t - 0.5) - peak * width * hump + peak * width * 0.5 };
    },
  );
  pts.push(...top.slice(1, -1));
  for (let i = 0; i <= ls; i++) {
    const t = 1 - i / ls;
    pts.push({ x: x1 + face(t, -1, taperR), y: bottom + (topY - bottom) * t });
  }
  pts.push({ x: x1 + width * 0.05, y: bottom });
  c.save();
  poly(c, pts);
  c.fillStyle = mist(0.2);
  c.fill();
  c.fillStyle = graphite(fill);
  c.fill();
  c.clip();
  const b = boxOf(pts);
  hatchBox(c, b, 1.2, 4.2, a * 0.42, r, 0.8);
  hatchBox(c, { x: b.x, y: b.y, w: b.w * 0.4, h: b.h }, 1.75, 3, a * 0.4, r, 0.7);
  // Vertical crags.
  for (let i = 0; i < width / 9; i++) {
    const cx = b.x + r() * b.w;
    const cy = topY + r() * (bottom - topY) * 0.6;
    sketchLine(c, cx, cy, cx + (r() - 0.5) * 6, cy + 10 + r() * 40, r, a * 0.45, 0.8);
  }
  c.restore();
  sketchPath(c, pts.slice(1, -1), r, a * 0.85, 1, 2, 1.4);
  return top;
}

/** The colossal landmark: a ruined citadel of towers and spires on a crag, with an aqueduct. */
export function paintFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u } = lc;
  const a = 0.5;
  const horizon = h - u * 0.3;
  // One landmark per ~1.7 view widths of layer, never evenly spaced.
  const count = Math.max(1, Math.round(w / (u * 3)));
  for (let k = 0; k < count; k++) {
    const cx = ((k + 0.35 + r() * 0.3) / count) * w;
    const scale = u * (1.15 + r() * 0.25);
    const rockTop = horizon - scale * 0.2;
    const top = crag(c, cx - scale * 0.42, cx + scale * 0.36, rockTop, h, r, a * 0.8, 0.12);
    const surface = (x: number): number => {
      let best = rockTop;
      let bd = Infinity;
      for (const p of top) {
        const d = Math.abs(p.x - x);
        if (d < bd) {
          bd = d;
          best = p.y;
        }
      }
      return best + 2;
    };
    // Towers, tallest near the middle, ruined at the edges.
    const towers = 10 + Math.floor(r() * 5);
    for (let i = 0; i < towers; i++) {
      const t = (i + r() * 0.6) / towers;
      const x = cx - scale * 0.32 + t * scale * 0.6;
      const centre = 1 - Math.abs(t - 0.5) * 1.6;
      const th = scale * (0.1 + centre * 0.42 + r() * 0.12);
      const tw = scale * (0.035 + r() * 0.045);
      const roof =
        centre > 0.5 ? (r() < 0.75 ? 'spire' : 'crenel') : r() < 0.6 ? 'broken' : 'spire';
      tower(c, x, surface(x), tw, th, roof, r, a);
    }
    // A great ruined arch between the main towers.
    const archX = cx - scale * 0.05;
    const archY = surface(archX) - scale * 0.3;
    arcade(c, archX - scale * 0.07, archX + scale * 0.09, archY, scale * 0.3, r, a, 1);
    // An aqueduct striding off to the right, falling into mist.
    const deck = horizon - scale * 0.26;
    arcade(
      c,
      cx + scale * 0.3,
      cx + scale * 1.2,
      deck,
      h - deck,
      r,
      a * 0.85,
      6 + Math.floor(r() * 3),
    );
    // Waterfall: a pale vertical streak off the crag face.
    const fx = cx + scale * 0.12;
    const fy = surface(fx) + 4;
    const fall = c.createLinearGradient(0, fy, 0, h);
    fall.addColorStop(0, mist(0.55));
    fall.addColorStop(1, mist(0));
    c.fillStyle = fall;
    c.fillRect(fx - 4, fy, 8, h - fy);
  }
  // The landmark dissolves into mist below the horizon.
  mistBand(c, 0, w, horizon - u * 0.22, h, 0.92);
}

// --- mid far: pinnacles, pines, a small bridge ------------------------------------------------------

export function paintMidFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u } = lc;
  const a = 0.5;
  const xs = clustered(r, 0, w, u * 0.6, u * 0.28, [1, 3]).sort((p, q) => p - q);
  let prev: { x: number; top: number } | null = null;
  for (const x of xs) {
    const pw = u * (0.07 + r() * 0.12);
    const top = h - u * (0.42 + r() * 0.3);
    const crest = crag(c, x - pw / 2, x + pw / 2, top, h, r, a, 0.17, 0.4 + r() * 0.5);
    const at = (px: number): number =>
      crest.reduce((best, p) => (Math.abs(p.x - px) < Math.abs(best.x - px) ? p : best)).y + 3;
    const kind = r();
    if (kind < 0.3) {
      const tx = x + (r() - 0.5) * pw * 0.3;
      tower(c, tx, at(tx), pw * 0.25, u * 0.08, 'spire', r, a);
    } else if (kind < 0.8) {
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const px = x - pw * 0.4 + r() * pw * 0.8;
        pine(c, px, at(px), u * (0.04 + r() * 0.05), r, a * 0.9, true);
      }
    }
    if (prev && x - prev.x < u * 0.55 && x - prev.x > u * 0.15 && r() < 0.6) {
      const deck = Math.max(prev.top, top) + u * 0.06;
      arcade(c, prev.x, x, deck, u * 0.08, r, a * 0.9, 2 + Math.floor(r() * 2));
    }
    prev = { x, top };
  }
  veil(c, w, h, 0.3);
  mistBand(c, 0, w, h - u * 0.42, h, 0.85);
}

/** Atmospheric perspective: mist laid over the layer's own marks only. */
function veil(c: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = mist(alpha);
  c.fillRect(0, 0, w, h);
  c.restore();
}

// --- mid: cliff masses with hanging roots and sketched trees ---------------------------------------

export function paintMid(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u } = lc;
  const a = 0.72;
  const xs = clustered(r, -u * 0.2, w, u * 0.85, u * 0.3, [1, 2]).sort((p, q) => p - q);
  for (const x of xs) {
    const cw = u * (0.18 + r() * 0.3);
    const top = h - u * (0.36 + r() * 0.3);
    const surface = crag(c, x - cw / 2, x + cw / 2, top, h + 4, r, a, 0.3, 0.25 + r() * 0.4);
    // Overhanging lip: roots and vines spill down the face from the top edge.
    for (const p of surface) {
      if (r() < 0.45) continue;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++)
        root(c, p.x + (r() - 0.5) * 8, p.y + 3, u * (0.03 + r() * 0.1), r, a * 0.7, 1.1);
    }
    // Trees on top: pines, now and then a bare dead tree.
    const trees = Math.floor(r() * 4);
    for (let i = 0; i < trees; i++) {
      const p = surface[1 + Math.floor(r() * (surface.length - 2))];
      if (!p) continue;
      if (r() < 0.75) pine(c, p.x, p.y + 2, u * (0.06 + r() * 0.08), r, a, true);
      else deadTree(c, p.x, p.y + 2, u * (0.06 + r() * 0.06), r, a);
    }
  }
  veil(c, w, h, 0.16);
  mistBand(c, 0, w, h - u * 0.16, h, 0.6);
}

function deadTree(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  r: Rand,
  a: number,
): void {
  const branch = (x0: number, y0: number, ang: number, len: number, depth: number): void => {
    const x1 = x0 + Math.cos(ang) * len,
      y1 = y0 + Math.sin(ang) * len;
    c.strokeStyle = graphite(a);
    c.lineWidth = Math.max(0.5, depth * 0.8);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    if (depth <= 0.6) return;
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++)
      branch(x1, y1, ang + (r() - 0.5) * 1.3, len * (0.5 + r() * 0.2), depth * 0.6);
  };
  branch(x, baseY, -Math.PI / 2 + (r() - 0.5) * 0.3, height * 0.5, 2.2);
}

// --- light shafts (screen space) ------------------------------------------------------------------

/**
 * Soft diagonal light from beyond the upper right edge. Painted white on transparent, layered
 * thin so the edges feather without a blur filter; composited with a screen blend.
 */
export function paintShafts(c: CanvasRenderingContext2D, w: number, h: number, r: Rand): void {
  const sx = w * 0.82,
    sy = -h * 0.25;
  const beams = 6;
  for (let i = 0; i < beams; i++) {
    const ang = Math.PI * (0.6 + i * 0.045 + r() * 0.03);
    const width = 0.02 + r() * 0.05;
    const len = h * (1.1 + r() * 0.4);
    const strength = 0.1 + r() * 0.16;
    for (let k = 0; k < 6; k++) {
      const spread = width * (1 - k * 0.15);
      const g = c.createLinearGradient(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.25, `rgba(255,255,255,${(strength / 3).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(255,255,255,${(strength / 5).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(ang - spread) * len, sy + Math.sin(ang - spread) * len);
      c.lineTo(sx + Math.cos(ang + spread) * len, sy + Math.sin(ang + spread) * len);
      c.closePath();
      c.fill();
    }
  }
  // A broad glow where the light enters.
  const glow = c.createRadialGradient(w * 0.8, 0, 0, w * 0.8, 0, h * 0.8);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
}

// --- near foreground (screen space, parallax > 1) ----------------------------------------------------

/**
 * Dark graphite silhouettes along the bottom edge: rock mounds, grass and the odd bare branch, in
 * clusters with wide gaps. Kept low (the playable band is above it); `h` is the strip height.
 */
export function paintForeground(c: CanvasRenderingContext2D, w: number, h: number, r: Rand): void {
  const dark = 'rgba(18,19,23,0.94)';
  const centres = clustered(r, 0, w, w / 5, w / 14, [1, 2]);
  for (const cx of centres) {
    // Keep the clump inside the tile so the wrap seam is clean.
    const width = h * (0.9 + r() * 2.2);
    const x0 = Math.max(4, cx - width / 2),
      x1 = Math.min(w - 4, cx + width / 2);
    if (x1 - x0 < h * 0.4) continue;
    const peak = h * (0.1 + r() * 0.2);
    const pts: Pt[] = [{ x: x0, y: h + 2 }];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bump = Math.sin(t * Math.PI) ** 0.7;
      pts.push({ x: x0 + (x1 - x0) * t, y: h - peak * bump * (0.75 + r() * 0.35) });
    }
    pts.push({ x: x1, y: h + 2 });
    c.save();
    poly(c, pts);
    c.fillStyle = dark;
    c.fill();
    c.clip();
    // Faint lifted strokes so the mass reads as drawn, not as a hole.
    c.strokeStyle = 'rgba(120,124,132,0.16)';
    c.lineWidth = 0.8;
    for (let k = 0; k < (x1 - x0) / 5; k++) {
      const hx = x0 + r() * (x1 - x0),
        hy = h - peak * r();
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx - 8, hy + 12);
      c.stroke();
    }
    c.restore();
    // Grass and weeds along the top of the mound.
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      if (!p || r() < 0.35) continue;
      const blades = 3 + Math.floor(r() * 5);
      c.strokeStyle = dark;
      c.lineCap = 'round';
      for (let b = 0; b < blades; b++) {
        const bx = p.x + (r() - 0.5) * 10;
        const bh = h * (0.08 + r() * 0.2);
        const lean = (r() - 0.5) * bh;
        c.lineWidth = 0.8 + r() * 1.1;
        c.beginPath();
        c.moveTo(bx, p.y + 3);
        c.quadraticCurveTo(bx + lean * 0.3, p.y - bh * 0.6, bx + lean, p.y - bh);
        c.stroke();
      }
    }
    // Now and then a bare branch reaching up and out.
    if (r() < 0.4) {
      const bx = x0 + (x1 - x0) * (0.2 + r() * 0.6);
      const by = h - peak * 0.8;
      const reach = (ang: number, len: number, wdt: number, x: number, y: number): void => {
        const ex = x + Math.cos(ang) * len,
          ey = y + Math.sin(ang) * len;
        c.strokeStyle = dark;
        c.lineWidth = wdt;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(ex, ey);
        c.stroke();
        if (wdt > 1.2) {
          reach(ang + (r() - 0.5) * 1.2, len * 0.6, wdt * 0.6, ex, ey);
          reach(ang + (r() - 0.5) * 1.2, len * 0.55, wdt * 0.55, ex, ey);
        }
      };
      reach(-Math.PI / 2 + (r() - 0.5) * 0.9, h * (0.18 + r() * 0.16), 3, bx, by);
    }
  }
}
