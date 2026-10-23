import { fbm1 } from './rng';

/**
 * Graphite drawing primitives for baked chapter 1 canvases (vista layers, foreground, terrain).
 * Every mark is seeded: the same inputs always bake the same drawing, and nothing animates.
 */

export type Rand = () => number;

export const graphite = (a: number): string => `rgba(34,37,44,${a.toFixed(3)})`;
export const mist = (a: number): string => `rgba(232,235,239,${a.toFixed(3)})`;

/** A hand-drawn line: slight bow and wobble, optional overshoot past both ends (construction). */
export function sketchLine(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: Rand,
  alpha: number,
  width = 1,
  overshoot = 0,
): void {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const ux = dx / len,
    uy = dy / len;
  const o0 = overshoot * r(),
    o1 = overshoot * r();
  const ax = x0 - ux * o0,
    ay = y0 - uy * o0;
  const bx = x1 + ux * o1,
    by = y1 + uy * o1;
  const bow = (r() - 0.5) * Math.min(6, len * 0.03);
  c.strokeStyle = graphite(alpha);
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(ax, ay);
  c.quadraticCurveTo((ax + bx) / 2 - uy * bow, (ay + by) / 2 + ux * bow, bx, by);
  c.stroke();
}

/** Stroke a closed or open polyline as one or more loose pencil passes. */
export function sketchPath(
  c: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  r: Rand,
  alpha: number,
  width = 1,
  passes = 1,
  jitter = 1.2,
  closed = false,
): void {
  for (let p = 0; p < passes; p++) {
    c.strokeStyle = graphite(alpha * (p === 0 ? 1 : 0.55));
    c.lineWidth = width * (p === 0 ? 1 : 0.7);
    c.beginPath();
    pts.forEach((pt, i) => {
      const x = pt.x + (r() - 0.5) * jitter * p * 2;
      const y = pt.y + (r() - 0.5) * jitter * p * 2;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    if (closed) c.closePath();
    c.stroke();
  }
}

/**
 * Parallel hatching inside the current clip: lines at `angle` (radians from +x), `spacing` apart,
 * covering the box. Spacing and pressure wander a little so it never looks ruled.
 */
export function hatchBox(
  c: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  angle: number,
  spacing: number,
  alpha: number,
  r: Rand,
  width = 0.8,
): void {
  const cx = box.x + box.w / 2,
    cy = box.y + box.h / 2;
  const reach = Math.hypot(box.w, box.h) / 2 + 2;
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  const nx = -uy,
    ny = ux;
  for (let d = -reach; d <= reach; d += spacing * (0.75 + r() * 0.5)) {
    const px = cx + nx * d,
      py = cy + ny * d;
    const cut0 = reach * (0.75 + r() * 0.25),
      cut1 = reach * (0.75 + r() * 0.25);
    c.strokeStyle = graphite(alpha * (0.6 + r() * 0.4));
    c.lineWidth = width * (0.7 + r() * 0.6);
    c.beginPath();
    c.moveTo(px - ux * cut0, py - uy * cut0);
    c.lineTo(px + ux * cut1, py + uy * cut1);
    c.stroke();
  }
}

/** Fill the current clip box with a soft vertical mist gradient from `top` (clear) to `bottom`. */
export function mistBand(
  c: CanvasRenderingContext2D,
  x: number,
  w: number,
  top: number,
  bottom: number,
  alpha: number,
): void {
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, mist(0));
  g.addColorStop(0.55, mist(alpha * 0.7));
  g.addColorStop(1, mist(alpha));
  c.fillStyle = g;
  c.fillRect(x, top, w, bottom - top);
}

/** A soft round smudge (rubbed graphite or a lighter lifted patch). */
export function smudge(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: (a: number) => string,
  alpha: number,
): void {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color(alpha));
  g.addColorStop(0.6, color(alpha * 0.45));
  g.addColorStop(1, color(0));
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

/** A tapering hanging root or vine: a curved stroke built from short segments. */
export function root(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  r: Rand,
  alpha: number,
  width = 1.4,
  sway = 1,
): void {
  const steps = Math.max(3, Math.round(length / 5));
  let px = x,
    py = y;
  const lean = (r() - 0.5) * 0.6 * sway;
  const curl = (r() - 0.5) * 0.08;
  let ang = Math.PI / 2 + lean;
  c.lineCap = 'round';
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    ang += curl + (r() - 0.5) * 0.25;
    const nx = px + Math.cos(ang) * (length / steps);
    const ny = py + Math.sin(ang) * (length / steps);
    c.strokeStyle = graphite(alpha * (1 - t * 0.55));
    c.lineWidth = Math.max(0.35, width * (1 - t * 0.8));
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(nx, ny);
    c.stroke();
    // An occasional rootlet.
    if (r() < 0.12 && t > 0.2) {
      const side = r() < 0.5 ? -1 : 1;
      const a2 = ang + side * (0.5 + r() * 0.5);
      const l2 = length * (0.08 + r() * 0.15);
      c.lineWidth = Math.max(0.3, width * 0.45 * (1 - t));
      c.beginPath();
      c.moveTo(nx, ny);
      c.quadraticCurveTo(
        nx + Math.cos(a2) * l2 * 0.6,
        ny + Math.sin(a2) * l2 * 0.6,
        nx + Math.cos(a2 + side * 0.4) * l2,
        ny + Math.sin(a2 + side * 0.4) * l2 + l2 * 0.3,
      );
      c.stroke();
    }
    px = nx;
    py = ny;
  }
}

