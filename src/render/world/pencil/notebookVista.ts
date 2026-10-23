import { fbm1 } from './rng';
import { hatchBox, type Rand } from './sketch';
import type { LayerCanvas } from './vista';

/**
 * Notebook vista (chapter 1 on the ruled page, owner 2026-10-23): the backdrop is what a student
 * doodles behind the action, in ballpoint and pencil straight on the ruled paper. Every layer is
 * transparent, so the world-locked ruling and paper show through, and each scrolls at its own rate
 * (clouds slowest, near bushes fastest) so moving right reads as travelling through a place.
 * Light comes from the upper right: shading hatches sit on left-facing sides and undersides.
 * Presentation only, seeded, nothing animates.
 */

type Pt = { x: number; y: number };

const PEN = (a: number): string => `rgba(36,58,138,${a.toFixed(3)})`;
const LEAD = (a: number): string => `rgba(48,50,58,${a.toFixed(3)})`;

/** A wobbly hand stroke through points (quadratic smoothing, slight per-point drift). */
function stroke(
  c: CanvasRenderingContext2D,
  pts: readonly Pt[],
  color: string,
  width: number,
  r: Rand,
  wobble = 0.8,
  closed = false,
): void {
  if (pts.length < 2) return;
  const q = pts.map((p) => ({ x: p.x + (r() - 0.5) * wobble, y: p.y + (r() - 0.5) * wobble }));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo((q[0] as Pt).x, (q[0] as Pt).y);
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i] as Pt,
      b = q[i + 1] as Pt;
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = q[q.length - 1] as Pt;
  c.lineTo(last.x, last.y);
  if (closed) c.closePath();
  c.stroke();
}

/** Ballpoint: a firm pass and a fainter offset pass, the way a pen line doubles when retraced. */
function pen(c: CanvasRenderingContext2D, pts: readonly Pt[], a: number, w: number, r: Rand): void {
  stroke(c, pts, PEN(a), w, r, 0.7);
  if (r() < 0.6) stroke(c, pts, PEN(a * 0.45), w * 0.7, r, 1.6);
}

const line = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
  { x: x1, y: y1 },
];

/** Short parallel hatch strokes along a sampled edge, falling down-left (shade side). */
function edgeHatch(
  c: CanvasRenderingContext2D,
  pts: readonly Pt[],
  color: (a: number) => string,
  a: number,
  len: number,
  gap: number,
  r: Rand,
  keep: (i: number) => boolean,
): void {
  c.lineCap = 'round';
  let next = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as Pt;
    if (p.x < next || !keep(i)) continue;
    next = p.x + gap * (0.7 + r() * 0.7);
    const l = len * (0.5 + r() * 0.7);
    c.strokeStyle = color(a * (0.6 + r() * 0.4));
    c.lineWidth = 0.9 + r() * 0.4;
    c.beginPath();
    c.moveTo(p.x, p.y + 3);
    c.lineTo(p.x - l * 0.55, p.y + 3 + l);
    c.stroke();
  }
}

/** Positions in loose clusters with wide uneven gaps (never evenly spaced, style rule). */
function scatter(r: Rand, x0: number, x1: number, gap: number, per: [number, number]): number[] {
  const out: number[] = [];
  for (let x = x0 + r() * gap; x < x1; x += gap * (0.55 + r() * 1.2)) {
    const n = per[0] + Math.floor(r() * (per[1] - per[0] + 1));
    for (let i = 0; i < n; i++) out.push(x + (r() - 0.5) * gap * 0.35);
  }
  return out.sort((p, q) => p - q);
}

/** Bumpy closed outline around a centre: clouds, tree canopies and bushes share it. */
function puff(cx: number, cy: number, rx: number, ry: number, bumps: number, r: Rand): Pt[] {
  const phase = r() * Math.PI * 2;
  const pts: Pt[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 0.84 + 0.16 * Math.abs(Math.sin((t * bumps) / 2 + phase));
    pts.push({ x: cx + Math.cos(t) * rx * k, y: cy + Math.sin(t) * ry * k });
  }
  return pts;
}

function clipTo(c: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  c.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.closePath();
  c.clip();
}

