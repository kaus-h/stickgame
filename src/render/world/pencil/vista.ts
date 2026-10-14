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
  rubbed,
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
  /** Visible view width, texture pixels. */
  readonly vw: number;
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
  // Cloud banks as rubbed graphite: long soft finger-smudged strokes with lifted (erased) light
  // edges on top and a few streaks dragged through them. Never round blobs.
  const banks = Math.ceil(w / (u * 0.45));
  for (let i = 0; i < banks; i++) {
    const cx = r() * w;
    const cy = top + u * (0.0 + r() * 0.32);
    const size = u * (0.12 + r() * 0.2);
    const strokes = 3 + Math.floor(r() * 4);
    for (let k = 0; k < strokes; k++) {
      const len = size * (1.4 + r() * 2.2);
      const x0 = cx + (r() - 0.6) * size * 2;
      const y0 = cy + (r() - 0.5) * size * 0.6;
      const ang = (r() - 0.5) * 0.35;
      const bend = (r() - 0.5) * 0.8;
      const thick = size * (0.18 + r() * 0.22);
      rubbed(c, x0, y0, len, thick, ang, bend, r, graphite, 0.1 + r() * 0.08);
      // The eraser lifts a lighter edge along the top of the stroke.
      rubbed(
        c,
        x0 + len * 0.1,
        y0 - thick * 0.7,
        len * 0.75,
        thick * 0.45,
        ang,
        bend,
        r,
        mist,
        0.2,
      );
      // Dragged graphite streaks.
      for (let s = 0; s < 3; s++) {
        const sy = y0 + (r() - 0.5) * thick;
        sketchLine(
          c,
          x0 + len * 0.1 * r(),
          sy,
          x0 + len * (0.6 + r() * 0.4),
          sy + len * ang,
          r,
          0.05 + r() * 0.05,
          0.6,
        );
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
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
    const gy = y + r() * hgt;
    sketchLine(c, x - w * 0.3, gy, x + w * 1.3, gy + (r() - 0.5) * 3, r, a * 0.22, 0.6);
  }
  for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
    const gx = x + r() * w;
    sketchLine(c, gx, y - hgt * 0.4, gx + (r() - 0.5) * 3, y + hgt, r, a * 0.18, 0.6);
  }
}

/** A crumbling wall: jagged stepped top, arched openings, left-side shade, course lines. */
function ruinWall(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  baseY: number,
  hgt: number,
  r: Rand,
  a: number,
): void {
  const w = x1 - x0;
  const top: Pt[] = [];
  let y = baseY - hgt * (0.5 + r() * 0.5);
  for (let x = x0; x <= x1; x += w / (6 + Math.floor(r() * 6))) {
    // Broken masonry: steps and bites, now and then a tall surviving stub.
    y = Math.min(baseY - hgt * 0.15, Math.max(baseY - hgt, y + (r() - 0.5) * hgt * 0.45));
    top.push({ x, y }, { x: x + w * 0.04, y: y + (r() - 0.3) * hgt * 0.12 });
  }
  const body: Pt[] = [{ x: x0, y: baseY }, ...top, { x: x1, y: baseY }];
  c.save();
  c.beginPath();
  body.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.closePath();
  // Arched openings (even-odd holes), in an irregular row.
  const openings = Math.floor(w / (hgt * 0.35));
  for (let i = 0; i < openings; i++) {
    if (r() < 0.35) continue;
    const ow = hgt * (0.08 + r() * 0.08);
    const ox = x0 + ((i + 0.5) / openings) * w;
    const oy = baseY - hgt * (0.12 + r() * 0.1);
    const oh = hgt * (0.2 + r() * 0.2);
    c.moveTo(ox - ow, oy);
    c.lineTo(ox - ow, oy - oh);
    c.arc(ox, oy - oh, ow, Math.PI, 0);
    c.lineTo(ox + ow, oy);
    c.closePath();
  }
  c.fillStyle = mist(0.18);
  c.fill('evenodd');
  c.fillStyle = graphite(a * 0.2);
  c.fill('evenodd');
  c.clip('evenodd');
  hatchBox(c, { x: x0, y: baseY - hgt, w: w * 0.45, h: hgt }, 1.25, 3.2, a * 0.45, r, 0.7);
  hatchBox(c, { x: x0, y: baseY - hgt, w, h: hgt }, 1.9, 8, a * 0.2, r, 0.6);
  // Masonry courses.
  for (let cy = baseY - hgt * 0.1; cy > baseY - hgt; cy -= hgt * (0.08 + r() * 0.06))
    sketchLine(c, x0, cy, x1, cy + (r() - 0.5) * 2, r, a * 0.25, 0.5);
  c.restore();
  sketchPath(c, body, r, a * 0.75, 0.9, 2, 1.2);
}

