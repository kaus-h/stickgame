import { metersToPixels as m } from '../../core';
import type { ExitDef, LevelDef } from '../../sim';
import { hash, wobble, type Pt } from '../ink';

/**
 * The exit as a full-resolution ink drawing (owner playtest, 2026-10-12: the bitmap hut read low
 * resolution beside the vector ink). A small hand-drawn doorhouse whose arch is coloured in with
 * highlighter and spills light onto the page: the goal reads from across the level and invites
 * the hero in. Collision is untouched; the drawing is aligned to the authored mouth.
 */

const INK = '#16161a';
const PAPER = '#f3efe6';
const PENCIL = 'rgba(22, 22, 26, 0.42)';
const GLOW = '255, 225, 74';

export interface DoorOpening {
  /** Left edge of the arch opening, px. */
  readonly x: number;
  /** Floor line under the opening, px. */
  readonly floor: number;
  readonly w: number;
  readonly h: number;
}

/** Where the arch stands: on the mouth's floor, at the entry side (or centred in a shaft). */
export function doorOpening(exit: ExitDef, maxOpening: number): DoorOpening {
  const side = exit.entry.side;
  const floor = m(exit.max.y);
  if (side === 'top' || side === 'bottom') {
    // Shafts: the house stands upright on the compartment floor under the mouth (GMR-56).
    const h = Math.min(m(exit.max.y - exit.min.y) * 0.6, m(maxOpening));
    const w = h * 0.56;
    return { x: m((exit.min.x + exit.max.x) / 2) - w / 2, floor, w, h };
  }
  // A lintel's worth of wall stays inside the mouth, so an overhang above can roof the house.
  const h = Math.min(m(exit.max.y - exit.min.y) * 0.86, m(maxOpening));
  const w = h * 0.56;
  const x = side === 'left' ? m(exit.min.x) + h * 0.1 : m(exit.max.x) - h * 0.1 - w;
  return { x, floor, w, h };
}

/** The lowest solid over the arch head within reach: the house tucks under it as its roof. */
function ceilingAbove(level: LevelDef, left: number, right: number, top: number): number | null {
  let best: number | null = null;
  for (const s of level.solids) {
    if (s.kind !== 'solid') continue;
    const xs = s.points.map((p) => m(p.x)),
      ys = s.points.map((p) => m(p.y));
    const bottom = Math.max(...ys);
    if (Math.max(...xs) <= left || Math.min(...xs) >= right) continue;
    if (bottom > top - 4 || top - bottom > m(1.6)) continue;
    if (best === null || bottom > best) best = bottom;
  }
  return best;
}

function ink(
  c: CanvasRenderingContext2D,
  pts: readonly Pt[],
  width: number,
  seed: number,
  colour = INK,
  amp = 0.7,
): void {
  const line = wobble(pts, seed, amp, 9);
  c.strokeStyle = colour;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i] as Pt,
      b = line[i + 1] as Pt;
    c.lineWidth = width * (0.8 + 0.4 * hash(i * 0.61 + seed));
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
}

/** Arch outline: up the left jamb, over a half-round head, down the right jamb. */
function archPoints(x: number, floor: number, w: number, h: number, steps = 18): Pt[] {
  const r = w / 2,
    spring = floor - h + r;
  const pts: Pt[] = [{ x, y: floor }];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (Math.PI * i) / steps;
    pts.push({ x: x + r + Math.cos(a) * r, y: spring + Math.sin(a) * r });
  }
  pts.push({ x: x + w, y: floor });
  return pts;
}

function pathPoly(c: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  c.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.closePath();
}

/** Quick parallel pen hatching inside the current clip. */
function hatch(
  c: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  spacing: number,
  slope: number,
  alpha: number,
  seed: number,
): void {
  c.strokeStyle = `rgba(22, 22, 26, ${String(alpha)})`;
  c.lineWidth = 0.8;
  const span = box.w + box.h * Math.abs(slope);
  for (let d = -box.h * Math.abs(slope); d < span; d += spacing) {
    const j = (hash(d * 0.37 + seed) - 0.5) * spacing * 0.5;
    c.beginPath();
    c.moveTo(box.x + d + j, box.y + box.h);
    c.lineTo(box.x + d + j + box.h * slope, box.y);
    c.stroke();
  }
}