const boxOf = (pts: readonly Pt[]): { x: number; y: number; w: number; h: number } => {
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// --- clouds (slowest) ----------------------------------------------------------------------------

/** Scribbled cumulus: a flat-bottomed bumpy pencil outline with a little hatching underneath. */
export function paintNotebookClouds({ c, w, h, u }: LayerCanvas, r: Rand): void {
  const s = u / 720;
  for (const x of scatter(r, -u * 0.3, w, u * 1.15, [1, 2])) {
    const cw = u * (0.16 + r() * 0.2);
    const ch = cw * (0.3 + r() * 0.12);
    const base = h - u * (0.62 + r() * 0.3);
    const bumps = 3 + Math.floor(r() * 3);
    const phase = r() * Math.PI;
    const top: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const env = Math.pow(Math.sin(Math.PI * t), 0.55);
      const lump = 0.62 + 0.38 * Math.abs(Math.sin(Math.PI * bumps * t + phase));
      top.push({ x: x + cw * t, y: base - ch * env * lump });
    }
    const outline = [...top, { x: x + cw * 0.97, y: base + 2 }, { x: x + cw * 0.04, y: base + 1 }];
    c.save();
    clipTo(c, outline);
    hatchBox(c, { x, y: base - ch * 0.35, w: cw, h: ch * 0.4 }, -0.95, 5 * s + 2, 0.1, r, 0.8);
    c.restore();
    stroke(c, top, LEAD(0.36), 1.5 * s + 0.4, r, 0.9);
    stroke(c, line(x + cw * 0.06, base + 1, x + cw * 0.95, base + 2), LEAD(0.24), 1.1 * s, r, 1);
  }
}

// --- far: ballpoint hills and landmarks -----------------------------------------------------------

function hillProfile(x0: number, x1: number, base: number, amp: number, seed: number): Pt[] {
  const pts: Pt[] = [];
  for (let x = x0; x <= x1; x += 10) {
    const n = fbm1(x / (amp * 5.5), seed);
    pts.push({ x, y: base - amp * (0.45 + 0.75 * n) });
  }
  return pts;
}

const yAt = (pts: readonly Pt[], x: number): number => {
  const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - (pts[0] as Pt).x) / 10)));
  return (pts[i] as Pt).y;
};

function castle(c: CanvasRenderingContext2D, x: number, ground: number, sz: number, r: Rand): void {
  const a = 0.5;
  const bw = sz * (0.9 + r() * 0.4);
  const bh = sz * 0.42;
  const wall = [
    { x: x - bw / 2, y: ground + 4 },
    { x: x - bw / 2, y: ground - bh },
    { x: x + bw / 2, y: ground - bh },
    { x: x + bw / 2, y: ground + 4 },
  ];
  // Crenellated wall top.
  const merlons: Pt[] = [{ x: x - bw / 2, y: ground - bh }];
  const step = sz * 0.09;
  for (let mx = x - bw / 2, up = true; mx < x + bw / 2 - step * 0.5; mx += step, up = !up) {
    const y = ground - bh - (up ? step * 0.8 : 0);
    merlons.push({ x: mx, y }, { x: mx + step, y });
  }
  pen(c, wall, a, 1.5, r);
  stroke(c, merlons, PEN(a * 0.9), 1.2, r, 0.4);
  // Towers: one tall with a cone and pennant, one or two squat.
  const towers = 2 + Math.floor(r() * 2);
  for (let i = 0; i < towers; i++) {
    const tx = x - bw / 2 + (bw * (i + 0.5)) / towers + (r() - 0.5) * sz * 0.1;
    const tw = sz * (0.16 + r() * 0.06);
    const th = bh + sz * (i === 0 ? 0.55 : 0.2 + r() * 0.2);
    const t = [
      { x: tx - tw / 2, y: ground - bh * 0.6 },
      { x: tx - tw / 2, y: ground - th },
      { x: tx + tw / 2, y: ground - th },
      { x: tx + tw / 2, y: ground - bh * 0.6 },
    ];
    pen(c, t, a, 1.4, r);
    if (i === 0) {
      const tip = { x: tx + (r() - 0.5) * 2, y: ground - th - sz * 0.32 };
      pen(
        c,
        [{ x: tx - tw * 0.62, y: ground - th }, tip, { x: tx + tw * 0.62, y: ground - th }],
        a,
        1.4,
        r,
      );
      stroke(c, line(tip.x, tip.y, tip.x, tip.y - sz * 0.16), PEN(a), 1.1, r, 0.2);
      stroke(
        c,
        [
          { x: tip.x, y: tip.y - sz * 0.16 },
          { x: tip.x + sz * 0.14, y: tip.y - sz * 0.12 },
          { x: tip.x, y: tip.y - sz * 0.08 },
        ],
        PEN(a),
        1.1,
        r,
        0.3,
      );
    } else {
      for (let mx = tx - tw / 2; mx < tx + tw / 2 - 1; mx += tw / 3)
        stroke(c, line(mx, ground - th, mx, ground - th - sz * 0.06), PEN(a * 0.8), 1.1, r, 0.2);
    }
    // Arrow slit.
    stroke(c, line(tx, ground - th + sz * 0.12, tx, ground - th + sz * 0.22), PEN(a), 1.6, r, 0.2);
    // Shade the left face.
    edgeHatch(
      c,
      line(tx - tw / 2 + 1, ground - th + 2, tx - tw / 2 + 1, ground - bh * 0.6).map((p, k) => ({
        x: p.x + 2 + k * 0.01,
        y: p.y,
      })),
      PEN,
      0.22,
      tw * 0.35,
      3,
      r,
      () => true,
    );
  }
  // Gate.
  const gw = sz * 0.14;
  stroke(
    c,
    [
      { x: x - gw / 2, y: ground + 2 },
      { x: x - gw / 2, y: ground - sz * 0.14 },
      { x, y: ground - sz * 0.21 },
      { x: x + gw / 2, y: ground - sz * 0.14 },
      { x: x + gw / 2, y: ground + 2 },
    ],
    PEN(a),
    1.3,
    r,
    0.3,
  );
}

