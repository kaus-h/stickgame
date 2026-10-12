import type * as Phaser from 'phaser';
import { metersToPixels as m, type Vec2 } from '../../core';
import type { SimEvent, SimSnapshot } from '../../sim';
import { hash, strokeInk, wobble, type Pt } from '../ink';

const INK = 0x16161a;

/**
 * Ink juice (Living Notebook pillar 3): the pen reacts to the player. Pure presentation built
 * from simulation events and snapshots; it never feeds back into the simulation. All randomness
 * is seeded from the event tick, so a replay draws the same marks.
 */
type MarkKind = 'dust' | 'kick' | 'blot' | 'flick';
export interface InkMark {
  readonly kind: MarkKind;
  readonly at: Pt; // world px
  readonly dir: Pt; // unit direction the mark throws toward
  readonly size: number; // world px
  readonly life: number; // s
  readonly seed: number;
  age: number;
}

/** Below this landing speed (m/s) a landing is a step, not an impact. */
export const DUST_MIN_SPEED = 4;
/** Speed hatching appears above this speed (m/s): faster than a run. */
export const SPEED_LINES_FROM = 9.5;
/** The rope draws itself on from the hand to the anchor over this long (s). Visual only. */
export const ROPE_DRAW_ON = 0.07;

export class InkJuice {
  private marks: InkMark[] = [];
  private pending: SimEvent[] = [];
  /** Seconds since the current rope attached (for the draw-on), or null without a rope. */
  private ropeAge: number | null = null;

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'reset' || e.type === 'respawn') {
        this.marks = [];
        this.pending = [];
        this.ropeAge = null;
      } else if (
        e.type === 'land' ||
        e.type === 'jump' ||
        e.type === 'ropeAttach' ||
        e.type === 'ropeRelease'
      )
        this.pending.push(e);
    }
  }

  /** Resolve queued events against the latest snapshot, age marks, and track the rope draw-on. */
  update(dt: number, s: SimSnapshot, calm: boolean): void {
    const p = { x: m(s.player.position.x), y: m(s.player.position.y) };
    const r = m(0.35);
    for (const e of this.pending) {
      const seed = e.tick * 0.618;
      if (e.type === 'land' && e.speed >= DUST_MIN_SPEED) {
        const size = Math.min(1, (e.speed - DUST_MIN_SPEED) / 14) * r * 1.2 + r * 0.55;
        for (const side of [-1, 1])
          this.marks.push({
            kind: 'dust',
            at: { x: p.x + side * r * 0.5, y: p.y + r },
            dir: { x: side, y: -0.25 },
            size: calm ? size * 0.6 : size,
            life: 0.42,
            seed: seed + side,
            age: 0,
          });
      } else if (e.type === 'jump') {
        const back = s.player.velocity.x > 0.5 ? -1 : s.player.velocity.x < -0.5 ? 1 : 0;
        this.marks.push({
          kind: 'kick',
          at: { x: p.x, y: p.y + r },
          dir: { x: back, y: 1 },
          size: r * 0.9,
          life: 0.22,
          seed,
          age: 0,
        });
      } else if (e.type === 'ropeAttach' && s.rope) {
        const at = { x: m(s.rope.point.x), y: m(s.rope.point.y) };
        const len = Math.hypot(at.x - p.x, at.y - p.y) || 1;
        this.marks.push({
          kind: 'blot',
          at,
          dir: { x: (at.x - p.x) / len, y: (at.y - p.y) / len },
          size: m(0.22),
          life: 0.55,
          seed,
          age: 0,
        });
        this.ropeAge = 0;
      } else if (e.type === 'ropeRelease') {
        const v = e.velocity;
        const sp = Math.hypot(v.x, v.y) || 1;
        this.marks.push({
          kind: 'flick',
          at: p,
          dir: { x: v.x / sp, y: v.y / sp },
          size: m(Math.min(0.9, 0.25 + sp * 0.03)),
          life: 0.2,
          seed,
          age: 0,
        });
        this.ropeAge = null;
      }
    }
    this.pending = [];
    if (!s.rope) this.ropeAge = null;
    else if (this.ropeAge !== null) this.ropeAge += dt;
    this.marks = this.marks.filter((k) => (k.age += dt) < k.life);
  }

  /** 0..1: how much of the rope is drawn, from the hand toward the anchor. */
  ropeDrawn(calm: boolean): number {
    if (calm || this.ropeAge === null) return 1;
    return Math.min(1, this.ropeAge / ROPE_DRAW_ON);
  }

  get active(): readonly InkMark[] {
    return this.marks;
  }

  draw(
    g: Phaser.GameObjects.Graphics,
    player: Pt,
    velocity: Vec2,
    line: number,
    calm: boolean,
  ): void {
    for (const k of this.marks) drawMark(g, k, line);
    if (!calm) drawSpeedHatching(g, player, velocity, line);
  }
}