export function paintExitDoor(
  c: CanvasRenderingContext2D,
  level: LevelDef,
  maxOpening: number,
): void {
  const exit = level.exit;
  if (!exit || !('entry' in exit)) return;
  const { x, floor, w, h } = doorOpening(exit, maxOpening);
  const top = floor - h;
  const cx = x + w / 2;
  const t = h * 0.15; // wall thickness around the arch
  const left = x - t,
    right = x + w + t;
  const ceiling = ceilingAbove(level, left, right, top);
  const roofLine = ceiling ?? top - t;
  const seed = Math.round(exit.min.x * 7 + exit.min.y * 13);

  c.save();
  // 1. Light spilling onto the page, kept above the floor line.
  // Under an overhang the light stops at the beam; in the open it rises above the gable.
  const sky = ceiling === null ? roofLine - h * 1.5 : roofLine;
  c.save();
  c.beginPath();
  c.rect(cx - h * 2, sky, h * 4, floor - sky);
  c.clip();
  const glow = c.createRadialGradient(
    cx,
    floor - h * 0.45,
    h * 0.15,
    cx,
    floor - h * 0.45,
    h * 1.25,
  );
  glow.addColorStop(0, `rgba(${GLOW}, 0.42)`);
  glow.addColorStop(0.55, `rgba(${GLOW}, 0.16)`);
  glow.addColorStop(1, `rgba(${GLOW}, 0)`);
  c.fillStyle = glow;
  c.fillRect(cx - h * 2, sky, h * 4, floor - sky);
  // Pencil rays: the comic shorthand for light, broken like quick strokes.
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (1.08 + (0.84 * i) / 10) + (hash(seed + i * 3.1) - 0.5) * 0.08;
    const r0 = h * (0.78 + 0.1 * hash(seed + i * 1.7)),
      r1 = r0 + h * (0.18 + 0.16 * hash(seed + i * 2.9));
    const ox = cx,
      oy = floor - h * 0.45;
    ink(
      c,
      [
        { x: ox + Math.cos(a) * r0, y: oy + Math.sin(a) * r0 },
        { x: ox + Math.cos(a) * r1, y: oy + Math.sin(a) * r1 },
      ],
      0.9,
      seed + i,
      PENCIL,
      0.4,
    );
  }
  c.restore();

  // 2. The house body: paper over the glow, then hatched walls.
  const body: Pt[] = [
    { x: left, y: floor },
    { x: left, y: roofLine },
    { x: right, y: roofLine },
    { x: right, y: floor },
  ];
  const gable: Pt[] | null =
    ceiling === null
      ? [
          { x: left - t * 0.7, y: roofLine },
          { x: cx, y: roofLine - h * 0.34 },
          { x: right + t * 0.7, y: roofLine },
        ]
      : null;
  c.fillStyle = PAPER;
  pathPoly(c, body);
  c.fill();
  c.save();
  pathPoly(c, body);
  c.clip();
  hatch(c, { x: left, y: roofLine, w: right - left, h: floor - roofLine }, 5, 0.9, 0.38, seed);
  c.restore();
  if (gable) {
    c.fillStyle = PAPER;
    pathPoly(c, gable);
    c.fill();
    c.save();
    pathPoly(c, gable);
    c.clip();
    const gb = { x: left - t, y: roofLine - h * 0.34, w: right - left + 2 * t, h: h * 0.34 };
    hatch(c, gb, 3.5, 0.9, 0.55, seed + 5);
    hatch(c, gb, 4.5, -0.9, 0.4, seed + 9);
    c.restore();
  }

  // 3. The arch, coloured in with highlighter: brightest low in the middle, like a lit room.
  const arch = archPoints(x, floor, w, h);
  c.save();
  pathPoly(c, arch);
  c.clip();
  const lit = c.createRadialGradient(cx, floor - h * 0.3, h * 0.05, cx, floor - h * 0.3, h * 0.8);
  lit.addColorStop(0, '#fff8d6');
  lit.addColorStop(0.6, '#ffe97a');
  lit.addColorStop(1, '#f7cf3a');
  c.fillStyle = lit;
  c.fillRect(x - 2, top - 2, w + 4, h + 4);
  // Marker streaks: the highlighter was dragged up and down, overlapping a little.
  c.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const sx = x + (w * (i + 0.5)) / 7 + (hash(seed + i * 5.3) - 0.5) * 3;
    c.strokeStyle = `rgba(240, 190, 30, ${String(0.12 + 0.1 * hash(seed + i))})`;
    c.lineWidth = w / 6;
    c.beginPath();
    c.moveTo(sx, floor + 2);
    c.lineTo(sx + (hash(seed + i * 7.7) - 0.5) * 4, top - 2);
    c.stroke();
  }
  c.restore();

  // 4. Ink: two overlapping passes on the arch, a firm wall outline, a keystone and a doorstep.
  ink(c, arch, 2.2, seed + 21);
  ink(c, archPoints(x - 2.5, floor, w + 5, h + 2.5), 1, seed + 23, 'rgba(22, 22, 26, 0.7)');
  ink(c, [body[0] as Pt, body[1] as Pt], 1.8, seed + 31);
  ink(c, [body[2] as Pt, body[3] as Pt], 1.8, seed + 33);
  if (gable) {
    ink(c, [...gable, gable[0] as Pt], 1.8, seed + 35);
    ink(c, [body[1] as Pt, body[2] as Pt], 1.2, seed + 37);
  } else {
    // Tucked under an overhang: the beam above becomes its roof, with a pencil contact shadow.
    ink(c, [body[1] as Pt, body[2] as Pt], 1.4, seed + 37);
    c.save();
    c.beginPath();
    c.rect(left, roofLine, right - left, h * 0.12);
    c.clip();
    hatch(c, { x: left, y: roofLine, w: right - left, h: h * 0.12 }, 2.5, 0.5, 0.45, seed + 41);
    c.restore();
  }
  const kw = w * 0.16;
  ink(
    c,
    [
      { x: cx - kw / 2, y: top - t * 0.85 },
      { x: cx + kw / 2, y: top - t * 0.85 },
      { x: cx + kw * 0.35, y: top + 2 },
      { x: cx - kw * 0.35, y: top + 2 },
      { x: cx - kw / 2, y: top - t * 0.85 },
    ],
    1.3,
    seed + 43,
  );
  ink(
    c,
    [
      { x: left - t * 0.8, y: floor },
      { x: right + t * 0.8, y: floor },
    ],
    2.4,
    seed + 47,
  );
  ink(
    c,
    [
      { x: x + w * 0.05, y: floor - 3.5 },
      { x: x + w * 0.95, y: floor - 3.5 },
    ],
    1,
    seed + 49,
    'rgba(22, 22, 26, 0.55)',
  );

  // 5. Weeds at the corners, a few fast flicks of the pen.
  for (const [i, base] of [
    left - t * 0.2,
    left - t * 0.9,
    right + t * 0.2,
    right + t * 0.9,
  ].entries()) {
    for (let k = 0; k < 4; k++) {
      const s = seed + i * 11 + k;
      const lean = (hash(s) - 0.5) * 1.1 + (i < 2 ? -0.25 : 0.25);
      const len = h * (0.07 + 0.08 * hash(s + 0.5));
      const bx = base + (hash(s + 0.9) - 0.5) * t * 0.8;
      ink(
        c,
        [
          { x: bx, y: floor },
          { x: bx + Math.sin(lean) * len * 0.5, y: floor - len * 0.55 },
          { x: bx + Math.sin(lean) * len, y: floor - len },
        ],
        0.9,
        s,
        INK,
        0.3,
      );
    }
  }
  c.restore();
}
