import {
  fadeBelow,
  graphite,
  hatchBox,
  haze,
  mistBank,
  pine,
  ridge,
  root,
  rubbed,
  sketchLine,
  sketchPath,
  tone,
  type Rand,
} from './sketch';

/**
 * Chapter 1 vista painters (concept 0018-worlds/pencil.jpg, qualities only). Each paints one
 * backdrop layer into a canvas `w` wide and `h` tall, in texture pixels, where `u` is the visible
 * view height. Content is laid out from the layer bottom, which hangs just below the view bottom;
 * the canvas runs on above the view top (`vt`), so anything taller simply continues off screen.
 *
 * Value plan (atmospheric perspective): far is palest and lowest contrast, mid-far a step darker,
 * mid the darkest of the backdrop but well lighter than the gameplay terrain. Every layer dissolves
 * downward into luminous mist (lighter than the paper), so the band behind the play area is the
 * brightest part of the backdrop and the dark terrain and black anchors read against it. Masses
 * cover what stands behind them rather than stacking translucent marks. Light comes from the upper
 * right, so shaded faces are on the left; there is no visible light source.
 */
export interface LayerCanvas {
  readonly c: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly u: number;
  /** Visible view width, texture pixels. */
  readonly vw: number;
  /** Canvas row of the view's top edge (rows above it are headroom), texture pixels. */
  readonly vt: number;
}

type Pt = { x: number; y: number };

/** How one depth is drawn: mass tone (green level, cover), line and hatch strength. */
interface Depth {
  readonly fill: number;
  readonly cover: number;
  readonly line: number;
  readonly hatch: number;
  readonly width: number;
}

const FAR: Depth = { fill: 182, cover: 0.76, line: 0.4, hatch: 0.16, width: 0.85 };
const MIDFAR: Depth = { fill: 160, cover: 0.88, line: 0.48, hatch: 0.25, width: 0.9 };
const MID: Depth = { fill: 142, cover: 0.9, line: 0.6, hatch: 0.34, width: 1 };

/** The same depth, faded toward the paper (for parts that decay into mist). */
const faded = (d: Depth, k: number): Depth => ({
  ...d,
  cover: d.cover * k,
  line: d.line * k,
  hatch: d.hatch * k,
});

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

/** Shade the left (unlit) part of a box in graded hatch passes, so the shadow has no seam. */
function shadeLeft(
  c: CanvasRenderingContext2D,
  b: { x: number; y: number; w: number; h: number },
  alpha: number,
  r: Rand,
  reach = 0.5,
): void {
  hatchBox(c, { x: b.x - 2, y: b.y, w: b.w * reach * 0.45, h: b.h }, 1.2, 2.4, alpha, r, 0.7);
  hatchBox(c, { x: b.x - 2, y: b.y, w: b.w * reach, h: b.h }, 1.75, 3.2, alpha * 0.8, r, 0.65);
  hatchBox(c, { x: b.x - 2, y: b.y, w: b.w * reach * 1.4, h: b.h }, 1.3, 5, alpha * 0.45, r, 0.6);
}

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

/** The nearest outline point's height at x, plus a little so things sit into the rock. */
const surfaceOf =
  (top: readonly Pt[], sink: number) =>
  (x: number): number =>
    top.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best)).y + sink;

// --- sky ------------------------------------------------------------------------------------------

/**
 * Rubbed graphite sky, darkest along the top and clearing toward the middle, with soft cloud
 * strata, eraser-lifted gaps and a far, faint range dissolving into mist.
 */