function windmill(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
): void {
  const a = 0.48;
  const bw = sz * 0.26,
    tw = sz * 0.15,
    th = sz * 0.75;
  pen(
    c,
    [
      { x: x - bw / 2, y: ground + 3 },
      { x: x - tw / 2, y: ground - th },
      { x: x + tw / 2, y: ground - th },
      { x: x + bw / 2, y: ground + 3 },
    ],
    a,
    1.4,
    r,
  );
  const hub = { x, y: ground - th - sz * 0.05 };
  pen(c, puff(hub.x, hub.y + sz * 0.02, tw * 0.62, sz * 0.07, 2, r).slice(0, 26), a, 1.3, r);
  const turn = r() * Math.PI;
  for (let i = 0; i < 4; i++) {
    const t = turn + (i * Math.PI) / 2;
    const ux = Math.cos(t),
      uy = Math.sin(t);
    const L = sz * 0.55;
    const nx = -uy * sz * 0.07,
      ny = ux * sz * 0.07;
    const p0 = { x: hub.x + ux * sz * 0.08, y: hub.y + uy * sz * 0.08 };
    const p1 = { x: hub.x + ux * L, y: hub.y + uy * L };
    stroke(c, line(hub.x, hub.y, p1.x, p1.y), PEN(a), 1.2, r, 0.3);
    stroke(
      c,
      [p0, { x: p0.x + nx, y: p0.y + ny }, { x: p1.x + nx, y: p1.y + ny }, p1],
      PEN(a * 0.8),
      1.0,
      r,
      0.3,
    );
    for (let k = 1; k < 4; k++) {
      const f = 0.2 + k * 0.22;
      const q = { x: hub.x + ux * L * f, y: hub.y + uy * L * f };
      stroke(c, line(q.x, q.y, q.x + nx, q.y + ny), PEN(a * 0.6), 0.8, r, 0.2);
    }
  }
  // Door and a shaded left side.
  stroke(c, line(x - sz * 0.03, ground + 2, x - sz * 0.03, ground - sz * 0.1), PEN(a), 1.1, r, 0.2);
  stroke(c, line(x + sz * 0.03, ground + 2, x + sz * 0.03, ground - sz * 0.1), PEN(a), 1.1, r, 0.2);
  edgeHatch(
    c,
    line(x - tw / 2 + 2, ground - th + 4, x - bw / 2 + 4, ground - 2).concat(),
    PEN,
    0.2,
    sz * 0.06,
    3,
    r,
    () => true,
  );
}