/** A tuft of grass blades rising from (x, y). */
export function tuft(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  r: Rand,
  color: string,
  blades = 5,
  width = 1,
): void {
  c.strokeStyle = color;
  c.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const bx = x + (r() - 0.5) * height * 0.9;
    const h = height * (0.45 + r() * 0.55);
    const lean = (r() - 0.5) * h * 0.9;
    c.lineWidth = width * (0.6 + r() * 0.6);
    c.beginPath();
    c.moveTo(bx, y + 0.5);
    c.quadraticCurveTo(bx + lean * 0.2, y - h * 0.6, bx + lean, y - h);
    c.stroke();
  }
}

/** A sketched conifer: trunk line and stacked drooping zigzag tiers. */
export function pine(
  c: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  r: Rand,
  alpha: number,
  fill: boolean,
): void {
  const w = height * (0.32 + r() * 0.1);
  const tiers = 5 + Math.floor(r() * 3);
  if (fill) {
    c.fillStyle = graphite(alpha * 0.55);
    c.beginPath();
    c.moveTo(x, baseY - height);
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers;
      const y = baseY - height + t * height * 0.88;
      const half = (w / 2) * t * (0.85 + r() * 0.3);
      c.lineTo(x + half, y);
      c.lineTo(x + half * 0.45, y - height * 0.04);
    }
    for (let i = tiers; i >= 1; i--) {
      const t = i / tiers;
      const y = baseY - height + t * height * 0.88;
      const half = (w / 2) * t * (0.85 + r() * 0.3);
      c.lineTo(x - half * 0.45, y - height * 0.04);
      c.lineTo(x - half, y);
    }
    c.closePath();
    c.fill();
  }
  sketchLine(c, x, baseY, x, baseY - height, r, alpha, 0.9);
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers;
    const y = baseY - height + t * height * 0.88;
    const half = (w / 2) * t;
    sketchLine(c, x, y - height * 0.12, x + half, y + height * 0.02, r, alpha * 0.8, 0.8);
    sketchLine(c, x, y - height * 0.12, x - half, y + height * 0.02, r, alpha * 0.8, 0.8);
  }
}

/** A noisy profile: `n` points from x0 to x1 around baseline y with amplitude amp. */
export function ridge(
  x0: number,
  x1: number,
  y: number,
  amp: number,
  n: number,
  r: Rand,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let drift = 0;
  for (let i = 0; i <= n; i++) {
    drift = drift * 0.6 + (r() - 0.5) * amp;
    pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y + drift });
  }
  return pts;
}

/**
 * A finger-rubbed graphite stroke: overlapping soft ellipses along a gently bent path, thick in the
 * middle and feathered at both ends (soft smudge shapes, never round blobs).
 */
export function rubbed(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  thick: number,
  ang: number,
  bend: number,
  r: Rand,
  color: (a: number) => string,
  alpha: number,
): void {
  const steps = Math.max(4, Math.ceil(len / Math.max(2, thick * 0.5)));
  const ux = Math.cos(ang),
    uy = Math.sin(ang);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + ux * len * t - uy * bend * Math.sin(Math.PI * t) * len * 0.15;
    const py = y + uy * len * t + ux * bend * Math.sin(Math.PI * t) * len * 0.15;
    const wdt = thick * Math.sin(Math.PI * t) ** 0.6 * (0.8 + r() * 0.4) + 0.5;
    c.save();
    c.translate(px, py);
    c.rotate(ang + bend * Math.cos(Math.PI * t) * 0.3);
    c.scale(1, 0.45);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, wdt * 1.6);
    g.addColorStop(0, color(alpha * (0.35 + r() * 0.25)));
    g.addColorStop(1, color(0));
    c.fillStyle = g;
    c.fillRect(-wdt * 1.6, -wdt * 1.6, wdt * 3.2, wdt * 3.2);
    c.restore();
  }
}