export function paintSky({ c, w, h, u, vt }: LayerCanvas, r: Rand): void {
  const sy = (s: number): number => vt + s * u;
  const end = sy(0.62);
  const at = (s: number): number => Math.min(1, Math.max(0, sy(s) / end));
  const sky = c.createLinearGradient(0, 0, 0, end);
  sky.addColorStop(0, graphite(0.19));
  sky.addColorStop(at(0), graphite(0.15));
  sky.addColorStop(at(0.14), graphite(0.085));
  sky.addColorStop(at(0.32), graphite(0.03));
  sky.addColorStop(1, graphite(0));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, end);
  // A rubbed ceiling: broad soft strokes along the top, so the darkest tone has an irregular,
  // drifting lower edge instead of a ruled gradient.
  for (let x = -u * 0.3; x < w; x += u * (0.25 + r() * 0.3)) {
    const len = u * (0.5 + r() * 0.6);
    rubbed(
      c,
      x,
      sy(-0.07 + r() * 0.08),
      len,
      u * (0.05 + r() * 0.04),
      (r() - 0.5) * 0.06,
      (r() - 0.5) * 0.4,
      r,
      graphite,
      0.025 + r() * 0.02,
    );
  }
  // Cloud formations: a few large soft masses, irregularly spaced, each built from many
  // overlapping rubbed strokes with a heavier belly and an eraser-lifted upper edge.
  for (let cx = r() * u * 0.6; cx < w + u * 0.4; cx += u * (0.6 + r() * 0.9)) {
    const high = r();
    const cy = sy(0.01 + high ** 1.5 * 0.27);
    const size = u * (0.07 + r() * 0.07);
    const spread = size * (3 + r() * 3);
    const strength = 0.024 + (1 - high) * 0.022;
    const strokes = 7 + Math.floor(r() * 6);
    for (let k = 0; k < strokes; k++) {
      const t = r();
      const x0 = cx + (t - 0.5) * spread - size;
      // Thicker in the middle of the formation, thinning toward its ends.
      const body = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.7;
      const y0 = cy + (r() - 0.3) * size * 0.5 * (0.5 + body);
      const len = size * (1.6 + r() * 2.4);
      const thick = size * (0.3 + body * 0.45) * (0.7 + r() * 0.5);
      rubbed(
        c,
        x0,
        y0,
        len,
        thick,
        (r() - 0.5) * 0.08,
        (r() - 0.5) * 0.5,
        r,
        graphite,
        strength * (0.6 + r() * 0.7),
      );
    }
    // The belly: one longer, heavier stroke along the underside.
    rubbed(
      c,
      cx - spread * 0.4,
      cy + size * 0.3,
      spread * 0.8,
      size * 0.35,
      (r() - 0.5) * 0.04,
      0.2,
      r,
      graphite,
      strength * 0.9,
    );
    // The eraser lifts its top back toward the paper.
    for (let k = 0; k < 2; k++)
      rubbed(
        c,
        cx - spread * (0.45 - r() * 0.3),
        cy - size * (0.35 + r() * 0.25),
        spread * (0.35 + r() * 0.35),
        size * 0.32,
        (r() - 0.5) * 0.06,
        0.2,
        r,
        haze,
        0.18,
      );
  }
  // Lifted gaps: a few broad eraser passes through the lower sky.
  const gaps = Math.ceil(w / (u * 1.1));
  for (let i = 0; i < gaps; i++) {
    const len = u * (0.25 + r() * 0.5);
    const thick = u * (0.02 + r() * 0.03);
    rubbed(
      c,
      r() * w - len / 2,
      sy(0.14 + r() * 0.26),
      len,
      thick,
      (r() - 0.5) * 0.04,
      0,
      r,
      haze,
      0.2 + r() * 0.15,
    );
  }
  // Far range: one low, faint jagged line of mountains, half erased into mist.
  const pts: Pt[] = [{ x: -4, y: h }];
  let y = sy(0.52);
  for (let x = -4; x <= w + 4; x += u * (0.025 + r() * 0.05)) {
    const peak = r() < 0.15;
    y = Math.min(sy(0.6), Math.max(sy(0.43), y + (r() - 0.5) * u * (peak ? 0.12 : 0.045)));
    pts.push({ x, y });
  }
  pts.push({ x: w + 4, y: h });
  c.save();
  poly(c, pts);
  c.fillStyle = tone(193, 0.5);
  c.fill();
  c.clip();
  hatchBox(c, { x: 0, y: sy(0.4), w, h: u * 0.25 }, 1.2, 4.5, 0.05, r, 0.6);
  c.restore();
  // The outline survives only in places, as if most of it was rubbed out.
  for (let i = 1; i < pts.length - 2; i++) {
    const a = pts[i],
      b = pts[i + 1];
    if (!a || !b || r() < 0.4) continue;
    sketchLine(c, a.x, a.y, b.x, b.y, r, 0.1 + r() * 0.06, 0.7);
  }
  fadeBelow(c, r, w, sy(0.56), sy(0.7), u * 0.03);
  mistBank(c, r, w, sy(0.52), sy(0.72), h, 0.22, u * 0.03, 0.4);
}

