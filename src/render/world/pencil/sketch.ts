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