/** A tall broken spire: a slender tower snapped off, with the lost spire left as a ghost guide. */
function brokenSpire(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  tw: number,
  th: number,
  r: Rand,
  a: number,
): void {
  const lean = (r() - 0.5) * tw * 0.5;
  const breakY = baseY - th;
  const body: Pt[] = [
    { x: x - tw / 2, y: baseY },
    { x: x - tw / 2 + lean * 0.8, y: breakY + tw * 0.4 },
    { x: x - tw * 0.2 + lean, y: breakY - tw * 0.3 },
    { x: x + tw * 0.05 + lean, y: breakY + tw * 0.2 },
    { x: x + tw * 0.28 + lean, y: breakY - tw * 0.9 },
    { x: x + tw / 2 + lean * 0.9, y: breakY + tw * 0.5 },
    { x: x + tw / 2, y: baseY },
  ];
  c.save();
  poly(c, body);
  c.fillStyle = mist(0.2);
  c.fill();
  c.fillStyle = graphite(a * 0.22);
  c.fill();
  c.clip();
  hatchBox(
    c,
    { x: x - tw / 2, y: breakY - tw, w: tw * 0.5, h: th + tw },
    1.3,
    2.8,
    a * 0.55,
    r,
    0.7,
  );
  c.restore();
  sketchPath(c, body, r, a * 0.85, 0.9, 2, 1);
  // Lancet slits climbing the shaft.
  for (let yy = baseY - tw * 1.5; yy > breakY + tw; yy -= tw * (1.2 + r() * 0.8)) {
    if (r() < 0.3) continue;
    const sx = x + lean * ((baseY - yy) / th);
    c.fillStyle = graphite(a * 0.7);
    c.fillRect(sx - tw * 0.07, yy - tw * 0.45, tw * 0.14, tw * 0.45);
  }
  // The missing spire, only as faint construction lines.
  const apex = { x: x + lean * 1.3, y: breakY - th * 0.45 };
  sketchLine(c, x - tw / 2 + lean, breakY, apex.x, apex.y, r, a * 0.18, 0.6, 6);
  sketchLine(c, x + tw / 2 + lean, breakY, apex.x, apex.y, r, a * 0.18, 0.6, 6);
  sketchLine(c, x + lean, breakY + tw, apex.x, apex.y - tw, r, a * 0.14, 0.5);
}

/** A great arch, one side collapsed; its full circle survives as a construction guide. */
function brokenArch(
  c: CanvasRenderingContext2D,
  x0: number,
  span: number,
  baseY: number,
  hgt: number,
  r: Rand,
  a: number,
): void {
  const pier = span * 0.16;
  const rad = span / 2 - pier / 2;
  const cx = x0 + span / 2;
  const spring = baseY - hgt + rad;
  const keep = 0.45 + r() * 0.35; // fraction of the arc still standing, from the left
  const leftPier: Pt[] = [
    { x: x0, y: baseY },
    { x: x0, y: spring - rad * 0.2 },
    { x: x0 + pier, y: spring - rad * 0.2 },
    { x: x0 + pier, y: baseY },
  ];
  const rightH = hgt * (0.25 + r() * 0.45);
  const rightPier: Pt[] = [
    { x: x0 + span - pier, y: baseY },
    { x: x0 + span - pier, y: baseY - rightH },
    { x: x0 + span - pier * 0.5, y: baseY - rightH - pier * 0.6 },
    { x: x0 + span, y: baseY - rightH * 0.85 },
    { x: x0 + span, y: baseY },
  ];
  for (const piece of [leftPier, rightPier]) {
    c.save();
    poly(c, piece);
    c.fillStyle = graphite(a * 0.22);
    c.fill();
    c.clip();
    hatchBox(c, boxOf(piece), 1.3, 3, a * 0.5, r, 0.7);
    c.restore();
    sketchPath(c, piece, r, a * 0.8, 0.9, 2, 1);
  }
  // The surviving voussoirs: a thick band of arc, ending in a ragged break.
  const a0 = Math.PI,
    a1 = Math.PI + Math.PI * keep;
  const thick = pier * 0.9;
  c.save();
  c.beginPath();
  c.arc(cx, spring, rad + thick, a0, a1);
  c.lineTo(
    cx + Math.cos(a1) * rad + (r() - 0.5) * thick,
    spring + Math.sin(a1) * rad + thick * 0.4,
  );
  c.arc(cx, spring, rad, a1, a0, true);
  c.closePath();
  c.fillStyle = graphite(a * 0.24);
  c.fill();
  c.clip();
  hatchBox(
    c,
    { x: x0, y: spring - rad - thick, w: span, h: rad + thick },
    1.2,
    2.6,
    a * 0.5,
    r,
    0.7,
  );
  c.restore();
  c.strokeStyle = graphite(a * 0.75);
  c.lineWidth = 0.9;
  c.beginPath();
  c.arc(cx, spring, rad + thick, a0, a1);
  c.stroke();
  c.beginPath();
  c.arc(cx, spring, rad, a0, a1);
  c.stroke();
  // Ghost of the whole arch.
  c.strokeStyle = graphite(a * 0.16);
  c.lineWidth = 0.6;
  c.beginPath();
  c.arc(cx, spring, rad + thick * 0.5, Math.PI, Math.PI * 2);
  c.stroke();
}