// --- shared forms ---------------------------------------------------------------------------------

/** A craggy rock mass rising from `bottom`, top at about `topY`. Returns its top outline. */
function crag(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  topY: number,
  bottom: number,
  r: Rand,
  d: Depth,
  peak = 0,
): Pt[] {
  const width = x1 - x0;
  const left: Pt[] = [{ x: x0 - width * 0.05, y: bottom }];
  // Tapering, stepped faces (ledges and overhangs), and a broken, sloping top.
  const taperL = 0.08 + r() * 0.22,
    taperR = 0.08 + r() * 0.22;
  const ls = 6 + Math.floor(r() * 4);
  const face = (t: number, side: number, taper: number): number =>
    taper * width * t ** 1.4 * side +
    (r() - 0.5) * width * 0.08 +
    (r() < 0.2 ? side * width * 0.06 * r() : 0);
  const tilt = (r() - 0.5) * width * 0.25;
  // Background crags are peaked or sloped, never flat tops a player could mistake for a ledge.
  const crest = 0.25 + r() * 0.5;
  const top = ridge(x0 + width * taperL, x1 - width * taperR, topY, width * 0.08, 9, r).map(
    (p, i, all) => {
      const t = i / (all.length - 1);
      const hump = Math.max(0, 1 - Math.abs(t - crest) / Math.max(crest, 1 - crest)) ** 1.3;
      return { x: p.x, y: p.y + tilt * (t - 0.5) - peak * width * hump + peak * width * 0.5 };
    },
  );
  // The faces climb to the crown's own ends, so a peaked top never leaves horns at the shoulders.
  const endL = top[0] ?? { x: x0, y: topY },
    endR = top[top.length - 1] ?? { x: x1, y: topY };
  for (let i = 0; i < ls; i++) {
    const t = i / ls;
    left.push({ x: x0 + face(t, 1, taperL), y: bottom + (endL.y - bottom) * t });
  }
  left.push(endL);
  const right: Pt[] = [endR];
  for (let i = 1; i <= ls; i++) {
    const t = 1 - i / ls;
    right.push({ x: x1 + face(t, -1, taperR), y: bottom + (endR.y - bottom) * t });
  }
  right.push({ x: x1 + width * 0.05, y: bottom });
  const crown = top.slice(1, -1);
  const pts = [...left, ...crown, ...right];
  c.save();
  poly(c, pts);
  c.fillStyle = tone(d.fill, d.cover);
  c.fill();
  c.clip();
  const b = boxOf(pts);
  // Grain all over, then the unlit left faces.
  hatchBox(c, b, 1.15, 5.5, d.hatch * 0.45, r, 0.6);
  shadeLeft(c, b, d.hatch, r);
  // A few vertical fissures, mostly on the shaded side.
  for (let i = 0; i < width / 14; i++) {
    const fx = b.x + b.w * r() ** 1.6;
    const fy = topY + r() * (bottom - topY) * 0.5;
    sketchLine(c, fx, fy, fx + (r() - 0.5) * 5, fy + 8 + r() * 30, r, d.line * 0.5, 0.7);
  }
  c.restore();
  // Line weight: heavier down the shaded left face, lighter on the lit right.
  const lastLeft = left[left.length - 1];
  const firstRight = right[0];
  sketchPath(c, left.slice(1), r, d.line, d.width * 1.15, 1);
  sketchPath(
    c,
    [...(lastLeft ? [lastLeft] : []), ...crown, ...(firstRight ? [firstRight] : [])],
    r,
    d.line * 0.9,
    d.width,
    2,
    0.8,
  );
  sketchPath(c, right.slice(0, -1), r, d.line * 0.6, d.width * 0.7, 1);
  return top;
}

