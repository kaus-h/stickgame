import type * as Phaser from 'phaser';
import { metersToPixels as m, type Vec2 } from '../core';
import type { SimEvent, SimSnapshot } from '../sim';
import { hatchPolygon, strokeInk, wobble, type Pt } from './ink';

const INK = 0x16161a;
const PAPER = 0xf3efe6;
const SHAKE_TICKS = 10;
const CRACK_TICKS = 5;
const SHATTER_TICKS = 26;
type ImpactTarget = SimSnapshot['targets'][number];

export interface TargetVisual {
  /** Presentation offsets in pixels, never simulation state. */
  readonly offset: Pt;
  /** null is an intact disk; 0 is a crack; 1 is the end of the shatter. */
  readonly shatter: number | null;
}

/** Short tick-driven feedback, separate from the living-ink system and authoritative hp. */
export class ImpactTargetFeedback {
  private readonly impacts = new Map<string, { tick: number; broken: boolean }>();

  clear(): void {
    this.impacts.clear();
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'reset' || event.type === 'respawn') this.clear();
      if (event.type === 'targetHit' || event.type === 'targetBroken')
        this.impacts.set(event.id, { tick: event.tick, broken: event.type === 'targetBroken' });
    }
  }

  visual(target: ImpactTarget, tick: number, reducedMotion: boolean): TargetVisual | null {
    const impact = this.impacts.get(target.id);
    const age = impact ? Math.max(0, tick - impact.tick) : Infinity;
    if (age >= SHATTER_TICKS) this.impacts.delete(target.id);
    if (target.hp === 0) {
      // Reduced motion removes the broken disk immediately: no shaking or flying fragments.
      if (reducedMotion || !impact?.broken || age >= SHATTER_TICKS) return null;
      return {
        offset: { x: 0, y: 0 },
        shatter: Math.max(0, (age - CRACK_TICKS) / (SHATTER_TICKS - CRACK_TICKS)),
      };
    }
    const amount = reducedMotion || age >= SHAKE_TICKS ? 0 : 3 * (1 - age / SHAKE_TICKS);
    return {
      offset:
        amount === 0
          ? { x: 0, y: 0 }
          : { x: Math.sin(age * 2.4 + 1) * amount, y: Math.sin(age * 3.1) * amount * 0.35 },
      shatter: null,
    };
  }
}

/** Solid hatched plate with a filled centre, distinct from a hollow rope-anchor ring. */
export function targetMarks(
  position: Vec2,
  radius: number,
  seed: number,
): {
  readonly body: readonly Pt[];
  readonly centre: Pt;
  readonly radius: number;
  readonly crack: readonly Pt[];
} {
  const centre = { x: m(position.x), y: m(position.y) };
  const r = m(radius);
  const points = Array.from({ length: 33 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 32;
    return { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r };
  });
  return {
    body: wobble(points, seed, Math.min(1.2, r * 0.04), Math.max(3, r * 0.3)),
    centre,
    radius: r,
    crack: [
      { x: centre.x - r * 0.55, y: centre.y - r * 0.78 },
      { x: centre.x - r * 0.14, y: centre.y - r * 0.17 },
      { x: centre.x + r * 0.22, y: centre.y - r * 0.31 },
      { x: centre.x - r * 0.04, y: centre.y + r * 0.21 },
      { x: centre.x + r * 0.45, y: centre.y + r * 0.88 },
    ],
  };
}

/** Stable per-target ink; repeated frames do not shimmer. */
export function impactTargetSeed(id: string): number {
  let seed = 19;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
  return seed;
}

function plate(
  g: Phaser.GameObjects.Graphics,
  body: readonly Pt[],
  radius: number,
  seed: number,
  alpha: number,
): void {
  g.fillStyle(PAPER, alpha).fillPoints(
    body.map((p) => ({ ...p })) as Parameters<Phaser.GameObjects.Graphics['fillPoints']>[0],
    true,
  );
  hatchPolygon(g, body, Math.max(3, radius * 0.18), 0.8, 1, INK, alpha * 0.8, seed);
  hatchPolygon(g, body, Math.max(4, radius * 0.25), -0.8, 1, INK, alpha * 0.45, seed + 9);
  strokeInk(g, body, Math.max(1.5, radius * 0.065), INK, alpha, seed);
}

/** Placeholder impact bullseye and crack/shatter. Uses only existing ink helpers and colours. */
export function drawImpactTarget(
  g: Phaser.GameObjects.Graphics,
  target: ImpactTarget,
  position: Vec2,
  visual: TargetVisual,
): void {
  const seed = impactTargetSeed(target.id);
  const marks = targetMarks(position, target.radius, seed);
  const c = { x: marks.centre.x + visual.offset.x, y: marks.centre.y + visual.offset.y };
  const r = marks.radius;
  const shatter = visual.shatter;
  if (shatter !== null && shatter > 0) {
    // Six irregular pie fragments move away from the former bullseye, then fade out.
    const alpha = 1 - shatter;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const b = a + Math.PI / 3;
      const mid = (a + b) / 2;
      const travel = r * 1.4 * shatter;
      const x = c.x + Math.cos(mid) * travel;
      const y = c.y + Math.sin(mid) * travel + r * shatter * shatter;
      const arc = Array.from({ length: 7 }, (_, k) => {
        const angle = a + ((b - a) * k) / 6 + shatter * (i % 2 ? 0.45 : -0.45);
        return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
      });
      plate(g, [{ x, y }, ...arc, { x, y }], r, seed + i, alpha);
    }
    return;
  }
  plate(
    g,
    marks.body.map((p) => ({ x: p.x + visual.offset.x, y: p.y + visual.offset.y })),
    r,
    seed,
    1,
  );
  // A paper diamond and solid ink dot give an unmistakable centre without an anchor's ring.
  const diamond = [
    { x: c.x, y: c.y - r * 0.48 },
    { x: c.x + r * 0.48, y: c.y },
    { x: c.x, y: c.y + r * 0.48 },
    { x: c.x - r * 0.48, y: c.y },
    { x: c.x, y: c.y - r * 0.48 },
  ];
  g.fillStyle(PAPER, 1).fillPoints(
    diamond as Parameters<Phaser.GameObjects.Graphics['fillPoints']>[0],
    true,
  );
  strokeInk(g, diamond, 1.5, INK, 1, seed + 3);
  g.fillStyle(INK, 1).fillCircle(c.x, c.y, Math.max(2, r * 0.18));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    strokeInk(
      g,
      [0.63, 0.9].map((length) => ({
        x: c.x + Math.cos(a) * r * length,
        y: c.y + Math.sin(a) * r * length,
      })),
      2,
      INK,
      1,
      seed + i,
    );
  }
  if (shatter !== null) {
    strokeInk(g, marks.crack, 4, PAPER, 1, seed);
    strokeInk(g, marks.crack, 1.5, INK, 1, seed);
  }
}