/**
 * A backdrop mass tone at green level `v` (the paper is 199), cool like the sheet. Backdrop masses
 * cover what lies behind them with this instead of stacking translucent marks into mud.
 */
export const tone = (v: number, a: number): string =>
  `rgba(${(v - 4).toFixed(0)},${v.toFixed(0)},${(v + 5).toFixed(0)},${a.toFixed(3)})`;

/** Luminous mist: lighter than the paper, like graphite lifted back to the white of the sheet. */
export const haze = (a: number): string => `rgba(238,240,243,${a.toFixed(3)})`;

/** An uneven edge offset in about -1..1 along x; `scale` texture pixels per billow. */
function edgeAt(x: number, scale: number, seed: number): number {
  return fbm1(x / scale, seed) * 0.75 + fbm1(x / (scale * 0.3), seed + 31) * 0.3;
}

/** A shape from an uneven top edge down to `bottom`, filled with `fill`. */
function underEdge(
  c: CanvasRenderingContext2D,
  w: number,
  y: (x: number) => number,
  bottom: number,
  step: number,
  fill: CanvasGradient | string,
): void {
  c.beginPath();
  c.moveTo(-2, bottom);
  for (let x = -2; x < w + step; x += step) c.lineTo(x, y(x));
  c.lineTo(w + 2, bottom);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/**
 * Luminous mist pooled in a band: clear above `top`, reaching `alpha` by `full` and holding to
 * `bottom`. Soft passes with billowing, offset top edges feather it without a blur filter, and
 * rubbed horizontal streaks keep it from reading as a flat veil.
 */
export function mistBank(
  c: CanvasRenderingContext2D,
  r: Rand,
  w: number,
  top: number,
  full: number,
  bottom: number,
  alpha: number,
  billow: number,
  streaks = 1,
): void {
  const seed = Math.floor(r() * 1e6);
  const passes = 4;
  const each = 1 - (1 - alpha) ** (1 / passes);
  const rise = Math.max(1, full - top);
  for (let p = 0; p < passes; p++) {
    const y0 = top + rise * (p / passes) * 0.75;
    const g = c.createLinearGradient(0, y0 - billow, 0, y0 + rise * 0.55);
    g.addColorStop(0, haze(0));
    g.addColorStop(1, haze(each));
    underEdge(
      c,
      w,
      (x) => y0 + billow * edgeAt(x, billow * 7, seed + p * 101),
      bottom,
      Math.max(2, billow * 0.3),
      g,
    );
  }
  // Rubbed streaks: lifted horizontal strokes through the body and a few above its edge.
  const n = Math.ceil((w / (billow * 5)) * streaks);
  for (let i = 0; i < n; i++) {
    const len = billow * (4 + r() * 12);
    const x = r() * w - len / 2;
    const y = top + rise * (-0.25 + r() * 1.25);
    const thick = billow * (0.08 + r() * 0.22);
    rubbed(
      c,
      x,
      y,
      len,
      thick,
      (r() - 0.5) * 0.03,
      (r() - 0.5) * 0.2,
      r,
      haze,
      alpha * (0.4 + r() * 0.5),
    );
  }
}

/**
 * Erase this canvas's marks below an uneven line: clear by `bottom`, untouched above `top`. Masses
 * dissolve downward into whatever mist is laid over them, instead of standing on a hard base.
 */
export function fadeBelow(
  c: CanvasRenderingContext2D,
  r: Rand,
  w: number,
  top: number,
  bottom: number,
  billow: number,
): void {
  const seed = Math.floor(r() * 1e6);
  const end = c.canvas.height + 2;
  c.save();
  c.globalCompositeOperation = 'destination-out';
  for (let p = 0; p < 3; p++) {
    const y0 = top + (bottom - top) * p * 0.25;
    const g = c.createLinearGradient(0, y0 - billow, 0, bottom);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    underEdge(c, w, (x) => y0 + billow * edgeAt(x, billow * 6, seed + p * 57), end, 3, g);
  }
  c.restore();
}