/** An aqueduct striding off in one direction, its deck broken and its far end crumbling. */
function brokenAqueduct(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  deckY: number,
  bottom: number,
  r: Rand,
  a: number,
): void {
  const bays = 5 + Math.floor(r() * 4);
  // Uneven bays: spans wander, so the arcade never reads as a ruled pattern.
  const weights = Array.from({ length: bays }, () => 0.65 + r() * 0.7);
  const total = weights.reduce((sum, v) => sum + v, 0);
  const starts: number[] = [];
  let acc = x0;
  for (const wgt of weights) {
    starts.push(acc);
    acc += ((x1 - x0) * wgt) / total;
  }
  starts.push(x1);
  const mean = (x1 - x0) / bays;
  const pier = mean * 0.22;
  const deck = Math.max(3, mean * 0.18);
  for (let i = 0; i < bays; i++) {
    const bx = starts[i] ?? x0;
    const span = (starts[i + 1] ?? x1) - bx;
    // Further bays decay: lower, missing deck, finally just stumps.
    const decay = i / bays;
    const lost = r() < decay * 0.9;
    const stump = r() < decay * 0.6;
    const topY = stump ? deckY + (bottom - deckY) * (0.3 + r() * 0.4) : deckY;
    const p: Pt[] = [
      { x: bx, y: bottom },
      { x: bx, y: topY + (r() - 0.5) * 4 },
      { x: bx + pier, y: topY + (r() - 0.2) * 6 },
      { x: bx + pier, y: bottom },
    ];
    c.save();
    poly(c, p);
    // Opaque on the paper: a pier hides whatever stands behind it.
    c.fillStyle = 'rgb(205,208,212)';
    c.fill();
    c.fillStyle = graphite(a * 0.22);
    c.fill();
    c.clip();
    hatchBox(c, boxOf(p), 1.3, 3.2, a * 0.45, r, 0.7);
    c.restore();
    sketchPath(c, p, r, a * 0.75, 0.8, 1);
    if (!stump && !lost) {
      // Arch and deck to the next pier.
      const ax = bx + pier,
        bx2 = bx + span;
      const rad = (bx2 - ax) / 2;
      c.strokeStyle = graphite(a * 0.7);
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(ax + rad, deckY + deck + rad, rad, Math.PI, 0);
      c.stroke();
      c.fillStyle = 'rgb(205,208,212)';
      c.fillRect(ax, deckY, bx2 - ax, deck);
      c.fillStyle = graphite(a * 0.2);
      c.fillRect(ax, deckY, bx2 - ax, deck);
      sketchLine(c, bx, deckY, bx2 + pier, deckY, r, a * 0.8, 0.9, 6);
    } else if (!stump) {
      // A snapped deck end.
      sketchLine(c, bx, deckY, bx + pier + span * 0.25 * r(), deckY + 3, r, a * 0.6, 0.8);
    }
  }
  sketchLine(c, x0 - mean * 0.3, deckY - deck, x1 + mean * 0.4, deckY - deck, r, a * 0.15, 0.6);
}

/**
 * The colossal landmark: half-sketched ruins on a crag, composed differently for every landmark
 * (seeded per level): crumbling walls, one tall broken spire, a collapsing great arch and an
 * aqueduct falling into mist. Landmarks are spaced more than a view apart, so at most one is on
 * screen at a time.
 */