function drawMark(g: Phaser.GameObjects.Graphics, k: InkMark, line: number): void {
  const t = k.age / k.life;
  const fade = 1 - t * t;
  const ease = 1 - (1 - t) * (1 - t) * (1 - t);
  if (k.kind === 'dust') {
    // Two or three curly scribble loops rolling outward and up, like a pen doodling a puff.
    for (let i = 0; i < 3; i++) {
      const spread = k.size * (0.4 + ease * 1.1) * (0.7 + i * 0.35);
      const cx = k.at.x + k.dir.x * spread;
      const cy = k.at.y - k.size * (0.15 + ease * 0.45) * (1 + i * 0.3) + i * 2;
      const rad = k.size * (0.22 + 0.16 * i) * (0.6 + ease * 0.6);
      const loop: Pt[] = [];
      const turns = 1.4;
      for (let a = 0; a <= 18; a++) {
        const th = (a / 18) * Math.PI * 2 * turns + hash(k.seed + i) * 6;
        const rr = rad * (0.75 + 0.25 * Math.sin(a * 0.9 + k.seed));
        loop.push({
          x: cx + Math.cos(th) * rr + (a / 18) * rad * 0.6 * k.dir.x,
          y: cy + Math.sin(th) * rr * 0.7,
        });
      }
      strokeInk(
        g,
        wobble(loop, k.seed + i, line * 0.4, rad * 0.6),
        line * 0.7,
        INK,
        0.75 * fade,
        i,
      );
    }
  } else if (k.kind === 'kick') {
    // Three short pen ticks splayed under the feet, thrown back against the run.
    for (let i = -1; i <= 1; i++) {
      const ang = Math.PI / 2 + i * 0.55 + k.dir.x * 0.5;
      const len = k.size * (0.6 + 0.5 * hash(k.seed + i)) * (0.5 + ease);
      const from = { x: k.at.x + Math.cos(ang) * k.size * 0.25 * ease, y: k.at.y + 1 };
      const to = {
        x: from.x - Math.cos(ang) * len * 0.2 + i * len * 0.5,
        y: from.y + Math.sin(ang) * len * 0.35,
      };
      strokeInk(g, [from, to], line * 0.8, INK, 0.85 * fade, i);
    }
  } else if (k.kind === 'blot') {
    // The rope bites: an ink blot swells at the anchor and flings droplets back along the rope.
    const swell = Math.min(1, t * 6);
    const blob: Pt[] = [];
    for (let a = 0; a < 14; a++) {
      const th = (a / 14) * Math.PI * 2;
      const rr = k.size * swell * (0.55 + 0.45 * hash(k.seed + a * 0.37)) * (1 - t * 0.5);
      blob.push({ x: k.at.x + Math.cos(th) * rr, y: k.at.y + Math.sin(th) * rr });
    }
    g.fillStyle(INK, 0.85 * fade).fillPoints(
      blob as unknown as Parameters<Phaser.GameObjects.Graphics['fillPoints']>[0],
      true,
    );
    for (let i = 0; i < 6; i++) {
      const spread = (hash(k.seed + i * 1.7) - 0.5) * 1.6;
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      const dx = -(k.dir.x * c - k.dir.y * s);
      const dy = -(k.dir.x * s + k.dir.y * c);
      const dist = k.size * (1.2 + 2.6 * hash(k.seed + i)) * ease;
      const r = k.size * (0.08 + 0.12 * hash(k.seed + i * 3.1)) * (1 - t * 0.6);
      g.fillStyle(INK, 0.8 * fade).fillCircle(k.at.x + dx * dist, k.at.y + dy * dist, r);
    }
  } else {
    // Release: a quick pen flick off the hand along the new velocity.
    const len = k.size * (0.4 + ease);
    const side = { x: -k.dir.y, y: k.dir.x };
    const pts: Pt[] = [0, 0.5, 1].map((u) => ({
      x: k.at.x - k.dir.x * len * u + side.x * Math.sin(u * Math.PI) * len * 0.18,
      y: k.at.y - k.dir.y * len * u + side.y * Math.sin(u * Math.PI) * len * 0.18,
    }));
    strokeInk(g, pts, line * 0.9 * (1 - t), INK, 0.8 * fade, k.seed);
  }
}

/** Manga-style hatching trailing fast motion: more, longer lines the faster the hero goes. */
export function drawSpeedHatching(
  g: Phaser.GameObjects.Graphics,
  player: Pt,
  velocity: Vec2,
  line: number,
): void {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < SPEED_LINES_FROM) return;
  const k = Math.min(1, (speed - SPEED_LINES_FROM) / 14);
  const ux = velocity.x / speed;
  const uy = velocity.y / speed;
  const nx = -uy;
  const ny = ux;
  const r = m(0.35);
  const count = 2 + Math.round(k * 3);
  for (let i = 0; i < count; i++) {
    const off = (i / (count - 1) - 0.5) * r * 1.8 + (hash(i * 3.3) - 0.5) * r * 0.3;
    const start = r * (1.1 + 0.4 * hash(i + 0.5));
    const len = r * (1.2 + k * 3.2) * (0.6 + 0.4 * hash(i * 1.9));
    const a = { x: player.x - ux * start + nx * off, y: player.y - uy * start + ny * off };
    const b = { x: a.x - ux * len, y: a.y - uy * len };
    strokeInk(g, [a, b], line * (0.55 + 0.3 * k), INK, 0.35 + 0.35 * k, i);
  }
}