/** Faint construction lines: the hand's guides, left visible around the ruins. */
function guides(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hgt: number,
  r: Rand,
  a: number,
): void {
  for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
    const gy = y + r() * hgt;
    sketchLine(c, x - w * 0.25, gy, x + w * 1.25, gy + (r() - 0.5) * 2, r, a * 0.3, 0.5);
  }
  const gx = x + r() * w;
  sketchLine(c, gx, y - hgt * 0.3, gx + (r() - 0.5) * 2, y + hgt, r, a * 0.25, 0.5);
}

/** A crumbling wall: jagged stepped top, arched openings, left-side shade, course lines. */
function ruinWall(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  baseY: number,
  hgt: number,
  r: Rand,
  d: Depth,
): void {
  const w = x1 - x0;
  const top: Pt[] = [];
  let y = baseY - hgt * (0.5 + r() * 0.5);
  for (let x = x0; x <= x1; x += w / (5 + Math.floor(r() * 5))) {
    // Broken masonry: steps and bites, now and then a tall surviving stub.
    y = Math.min(baseY - hgt * 0.2, Math.max(baseY - hgt, y + (r() - 0.5) * hgt * 0.45));
    top.push({ x, y }, { x: x + w * 0.04, y: y + (r() - 0.3) * hgt * 0.12 });
  }
  const body: Pt[] = [{ x: x0, y: baseY + 2 }, ...top, { x: x1, y: baseY + 2 }];
  c.save();
  poly(c, body);
  // Arched openings (even-odd holes): one or two, never a regular row.
  const openings = 1 + Math.floor(r() * 2);
  for (let i = 0; i < openings; i++) {
    const ow = hgt * (0.1 + r() * 0.07);
    const ox = x0 + w * (0.2 + (i / openings) * 0.6 + r() * 0.15);
    const oy = baseY - hgt * 0.08;
    const oh = hgt * (0.22 + r() * 0.15);
    c.moveTo(ox - ow, oy);
    c.lineTo(ox - ow, oy - oh);
    c.arc(ox, oy - oh, ow, Math.PI, 0);
    c.lineTo(ox + ow, oy);
    c.closePath();
  }
  c.fillStyle = tone(d.fill, d.cover);
  c.fill('evenodd');
  c.clip('evenodd');
  shadeLeft(c, { x: x0, y: baseY - hgt, w, h: hgt }, d.hatch, r, 0.45);
  // Masonry courses, broken off here and there.
  for (let cy = baseY - hgt * 0.15; cy > baseY - hgt; cy -= hgt * (0.12 + r() * 0.1))
    if (r() < 0.7)
      sketchLine(c, x0 + r() * w * 0.3, cy, x1 - r() * w * 0.3, cy, r, d.hatch * 0.8, 0.5);
  c.restore();
  sketchPath(c, body, r, d.line, d.width * 0.9, 1);
}