export function paintFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u, vw } = lc;
  const a = 0.62;
  const horizon = h - u * 0.3;
  const spacing = vw * 1.35;
  const count = Math.max(1, Math.floor((w - vw * 0.3) / spacing) + 1);
  const slack = Math.max(0, w - spacing * (count - 1));
  let cx = slack * (0.3 + r() * 0.4);
  for (let k = 0; k < count; k++, cx += spacing * (1 + r() * 0.15)) {
    if (cx > w) break;
    const scale = u * (1.0 + r() * 0.35);
    const flip = r() < 0.5 ? 1 : -1;
    const rockTop = horizon - scale * (0.12 + r() * 0.12);
    const span0 = cx - scale * (0.3 + r() * 0.15),
      span1 = cx + scale * (0.25 + r() * 0.15);
    const top = crag(c, span0, span1, rockTop, h, r, a * 0.8, 0.1, 0.05 + r() * 0.1);
    const surface = (x: number): number =>
      top.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best)).y + 2;
    guides(c, span0, rockTop - scale * 0.6, span1 - span0, scale * 0.6, r, a);
    // Crumbling walls across the crag, in two or three uneven runs.
    const runs = 2 + Math.floor(r() * 2);
    for (let i = 0; i < runs; i++) {
      const wx0 = span0 + (span1 - span0) * (i / runs + r() * 0.1);
      const wx1 = wx0 + (span1 - span0) * (0.18 + r() * 0.2);
      ruinWall(c, wx0, wx1, surface((wx0 + wx1) / 2), scale * (0.12 + r() * 0.18), r, a);
    }
    // The broken spire, off-centre.
    const sx = cx + flip * scale * (0.08 + r() * 0.15);
    brokenSpire(c, sx, surface(sx), scale * (0.06 + r() * 0.03), scale * (0.45 + r() * 0.25), r, a);
    // A collapsing great arch on the other side of the spire.
    const archW = scale * (0.16 + r() * 0.1);
    const ax = cx - flip * scale * (0.05 + r() * 0.12) - archW / 2;
    brokenArch(c, ax, archW, surface(ax + archW / 2), scale * (0.3 + r() * 0.15), r, a);
    // The aqueduct strides away on the flip side, decaying into mist.
    // Deck high in the sky band, well above where playable ledges sit.
    const deck = horizon - scale * (0.4 + r() * 0.12);
    const reach = scale * (0.7 + r() * 0.5);
    if (flip > 0) brokenAqueduct(c, span1 - scale * 0.05, span1 + reach, deck, h, r, a * 0.85);
    else {
      c.save();
      c.translate(2 * (span0 + scale * 0.05), 0);
      c.scale(-1, 1);
      brokenAqueduct(c, span0 + scale * 0.05, span0 + scale * 0.05 + reach, deck, h, r, a * 0.85);
      c.restore();
    }
    // A thread of waterfall off the crag face.
    const fx = cx + (r() - 0.5) * scale * 0.3;
    const fy = surface(fx) + 4;
    const fall = c.createLinearGradient(0, fy, 0, h);
    fall.addColorStop(0, mist(0.5));
    fall.addColorStop(1, mist(0));
    c.fillStyle = fall;
    c.fillRect(fx - 3, fy, 6, h - fy);
  }
  // Far is palest: veiled, and dissolving into mist below the horizon.
  veil(c, w, h, 0.12);
  mistBand(c, 0, w, horizon - u * 0.24, h, 0.92);
}

// --- mid far: pinnacles, pines, a small bridge ------------------------------------------------------

export function paintMidFar(lc: LayerCanvas, r: Rand): void {
  const { c, w, h, u } = lc;
  const a = 0.52;
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
      ruinWall(c, tx - pw * 0.3, tx + pw * 0.3, at(tx), u * (0.05 + r() * 0.05), r, a);
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
  veil(c, w, h, 0.16);
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
  const a = 0.68;
  const xs = clustered(r, -u * 0.2, w, u * 0.85, u * 0.3, [1, 2]).sort((p, q) => p - q);
  for (const x of xs) {
    const cw = u * (0.18 + r() * 0.3);
    const top = h - u * (0.36 + r() * 0.3);
    const surface = crag(c, x - cw / 2, x + cw / 2, top, h + 4, r, a, 0.22, 0.25 + r() * 0.4);
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
  veil(c, w, h, 0.12);
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