function chapel(c: CanvasRenderingContext2D, x: number, ground: number, sz: number, r: Rand): void {
  const a = 0.46;
  const hw = sz * 0.3,
    hh = sz * 0.22;
  pen(
    c,
    [
      { x: x - hw / 2, y: ground + 3 },
      { x: x - hw / 2, y: ground - hh },
      { x: x - hw * 0.1, y: ground - hh - sz * 0.15 },
      { x: x + hw / 2, y: ground - hh },
      { x: x + hw / 2, y: ground + 3 },
    ],
    a,
    1.3,
    r,
  );
  const sx = x + hw / 2 + sz * 0.06;
  pen(
    c,
    [
      { x: sx - sz * 0.07, y: ground + 3 },
      { x: sx - sz * 0.07, y: ground - hh - sz * 0.12 },
      { x: sx, y: ground - hh - sz * 0.42 },
      { x: sx + sz * 0.07, y: ground - hh - sz * 0.12 },
      { x: sx + sz * 0.07, y: ground + 3 },
    ],
    a,
    1.3,
    r,
  );
  const ty = ground - hh - sz * 0.42;
  stroke(c, line(sx, ty, sx, ty - sz * 0.12), PEN(a), 1.2, r, 0.2);
  stroke(
    c,
    line(sx - sz * 0.04, ty - sz * 0.08, sx + sz * 0.04, ty - sz * 0.08),
    PEN(a),
    1.2,
    r,
    0.2,
  );
  stroke(
    c,
    line(x - sz * 0.05, ground - hh * 0.55, x - sz * 0.05, ground - hh * 0.25),
    PEN(a),
    2,
    r,
    0.2,
  );
}

function tinyPines(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
): void {
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + (i - n / 2) * sz * (0.1 + r() * 0.06);
    const ph = sz * (0.35 + r() * 0.3);
    const tri = [
      { x: px - ph * 0.2, y: ground + 2 },
      { x: px, y: ground - ph },
      { x: px + ph * 0.2, y: ground + 2 },
    ];
    c.save();
    clipTo(c, tri);
    c.fillStyle = 'rgba(243,239,230,0.9)';
    c.fill();
    hatchBox(c, { x: px - ph * 0.2, y: ground - ph, w: ph * 0.2, h: ph }, -1.0, 2.6, 0.3, r, 0.8);
    c.restore();
    stroke(c, tri, PEN(0.42), 1.2, r, 0.4);
    stroke(c, line(px, ground + 2, px, ground - ph * 0.1), PEN(0.42), 1.4, r, 0.2);
  }
}

export function paintNotebookFar({ c, w, h, u }: LayerCanvas, r: Rand): void {
  const seed = Math.floor(r() * 1e6);
  // A faint second range behind, then the main rolling line.
  const back = hillProfile(-20, w + 20, h - u * 0.6, u * 0.12, seed + 7);
  stroke(c, back, PEN(0.18), 1.2, r, 1.2);
  const hills = hillProfile(-20, w + 20, h - u * 0.46, u * 0.15, seed);
  // Body: light ballpoint hatching under the ridge that fades out downward.
  c.save();
  clipTo(c, [...hills, { x: w + 20, y: h }, { x: -20, y: h }]);
  hatchBox(c, { x: 0, y: h - u * 0.65, w, h: u * 0.65 }, -0.95, 7, 0.0, r, 0.9);
  c.strokeStyle = PEN(0.13);
  c.lineWidth = 0.9;
  for (let x = -u * 0.2; x < w; x += 6 + r() * 4) {
    const y0 = yAt(hills, Math.max(0, x)) + 6;
    const len = u * (0.05 + r() * 0.05);
    c.beginPath();
    c.moveTo(x, y0);
    c.lineTo(x - len * 0.6, y0 + len);
    c.stroke();
  }
  c.globalCompositeOperation = 'destination-out';
  const fade = c.createLinearGradient(0, h - u * 0.5, 0, h - u * 0.22);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = fade;
  c.fillRect(0, h - u * 0.5, w, u * 0.5);
  c.restore();
  pen(c, hills, 0.36, 1.7, r);
  // Shade the slopes that face away from the light (rising to the right).
  edgeHatch(c, hills, PEN, 0.2, u * 0.035, 6, r, (i) => {
    const a = hills[i - 1],
      b = hills[i + 1];
    return !!a && !!b && b.y < a.y - 0.6;
  });
  // A few field lines and a winding path on the near slopes.
  for (const x of scatter(r, 0, w, u * 0.9, [1, 1])) {
    const y = yAt(hills, x) + u * (0.03 + r() * 0.04);
    const len = u * (0.08 + r() * 0.12);
    stroke(c, line(x, y, x + len, y + (r() - 0.5) * u * 0.02), PEN(0.16), 1, r, 1.2);
  }
  // Landmarks perched on the ridge, far apart.
  const kinds = [castle, windmill, chapel, tinyPines, windmill, tinyPines, castle, chapel];
  let k = Math.floor(r() * kinds.length);
  for (const x of scatter(r, u * 0.2, w - u * 0.1, u * 1.05, [1, 1])) {
    const ground = yAt(hills, x) + 2;
    const draw = kinds[k++ % kinds.length] ?? castle;
    draw(c, x, ground, u * (0.15 + r() * 0.05), r);
    if (r() < 0.6)
      tinyPines(c, x + u * (0.09 + r() * 0.08), yAt(hills, x + u * 0.12) + 2, u * 0.1, r);
  }
}