/** A squat broken keep: tapered walls, a bitten crenellated top, one arched window. */
function keep(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  tw: number,
  th: number,
  r: Rand,
  d: Depth,
): void {
  const topY = baseY - th;
  const crown: Pt[] = [];
  const merlons = 3 + Math.floor(r() * 2);
  const bite = Math.floor(r() * merlons);
  for (let i = 0; i < merlons; i++) {
    const mx = x - tw / 2 + (tw * i) / merlons;
    const mw = tw / merlons;
    const drop = i === bite ? th * (0.18 + r() * 0.2) : 0;
    const my = topY + drop + (r() - 0.5) * tw * 0.04;
    crown.push({ x: mx, y: my }, { x: mx + mw * 0.55, y: my });
    crown.push({ x: mx + mw * 0.55, y: my + tw * 0.08 }, { x: mx + mw, y: my + tw * 0.08 });
  }
  const body: Pt[] = [
    { x: x - tw * 0.56, y: baseY + 2 },
    { x: x - tw / 2, y: topY + tw * 0.1 },
    ...crown,
    { x: x + tw / 2, y: topY + tw * 0.1 },
    { x: x + tw * 0.56, y: baseY + 2 },
  ];
  c.save();
  poly(c, body);
  c.fillStyle = tone(d.fill, d.cover);
  c.fill();
  c.clip();
  shadeLeft(c, boxOf(body), d.hatch, r, 0.5);
  c.restore();
  sketchPath(c, body, r, d.line, d.width * 0.9, 1);
  // One arched window, dark.
  const wx = x + tw * (0.05 + r() * 0.15),
    wy = topY + th * 0.35,
    ww = tw * 0.07;
  c.fillStyle = graphite(d.line * 0.9);
  c.beginPath();
  c.moveTo(wx - ww, wy + th * 0.14);
  c.lineTo(wx - ww, wy);
  c.arc(wx, wy, ww, Math.PI, 0);
  c.lineTo(wx + ww, wy + th * 0.14);
  c.closePath();
  c.fill();
}

/** A tall broken spire: a slender tower snapped off, with the lost spire left as a ghost guide. */
function brokenSpire(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  tw: number,
  th: number,
  r: Rand,
  d: Depth,
): void {
  const lean = (r() - 0.5) * tw * 0.3;
  const breakY = baseY - th;
  const body: Pt[] = [
    { x: x - tw * 0.6, y: baseY + 2 },
    { x: x - tw / 2 + lean * 0.8, y: breakY + tw * 0.5 },
    { x: x - tw * 0.2 + lean, y: breakY - tw * 0.2 },
    { x: x + tw * 0.05 + lean, y: breakY + tw * 0.3 },
    { x: x + tw * 0.3 + lean, y: breakY - tw * 0.8 },
    { x: x + tw / 2 + lean * 0.9, y: breakY + tw * 0.6 },
    { x: x + tw * 0.6, y: baseY + 2 },
  ];
  c.save();
  poly(c, body);
  c.fillStyle = tone(d.fill, d.cover);
  c.fill();
  c.clip();
  shadeLeft(c, boxOf(body), d.hatch * 1.2, r, 0.45);
  c.restore();
  sketchPath(c, body, r, d.line, d.width * 0.9, 1);
  // Lancet slits climbing the shaft, irregularly.
  for (let yy = baseY - tw * 2; yy > breakY + tw * 1.5; yy -= tw * (1.6 + r() * 1.4)) {
    if (r() < 0.35) continue;
    const sx = x + lean * ((baseY - yy) / th);
    c.fillStyle = graphite(d.line * 0.8);
    c.fillRect(sx - tw * 0.06, yy - tw * 0.5, tw * 0.12, tw * 0.5);
  }
  // The missing spire, only as faint construction lines.
  const apex = { x: x + lean * 1.3, y: breakY - th * 0.4 };
  sketchLine(c, x - tw / 2 + lean, breakY, apex.x, apex.y, r, d.line * 0.35, 0.5, 5);
  sketchLine(c, x + tw / 2 + lean, breakY, apex.x, apex.y, r, d.line * 0.35, 0.5, 5);
  sketchLine(c, x + lean, breakY + tw, apex.x, apex.y - tw, r, d.line * 0.25, 0.5);
}

/**
 * An aqueduct striding from `x0` in direction `dir`, its piers sinking into mist and its bays
 * decaying with distance: the deck snaps, piers stand as stumps, and the far end fades away.
 */
