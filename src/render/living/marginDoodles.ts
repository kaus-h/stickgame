import type * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef } from '../../sim';
import { hash, strokeInk, type Pt } from '../ink';

/**
 * Margin doodles (Living Notebook pillar 4): the sky above the terrain is where a bored student
 * doodles. Pencil birds on a wire scatter when the hero comes close and settle back later, a sun
 * keeps an eye on the hero, clouds drift and little stars spin when the hero swings past.
 * Presentation only: never red (lethal), never highlighter (target), never ring-shaped (anchor).
 */
export type DoodleKind = 'sun' | 'birds' | 'cloud' | 'star';

export interface Doodle {
  readonly kind: DoodleKind;
  readonly x: number;
  readonly y: number;
  readonly seed: number;
}

/** Graphite: warm grey pencil, well behind the ink. */
const PENCIL = 0x6b675f;
const ALPHA = 0.6;
/** Clearance from anchors and from solids (their boxes grown by this much), meters. */
export const ANCHOR_CLEARANCE = 2.5;
export const SOLID_CLEARANCE = 1;
/** Doodles are hand animated: they update 12 times a second. */
const DOODLE_FPS = 12;
/** Birds take off when the hero is this close, then come back after SETTLE seconds. */
const SCARE_RADIUS = 4;
const SETTLE = 6;

const KIND_CYCLE: readonly DoodleKind[] = [
  'birds',
  'cloud',
  'star',
  'birds',
  'cloud',
  'birds',
  'star',
];

function levelSeed(id: string): number {
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
  return seed;
}

type PlacementLevel = Pick<LevelDef, 'id' | 'bounds' | 'solids' | 'anchors'>;