// --- mid: pencil trees, fences, cottages -----------------------------------------------------------

function roundTree(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
  a: number,
): void {
  const crownR = sz * (0.32 + r() * 0.12);
  const cy = ground - sz * 0.62;
  const lean = (r() - 0.5) * sz * 0.06;
  // Trunk with a fork into the crown.
  stroke(
    c,
    [
      { x: x - sz * 0.035, y: ground + 2 },
      { x: x - sz * 0.03 + lean, y: cy + crownR * 0.4 },
    ],
    LEAD(a),
    1.4,
    r,
    0.4,
  );
  stroke(
    c,
    [
      { x: x + sz * 0.035, y: ground + 2 },
      { x: x + sz * 0.03 + lean, y: cy + crownR * 0.4 },
    ],
    LEAD(a),
    1.4,
    r,
    0.4,
  );
  stroke(
    c,
    line(x + lean, cy + crownR * 0.5, x + lean + sz * 0.1, cy + crownR * 0.1),
    LEAD(a * 0.8),
    1.1,
    r,
    0.4,
  );
  const crown = puff(x + lean, cy, crownR * 1.05, crownR * 0.9, 7 + Math.floor(r() * 4), r);
  c.save();
  clipTo(c, crown);
  c.fillStyle = 'rgba(243,239,230,0.85)';
  c.fill();
  // Shade the lower-left of the crown.
  c.save();
  c.beginPath();
  c.ellipse(
    x + lean - crownR * 0.35,
    cy + crownR * 0.4,
    crownR * 1.05,
    crownR * 0.75,
    0,
    0,
    Math.PI * 2,
  );
  c.clip();
  hatchBox(c, boxOf(crown), -0.9, 4.2, a * 0.5, r, 0.9);
  c.restore();
  c.restore();
  stroke(c, crown, LEAD(a), 1.5, r, 0.6, true);
  // A few leaf-cluster curls inside.
  for (let i = 0; i < 3; i++) {
    const lx = x + lean + (r() - 0.5) * crownR,
      ly = cy + (r() - 0.6) * crownR * 0.8;
    c.strokeStyle = LEAD(a * 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(lx, ly, crownR * 0.22, Math.PI * 0.9, Math.PI * 1.9);
    c.stroke();
  }
}

function fence(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
  a: number,
): void {
  const posts = 3 + Math.floor(r() * 4);
  const tops: Pt[] = [];
  let px = x;
  for (let i = 0; i < posts; i++) {
    const ph = sz * (0.17 + r() * 0.04);
    const tilt = (r() - 0.5) * sz * 0.03;
    stroke(c, line(px, ground + 2, px + tilt, ground - ph), LEAD(a), 1.6, r, 0.3);
    tops.push({ x: px + tilt, y: ground - ph });
    px += sz * (0.16 + r() * 0.08);
  }
  for (const drop of [0.25, 0.6]) {
    for (let i = 0; i < tops.length - 1; i++) {
      const p = tops[i] as Pt,
        q = tops[i + 1] as Pt;
      const y0 = p.y + (ground - p.y) * drop,
        y1 = q.y + (ground - q.y) * drop;
      stroke(
        c,
        [
          { x: p.x, y: y0 },
          { x: (p.x + q.x) / 2, y: (y0 + y1) / 2 + sz * 0.012 },
          { x: q.x, y: y1 },
        ],
        LEAD(a * 0.75),
        1,
        r,
        0.3,
      );
    }
  }
}

function cottage(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
  a: number,
): void {
  const bw = sz * 0.42,
    bh = sz * 0.26;
  const body = [
    { x: x - bw / 2, y: ground + 2 },
    { x: x - bw / 2, y: ground - bh },
    { x: x + bw / 2, y: ground - bh },
    { x: x + bw / 2, y: ground + 2 },
  ];
  c.save();
  clipTo(c, body);
  c.fillStyle = 'rgba(243,239,230,0.85)';
  c.fill();
  c.restore();
  stroke(c, body, LEAD(a), 1.5, r, 0.4);
  const roof = [
    { x: x - bw * 0.62, y: ground - bh },
    { x: x - bw * 0.05, y: ground - bh - sz * 0.24 },
    { x: x + bw * 0.62, y: ground - bh },
  ];
  c.save();
  clipTo(c, roof);
  c.fillStyle = 'rgba(243,239,230,0.85)';
  c.fill();
  hatchBox(c, boxOf(roof), -1.1, 4, a * 0.45, r, 0.9);
  c.restore();
  stroke(c, roof, LEAD(a), 1.6, r, 0.4);
  // Chimney with a smoke curl.
  const cx = x + bw * 0.24;
  const cyTop = ground - bh - sz * 0.2;
  stroke(
    c,
    [
      { x: cx - sz * 0.03, y: ground - bh - sz * 0.1 },
      { x: cx - sz * 0.03, y: cyTop },
      { x: cx + sz * 0.03, y: cyTop },
      { x: cx + sz * 0.03, y: ground - bh - sz * 0.06 },
    ],
    LEAD(a),
    1.3,
    r,
    0.3,
  );
  const smoke: Pt[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    smoke.push({
      x: cx + Math.sin(t * Math.PI * 3) * sz * 0.05 * (0.4 + t) + t * sz * 0.12,
      y: cyTop - t * sz * 0.4,
    });
  }
  stroke(c, smoke, LEAD(a * 0.45), 1.1, r, 0.3);
  // Window and door.
  const wx = x - bw * 0.22,
    wy = ground - bh * 0.62;
  const ws = sz * 0.07;
  stroke(
    c,
    [
      { x: wx - ws, y: wy - ws },
      { x: wx + ws, y: wy - ws },
      { x: wx + ws, y: wy + ws },
      { x: wx - ws, y: wy + ws },
    ],
    LEAD(a),
    1.2,
    r,
    0.2,
    true,
  );
  stroke(c, line(wx, wy - ws, wx, wy + ws), LEAD(a * 0.7), 0.9, r, 0.2);
  stroke(c, line(wx - ws, wy, wx + ws, wy), LEAD(a * 0.7), 0.9, r, 0.2);
  const dx = x + bw * 0.1;
  stroke(
    c,
    [
      { x: dx, y: ground + 2 },
      { x: dx, y: ground - bh * 0.6 },
      { x: dx + sz * 0.09, y: ground - bh * 0.6 },
      { x: dx + sz * 0.09, y: ground + 2 },
    ],
    LEAD(a),
    1.2,
    r,
    0.2,
  );
}

function pencilPine(
  c: CanvasRenderingContext2D,
  x: number,
  ground: number,
  sz: number,
  r: Rand,
  a: number,
): void {
  const ph = sz * (0.7 + r() * 0.4);
  const tiers = 3 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const top = ground - ph + t0 * ph * 0.75;
    const bot = top + ph * 0.38;
    const half = ph * (0.12 + t0 * 0.16);
    const tri = [
      { x: x - half, y: bot },
      { x, y: top },
      { x: x + half, y: bot },
    ];
    c.save();
    clipTo(c, tri);
    c.fillStyle = 'rgba(243,239,230,0.85)';
    c.fill();
    hatchBox(c, { x: x - half, y: top, w: half, h: bot - top }, -1.0, 3.6, a * 0.55, r, 0.9);
    c.restore();
    stroke(
      c,
      [
        { x: x - half, y: bot },
        { x: x - half * 0.2, y: bot - ph * 0.02 },
        { x, y: top },
        { x: x + half * 0.2, y: bot - ph * 0.02 },
        { x: x + half, y: bot },
      ],
      LEAD(a),
      1.4,
      r,
      0.4,
    );
  }
  stroke(c, line(x, ground + 2, x, ground - ph * 0.12), LEAD(a), 2, r, 0.2);
}