function aqueduct(
  c: CanvasRenderingContext2D,
  x0: number,
  dir: 1 | -1,
  deckY: number,
  bottom: number,
  scale: number,
  r: Rand,
  d0: Depth,
): void {
  const bays = 3 + Math.floor(r() * 3);
  const deck = scale * 0.012 + 2;
  let x = x0;
  for (let i = 0; i < bays; i++) {
    const t = i / bays;
    const d = faded(d0, 1 - t * 0.85);
    const span = scale * (0.075 + r() * 0.05);
    const pier = span * (0.17 + r() * 0.06);
    // Pier i sits at the far end of bay i (seen from the root).
    const px = x + dir * (span - pier / 2);
    const stump = i > 0 && r() < t * 1.1;
    const pTop = stump ? deckY + (bottom - deckY) * (0.35 + r() * 0.25) : deckY;
    const pl = px - pier / 2,
      pr = px + pier / 2;
    const p: Pt[] = [
      { x: pl, y: bottom },
      { x: pl, y: pTop + (stump ? (r() - 0.5) * pier : 0) },
      { x: px + (r() - 0.5) * pier * 0.4, y: pTop - (stump ? pier * 0.3 : 0) },
      { x: pr, y: pTop + (stump ? (r() - 0.5) * pier : 0) },
      { x: pr, y: bottom },
    ];
    c.save();
    poly(c, p);
    c.fillStyle = tone(d.fill, d.cover);
    c.fill();
    c.clip();
    shadeLeft(c, boxOf(p), d.hatch, r, 0.5);
    c.restore();
    sketchLine(c, pl, bottom, pl, pTop, r, d.line, d.width);
    sketchLine(c, pr, bottom, pr, pTop, r, d.line * 0.6, d.width * 0.7);
    // The bay's arch and deck, from the previous pier (or the root) to this one, unless lost.
    const lost = i > 0 && r() < t * 0.9;
    const a = dir > 0 ? x : px + pier / 2,
      b = dir > 0 ? px - pier / 2 : x;
    const rad = Math.abs(b - a) / 2;
    if (!lost && !stump) {
      const spring = deckY + deck + rad;
      c.beginPath();
      c.moveTo(a, deckY);
      c.lineTo(b, deckY);
      c.lineTo(b, spring);
      c.arc(a + rad, spring, rad, 0, Math.PI, true);
      c.closePath();
      c.fillStyle = tone(d.fill, d.cover);
      c.fill();
      c.strokeStyle = graphite(d.line * 0.85);
      c.lineWidth = d.width * 0.8;
      c.beginPath();
      c.arc(a + rad, spring, rad, Math.PI, 0);
      c.stroke();
      sketchLine(c, a - 2, deckY, b + 2, deckY, r, d.line, d.width, 3);
      sketchLine(c, a, deckY + deck, b, deckY + deck, r, d.line * 0.5, d.width * 0.6);
    } else if (!stump) {
      // A snapped deck end jutting from the pier.
      const from = dir > 0 ? b : a;
      const reach = rad * (0.4 + r() * 0.6) * -dir;
      sketchLine(c, from, deckY, from + reach, deckY + rad * 0.15, r, d.line * 0.8, d.width * 0.8);
    }
    x += dir * span;
  }
}

// --- far: the colossal landmark ------------------------------------------------------------------

/**
 * One distant landmark: a crag rising out of mist, a ruin of walls and a squat keep on top, one
 * tall broken spire, and an aqueduct striding away to one side and decaying into the mist.
 */