function solidBox(s: LevelDef['solids'][number]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** True when a doodle at (x, y) keeps clear of every anchor and every solid or hazard. */
export function doodleClear(level: PlacementLevel, x: number, y: number): boolean {
  for (const a of level.anchors) {
    const points = a.path ? [a.position, a.path.to] : [a.position];
    for (const p of points) if (Math.hypot(p.x - x, p.y - y) < ANCHOR_CLEARANCE) return false;
  }
  for (const s of level.solids) {
    const b = solidBox(s);
    if (
      x > b.minX - SOLID_CLEARANCE &&
      x < b.maxX + SOLID_CLEARANCE &&
      y > b.minY - SOLID_CLEARANCE &&
      y < b.maxY + SOLID_CLEARANCE
    )
      return false;
  }
  return true;
}

/** The highest ground (smallest y) under x, ignoring level-tall walls and ceilings. */
function groundTop(level: PlacementLevel, x: number): number {
  let top = level.bounds.maxY;
  for (const s of level.solids) {
    const b = solidBox(s);
    if (x < b.minX || x > b.maxX) continue;
    if (b.maxY - b.minY > (level.bounds.maxY - level.bounds.minY) * 0.8) continue; // a wall
    if (b.maxY < level.bounds.minY + (level.bounds.maxY - level.bounds.minY) * 0.45) continue; // a ceiling
    top = Math.min(top, b.minY);
  }
  return top;
}

/**
 * Deterministic doodle placement for a level: one sun near the start, then a cluster every
 * 8-14 m in the sky band between the anchors and the ground, wherever it keeps clear.
 */
export function placeDoodles(level: PlacementLevel, spawn: { x: number; y: number }): Doodle[] {
  const seed = levelSeed(level.id);
  const out: Doodle[] = [];
  const minX = level.bounds.minX + 3;
  const maxX = level.bounds.maxX - 3;
  const skyTop = level.bounds.minY + 1;
  const sun = { x: spawn.x + 6.5, y: spawn.y - 5.6 };
  if (sun.y > skyTop && doodleClear(level, sun.x, sun.y))
    out.push({ kind: 'sun', x: sun.x, y: sun.y, seed });
  let k = 0;
  for (let x = minX + 6 + 4 * hash(seed); x < maxX; x += 8 + 6 * hash(seed + k * 1.7), k++) {
    if (Math.abs(x - sun.x) < 5) continue;
    // Over a pit, measure from the ledges either side so doodles stay out of the jump arc.
    const bottom =
      Math.min(groundTop(level, x - 4), groundTop(level, x), groundTop(level, x + 4)) - 2.2;
    const top = Math.max(skyTop, bottom - 5);
    if (bottom - top < 1) continue;
    // A fixed rotation keeps the sky varied: never three of a kind in a row.
    const kind = KIND_CYCLE[(k + seed) % KIND_CYCLE.length] ?? 'birds';
    for (let attempt = 0; attempt < 4; attempt++) {
      const y = top + (bottom - top) * 0.6 * hash(seed + k * 3.7 + attempt * 0.91);
      if (doodleClear(level, x, y)) {
        out.push({ kind, x, y, seed: seed + k * 13 });
        break;
      }
    }
  }
  return out;
}

interface Hero {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly roped: boolean;
}

interface DoodleState {
  /** Seconds since the birds took off; null while perched. */
  flight: number | null;
  /** Star spin (radians) and angular speed (rad/s). */
  spin: number;
  spinSpeed: number;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, seed: number, n = 12): Pt[] {
  const pts: Pt[] = [];
  const start = hash(seed) * Math.PI * 2;
  // Overshoot a little past a full turn, like a quick pencil loop.
  for (let i = 0; i <= n + 1; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const wob = 1 + (hash(seed + i * 0.77) - 0.5) * 0.12;
    pts.push({ x: cx + Math.cos(a) * rx * wob, y: cy + Math.sin(a) * ry * wob });
  }
  return pts;
}

export class MarginDoodles {
  readonly doodles: readonly Doodle[];
  private readonly state: DoodleState[];
  private clock = 0;

  constructor(
    private readonly g: Phaser.GameObjects.Graphics,
    level: PlacementLevel,
    spawn: { x: number; y: number },
    hidden: boolean,
  ) {
    this.doodles = hidden ? [] : placeDoodles(level, spawn);
    this.state = this.doodles.map(() => ({ flight: null, spin: 0, spinSpeed: 0 }));
  }

  /** Doodles placed, and how many bird clusters are in the air (debug overlay). */
  stats(): { count: number; flying: number } {
    return {
      count: this.doodles.length,
      flying: this.state.filter((s) => s.flight !== null).length,
    };
  }

  update(dt: number, hero: Hero, calm: boolean): void {
    if (calm) return;
    this.clock += dt;
    const speed = Math.hypot(hero.vx, hero.vy);
    this.doodles.forEach((d, i) => {
      const s = this.state[i];
      if (!s) return;
      const dx = hero.x - d.x;
      const dy = hero.y - d.y;
      const near = Math.abs(dx) < SCARE_RADIUS + (speed > 9 ? 2 : 0) && Math.abs(dy) < 5;
      if (d.kind === 'birds') {
        if (s.flight === null) {
          if (near) s.flight = 0;
        } else {
          s.flight += dt;
          if (s.flight > SETTLE && Math.abs(dx) > 8) s.flight = null;
        }
      } else if (d.kind === 'star') {
        if (Math.hypot(dx, dy) < 3.5 && speed > 6) s.spinSpeed = Math.max(s.spinSpeed, 14);
        s.spin += s.spinSpeed * dt;
        s.spinSpeed *= Math.exp(-dt * 1.6);
      }
    });
  }

  draw(
    view: { x: number; y: number; width: number; height: number },
    hero: Hero,
    calm: boolean,
  ): void {
    const g = this.g;
    g.clear();
    // Hand-animated: time advances in 1/12 s steps.
    const t = calm ? 0 : Math.floor(this.clock * DOODLE_FPS) / DOODLE_FPS;
    const pad = m(3);
    this.doodles.forEach((d, i) => {
      const px = m(d.x);
      const py = m(d.y);
      if (px < view.x - pad || px > view.x + view.width + pad) return;
      if (py < view.y - pad || py > view.y + view.height + pad) return;
      const s = this.state[i];
      if (!s) return;
      if (d.kind === 'sun') this.sun(d, hero, t, calm);
      else if (d.kind === 'birds') this.birds(d, s, t);
      else if (d.kind === 'cloud') this.cloud(d, t);
      else this.star(d, s.spin);
    });
  }

  private line(points: readonly Pt[], seed: number, width = 1.4, alpha = ALPHA): void {
    strokeInk(this.g, points, width, PENCIL, alpha, seed);
  }

  private sun(d: Doodle, hero: Hero, t: number, calm: boolean): void {
    const cx = m(d.x);
    const cy = m(d.y);
    const r = m(0.72);
    this.line(ellipse(cx, cy, r, r * 0.96, d.seed, 26), d.seed, 1.7);
    // Rays turn slowly; alternate long and short.
    const turn = t * 0.25;
    for (let k = 0; k < 12; k++) {
      const a = turn + (k / 12) * Math.PI * 2;
      const r0 = r * 1.22;
      const r1 = r * (k % 2 === 0 ? 1.62 : 1.45);
      this.line(
        [
          { x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 },
          { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 },
        ],
        d.seed + k,
        1.3,
      );
    }
    // Eyes follow the hero; they squint happily while the hero swings, and blink now and then.
    const ex = r * 0.34;
    const ey = cy - r * 0.16;
    const blink = !calm && t % 4.2 < 0.13;
    const look = calm ? { x: 0, y: 0 } : { x: hero.x - d.x, y: hero.y - d.y };
    const len = Math.hypot(look.x, look.y) || 1;
    const lx = (look.x / len) * r * 0.09;
    const ly = (look.y / len) * r * 0.09;
    for (const side of [-1, 1]) {
      const x = cx + side * ex;
      if (hero.roped && !calm) {
        this.line(
          [
            { x: x - r * 0.12, y: ey + r * 0.04 },
            { x, y: ey - r * 0.08 },
            { x: x + r * 0.12, y: ey + r * 0.04 },
          ],
          d.seed + side,
          1.5,
        );
      } else if (blink) {
        this.line(
          [
            { x: x - r * 0.11, y: ey },
            { x: x + r * 0.11, y: ey },
          ],
          d.seed + side,
          1.5,
        );
      } else {
        this.line(ellipse(x, ey, r * 0.13, r * 0.15, d.seed + side * 5, 9), d.seed + side, 1.2);
        this.g.fillStyle(PENCIL, 0.8).fillCircle(x + lx, ey + ly, r * 0.06);
      }
    }
    // Smile, wider while the hero swings.
    const w = hero.roped && !calm ? 0.42 : 0.3;
    const smile: Pt[] = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6 - 0.5;
      smile.push({ x: cx + u * r * w * 2, y: cy + r * 0.3 + (0.25 - u * u) * r * w * 0.9 });
    }
    this.line(smile, d.seed + 9, 1.4);
  }

  private birds(d: Doodle, s: DoodleState, t: number): void {
    const cx = m(d.x);
    const cy = m(d.y);
    const span = m(1.5);
    // The wire: a sagging pencil line that fades out at both ends.
    const wire: Pt[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      wire.push({ x: cx - span + u * span * 2, y: cy + Math.sin(u * Math.PI) * m(0.14) });
    }
    this.line(wire, d.seed, 1.2, ALPHA * 0.8);
    const count = 3;
    for (let b = 0; b < count; b++) {
      const u = 0.22 + (b / (count - 1)) * 0.56 + (hash(d.seed + b) - 0.5) * 0.08;
      const bx = cx - span + u * span * 2;
      const by = cy + Math.sin(u * Math.PI) * m(0.14);
      const facing = hash(d.seed + b * 3.1) < 0.5 ? -1 : 1;
      if (s.flight === null) this.perched(bx, by, facing, d.seed + b * 7);
      else this.flying(bx, by, facing, s.flight, t, d.seed + b * 7, b);
    }
  }

  private perched(x: number, y: number, facing: number, seed: number): void {
    const body = m(0.21);
    const bx = x;
    const by = y - body * 0.95;
    this.line(ellipse(bx, by, body * 1.15, body * 0.8, seed, 10), seed, 1.3);
    // Head, beak, tail and a dot eye.
    const hx = bx + facing * body * 0.95;
    const hy = by - body * 0.75;
    this.line(ellipse(hx, hy, body * 0.5, body * 0.48, seed + 1, 8), seed + 1, 1.2);
    this.line(
      [
        { x: hx + facing * body * 0.45, y: hy - body * 0.05 },
        { x: hx + facing * body * 0.85, y: hy + body * 0.08 },
        { x: hx + facing * body * 0.42, y: hy + body * 0.16 },
      ],
      seed + 2,
      1.1,
    );
    this.line(
      [
        { x: bx - facing * body * 1.05, y: by - body * 0.1 },
        { x: bx - facing * body * 1.6, y: by - body * 0.45 },
      ],
      seed + 3,
      1.2,
    );
    this.g.fillStyle(PENCIL, 0.85).fillCircle(hx + facing * body * 0.12, hy - body * 0.08, 1.4);
  }

  private flying(
    x: number,
    y: number,
    facing: number,
    flight: number,
    t: number,
    seed: number,
    index: number,
  ): void {
    // Each bird lifts off a beat after the last, then climbs away along a curve.
    const f = Math.max(0, flight - index * 0.08);
    const q = Math.floor(f * DOODLE_FPS) / DOODLE_FPS;
    const fade = q < 1.2 ? 1 : Math.max(0, 1 - (q - 1.2) / 0.8);
    if (fade <= 0) return;
    const dir = facing * (0.8 + 0.4 * hash(seed));
    const fx = x + m(dir * (q * 3.2 + q * q * 0.8));
    const fy = y - m(q * 1.6 + q * q * 2.4) - m(0.2);
    const wing = m(0.26);
    // Flap on twos: wings swing between up and down.
    const flap = Math.sin((t + index * 0.21) * Math.PI * 2 * 3.2);
    const tip = -wing * 0.55 * flap;
    const pts: Pt[] = [
      { x: fx - wing, y: fy + tip },
      { x: fx - wing * 0.45, y: fy - wing * 0.25 + tip * 0.3 },
      { x: fx, y: fy },
      { x: fx + wing * 0.45, y: fy - wing * 0.25 + tip * 0.3 },
      { x: fx + wing, y: fy + tip },
    ];
    this.line(pts, seed + 5, 1.5, ALPHA * fade);
  }

  private cloud(d: Doodle, t: number): void {
    const cx = m(d.x + Math.sin(t * 0.12 + d.seed) * 0.6);
    const cy = m(d.y);
    const w = m(0.95 + 0.4 * hash(d.seed));
    // Puffs: overlapping round bumps along the top, a soft rounded belly underneath, closed.
    const puffs = 3 + Math.round(hash(d.seed + 2));
    const pts: Pt[] = [];
    const left = cx - w;
    const step = (w * 2) / puffs;
    for (let b = 0; b < puffs; b++) {
      const r =
        step * (0.62 + 0.22 * hash(d.seed + b * 1.3)) * (b === 0 || b === puffs - 1 ? 0.85 : 1.1);
      const bx = left + step * (b + 0.5);
      // Arcs overlap their neighbours, so the valleys between puffs stay high, like a cloud.
      const a0 = b === 0 ? Math.PI * 0.92 : Math.PI + 0.42;
      const a1 = b === puffs - 1 ? Math.PI * 2.08 : Math.PI * 2 - 0.42;
      for (let k = 0; k <= 7; k++) {
        const a = a0 + (k / 7) * (a1 - a0);
        const lift = b === 0 || b === puffs - 1 ? 0 : r * 0.45;
        pts.push({ x: bx + Math.cos(a) * step * 0.62, y: cy - lift + Math.sin(a) * r });
      }
    }
    const belly = m(0.16);
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push({ x: cx + w - u * w * 2, y: cy + Math.sin(u * Math.PI) * belly });
    }
    pts.push(pts[0] ?? { x: left, y: cy });
    this.line(pts, d.seed, 1.35, ALPHA * 0.85);
  }

  private star(d: Doodle, spin: number): void {
    const cx = m(d.x);
    const cy = m(d.y);
    const r = m(0.24);
    const pts: Pt[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = spin - Math.PI / 2 + (k / 10) * Math.PI * 2;
      const rr = k % 2 === 0 ? r : r * 0.45;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    this.line(pts, d.seed, 1.3);
  }
}