export function paintNotebookMid({ c, w, h, u }: LayerCanvas, r: Rand): void {
  const a = 0.55;
  const ground = h - u * 0.3;
  // A loose pencil ground line, broken in places.
  for (let x = -10; x < w;) {
    const len = u * (0.2 + r() * 0.5);
    const pts: Pt[] = [];
    for (let k = 0; k <= 8; k++)
      pts.push({ x: x + (len * k) / 8, y: ground + Math.sin((x + (len * k) / 8) / 37) * 2 });
    stroke(c, pts, LEAD(0.3), 1.2, r, 1);
    for (let gx = x + r() * 30; gx < x + len; gx += 18 + r() * 40) {
      const gy = ground + Math.sin(gx / 37) * 2;
      for (let k = 0; k < 3; k++)
        stroke(
          c,
          line(gx + k * 3, gy, gx + k * 3 + (k - 1) * 2, gy - 5 - r() * 5),
          LEAD(0.28),
          0.9,
          r,
          0.2,
        );
    }
    x += len + u * (0.03 + r() * 0.15);
  }
  for (const x of scatter(r, -u * 0.1, w, u * 0.55, [1, 3])) {
    const pick = r();
    const sz = u * (0.26 + r() * 0.12);
    if (pick < 0.42) roundTree(c, x, ground, sz, r, a);
    else if (pick < 0.7) pencilPine(c, x, ground, sz, r, a);
    else if (pick < 0.86) fence(c, x, ground, sz, r, a);
    else cottage(c, x, ground, sz, r, a);
  }
}