function landmark(
  c: CanvasRenderingContext2D,
  cx: number,
  sy: (s: number) => number,
  u: number,
  r: Rand,
): void {
  const d = FAR;
  const scale = u * (1.15 + r() * 0.3);
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
  const rockTop = sy(0.41 + r() * 0.05);
  const x0 = cx - scale * (0.14 + r() * 0.06),
    x1 = cx + scale * (0.14 + r() * 0.06);
  // The aqueduct first, so the crag covers its root.
  const deckY = rockTop - scale * (0.01 + r() * 0.04);
  aqueduct(c, dir > 0 ? x1 - scale * 0.04 : x0 + scale * 0.04, dir, deckY, sy(0.8), scale, r, d);
  const top = crag(c, x0, x1, rockTop, sy(0.8), r, d, 0.03 + r() * 0.05);
  const surface = surfaceOf(top, 2);
  guides(c, x0, rockTop - scale * 0.3, x1 - x0, scale * 0.3, r, d.line);
  // The ruin: a wall run toward the aqueduct side, a keep, and the spire beside it.
  const span = x1 - x0;
  const wx0 = dir > 0 ? x0 + span * (0.45 + r() * 0.1) : x0 + span * 0.05;
  const wx1 = wx0 + span * (0.35 + r() * 0.15);
  ruinWall(c, wx0, wx1, surface((wx0 + wx1) / 2), scale * (0.05 + r() * 0.04), r, d);
  const kx = cx - dir * span * (0.12 + r() * 0.1);
  const kw = scale * (0.05 + r() * 0.025);
  const sx = kx - dir * kw * (0.5 + r() * 0.4);
  brokenSpire(c, sx, surface(sx), scale * (0.026 + r() * 0.01), scale * (0.2 + r() * 0.07), r, d);
  keep(c, kx, surface(kx), kw, scale * (0.08 + r() * 0.05), r, d);
}

/**
 * The far layer: about one landmark per view width, spaced irregularly, with wide calm sky
 * between. Everything sinks into a luminous mist pool below the crag tops.
 */
export function paintFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u, vw, vt } = lc;
  const sy = (s: number): number => vt + s * u;
  for (let cx = vw * (0.55 + r() * 0.35); cx < w + vw * 0.3; cx += vw * (1.0 + r() * 0.35))
    landmark(c, cx, sy, u, r);
  // Wisps of mist drifting across the crags, above the pool they rise from.
  for (let i = 0; i < Math.ceil(w / (u * 0.6)); i++) {
    const len = u * (0.25 + r() * 0.45);
    rubbed(
      c,
      r() * w - len / 2,
      sy(0.42 + r() * 0.12),
      len,
      u * (0.012 + r() * 0.018),
      (r() - 0.5) * 0.03,
      (r() - 0.5) * 0.2,
      r,
      haze,
      0.16 + r() * 0.14,
    );
  }
  fadeBelow(c, r, w, sy(0.56), sy(0.76), u * 0.035);
  mistBank(c, r, w, sy(0.53), sy(0.74), h, 0.3, u * 0.035);
}

// --- mid far: pinnacles in loose clusters ---------------------------------------------------------

/** A short arched bridge between two pinnacles. */
function bridge(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  deckY: number,
  r: Rand,
  d: Depth,
): void {
  const bays = 1 + Math.floor(r() * 2);
  const span = (x1 - x0) / bays;
  const deck = Math.max(2, span * 0.12);
  c.save();
  c.beginPath();
  c.rect(x0, deckY, x1 - x0, span * 0.9);
  for (let i = 0; i < bays; i++) {
    const a = x0 + i * span + span * 0.1,
      b = a + span * 0.8;
    const rad = (b - a) / 2;
    c.moveTo(a, deckY + span * 0.9);
    c.lineTo(a, deckY + deck + rad);
    c.arc(a + rad, deckY + deck + rad, rad, Math.PI, 0);
    c.lineTo(b, deckY + span * 0.9);
    c.closePath();
  }
  c.fillStyle = tone(d.fill, d.cover);
  c.fill('evenodd');
  c.restore();
  sketchLine(c, x0, deckY, x1, deckY, r, d.line, d.width, 3);
  for (let i = 0; i < bays; i++) {
    const a = x0 + i * span + span * 0.1,
      rad = span * 0.4;
    c.strokeStyle = graphite(d.line * 0.8);
    c.lineWidth = d.width * 0.8;
    c.beginPath();
    c.arc(a + rad, deckY + deck + rad, rad, Math.PI, 0);
    c.stroke();
  }
}

export function paintMidFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u, vt } = lc;
  const sy = (s: number): number => vt + s * u;
  const d = MIDFAR;
  const xs = clustered(r, 0, w, u * 1.15, u * 0.22, [1, 3]).sort((p, q) => p - q);
  let prev: { x: number; top: number } | null = null;
  for (const x of xs) {
    const pw = u * (0.07 + r() * 0.09);
    const top = sy(0.41 + r() * 0.17);
    const crest = crag(c, x - pw / 2, x + pw / 2, top, sy(0.85), r, d, 0.35 + r() * 0.5);
    const at = surfaceOf(crest, 2);
    const kind = r();
    if (kind < 0.18) {
      const tx = x + (r() - 0.5) * pw * 0.3;
      ruinWall(c, tx - pw * 0.28, tx + pw * 0.28, at(tx), u * (0.035 + r() * 0.03), r, d);
    } else if (kind < 0.55) {
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const px = x - pw * 0.3 + r() * pw * 0.6;
        pine(c, px, at(px), u * (0.03 + r() * 0.035), r, d.line * 1.1, true);
      }
    }
    if (prev && x - prev.x < u * 0.4 && x - prev.x > u * 0.12 && r() < 0.3)
      bridge(c, prev.x, x, Math.max(prev.top, top) + u * 0.05, r, d);
    prev = { x, top };
  }
  fadeBelow(c, r, w, sy(0.62), sy(0.82), u * 0.03);
  mistBank(c, r, w, sy(0.62), sy(0.84), h, 0.34, u * 0.03);
}

// --- mid: low cliff masses with hanging roots and sketched trees -----------------------------------

export function paintMid(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u, vt } = lc;
  const sy = (s: number): number => vt + s * u;
  const d = MID;
  const xs = clustered(r, -u * 0.2, w, u * 1.5, u * 0.18, [1, 2]).sort((p, q) => p - q);
  for (const x of xs) {
    const cw = u * (0.12 + r() * 0.18);
    const top = sy(0.6 + r() * 0.12);
    const surface = crag(c, x - cw / 2, x + cw / 2, top, sy(1.02), r, d, 0.2 + r() * 0.3);
    // Overhanging lip: a few roots spill down the face from the top edge.
    for (const p of surface) {
      if (r() < 0.65) continue;
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++)
        root(c, p.x + (r() - 0.5) * 8, p.y + 3, u * (0.02 + r() * 0.06), r, d.line * 0.8, 0.9);
    }
    // Trees on top: a pine or two, now and then a bare dead tree.
    const trees = Math.floor(r() * 3);
    for (let i = 0; i < trees; i++) {
      const p = surface[1 + Math.floor(r() * (surface.length - 2))];
      if (!p) continue;
      if (r() < 0.7) pine(c, p.x, p.y + 2, u * (0.045 + r() * 0.05), r, d.line * 1.1, true);
      else deadTree(c, p.x, p.y + 2, u * (0.05 + r() * 0.04), r, d.line);
    }
  }
  fadeBelow(c, r, w, sy(0.84), sy(0.98), u * 0.02);
  mistBank(c, r, w, sy(0.8), sy(0.96), h, 0.3, u * 0.02, 0.5);
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
    c.lineWidth = Math.max(0.5, depth * 0.7);
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

// --- near foreground (screen space) ---------------------------------------------------------------

/**
 * Dark graphite silhouettes along the bottom edge: rock mounds, grass and the odd bare branch, in
 * clusters with wide gaps. Kept low (the playable band is above it); `h` is the strip height.
 */
export function paintForeground(c: CanvasRenderingContext2D, w: number, h: number, r: Rand): void {
  const dark = 'rgba(18,19,23,0.94)';
  const centres = clustered(r, 0, w, w / 5, w / 14, [1, 2]);
  for (const cx of centres) {
    // Keep the clump inside the tile so the wrap seam is clean.
    const width = h * (1.6 + r() * 4);
    const x0 = Math.max(4, cx - width / 2),
      x1 = Math.min(w - 4, cx + width / 2);
    if (x1 - x0 < h * 0.4) continue;
    const peak = h * (0.14 + r() * 0.24);
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
        const bh = h * (0.1 + r() * 0.3);
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
      reach(-Math.PI / 2 + (r() - 0.5) * 1.2, h * (0.2 + r() * 0.12), 2, bx, by);
    }
  }
}