// --- near: bushes and tall grass (fastest background layer) ----------------------------------------

export function paintNotebookNear({ c, w, h, u }: LayerCanvas, r: Rand): void {
  const a = 0.62;
  const ground = h - u * 0.16;
  for (const x of scatter(r, 0, w, u * 0.75, [1, 2])) {
    if (r() < 0.55) {
      const bw = u * (0.07 + r() * 0.07);
      const bh = bw * (0.55 + r() * 0.2);
      const bush = puff(x, ground - bh * 0.5, bw, bh, 6 + Math.floor(r() * 4), r).filter(
        (p) => p.y <= ground,
      );
      bush.push({ x: x + bw * 0.9, y: ground }, { x: x - bw * 0.9, y: ground });
      c.save();
      clipTo(c, bush);
      c.fillStyle = 'rgba(243,239,230,0.9)';
      c.fill();
      hatchBox(c, { x: x - bw, y: ground - bh, w: bw * 1.2, h: bh }, -0.85, 3.4, a * 0.55, r, 1);
      c.restore();
      stroke(c, bush, LEAD(a), 1.7, r, 0.6);
    }
    // Grass blades in a clump.
    const blades = 4 + Math.floor(r() * 6);
    for (let i = 0; i < blades; i++) {
      const bx = x + (r() - 0.5) * u * 0.08;
      const bl = u * (0.025 + r() * 0.04);
      const bend = (r() - 0.4) * bl * 0.6;
      stroke(
        c,
        [
          { x: bx, y: ground + 2 },
          { x: bx + bend * 0.4, y: ground - bl * 0.6 },
          { x: bx + bend, y: ground - bl },
        ],
        LEAD(a * 0.85),
        1.2,
        r,
        0.3,
      );
    }
  }
}

// --- foreground strip (screen space, faster than the world) ----------------------------------------

/** Sparse ink grass and weed sprigs along the bottom edge; low, so the red ink stays readable. */
export function paintNotebookForeground(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Rand,
): void {
  for (const x of scatter(r, 0, w - 40, 180, [1, 2])) {
    const blades = 5 + Math.floor(r() * 7);
    for (let i = 0; i < blades; i++) {
      const bx = x + (r() - 0.5) * 34;
      const bl = h * (0.25 + r() * 0.35);
      const bend = (r() - 0.45) * bl * 0.7;
      stroke(
        c,
        [
          { x: bx, y: h + 2 },
          { x: bx + bend * 0.35, y: h - bl * 0.6 },
          { x: bx + bend, y: h - bl },
        ],
        'rgba(22,22,26,0.88)',
        1.8,
        r,
        0.3,
      );
    }
    if (r() < 0.35) {
      // A weed with a little seed head.
      const sx = x + 10 + r() * 14;
      const top = h * (0.25 + r() * 0.15);
      stroke(
        c,
        [
          { x: sx, y: h + 2 },
          { x: sx + 3, y: (h + top) / 2 },
          { x: sx + 1, y: top },
        ],
        'rgba(22,22,26,0.88)',
        1.5,
        r,
        0.3,
      );
      c.strokeStyle = 'rgba(22,22,26,0.88)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(sx + 1, top - 4, 4, 0, Math.PI * 2);
      c.stroke();
    }
  }
}
