import type * as Phaser from 'phaser';
import { metersToPixels as m, type Vec2 } from '../../core';
import type { PlayerMode } from '../../sim';
import { strokeInk, type Pt } from '../ink';
import { REST_ANIM, type HeroAnim } from './animator';

const HERO_INK = 0x16161a;
const PAPER = 0xf3efe6;

export interface HeroPose {
  /** Body centre in world pixels (the collision circle's centre). */
  readonly c: Pt;
  readonly facing: -1 | 1;
  readonly velocity: Vec2;
  readonly mode: PlayerMode;
  /** Where the rope hand grips, if tethered. */
  readonly hand: Pt | null;
  /** Seconds (presentation-only animation clock). */
  readonly time: number;
  /**
   * Stroke multiplier: 1 / camera zoom clamped, so lines keep a readable on-screen weight on
   * small phone screens (GMR-55 readability at gameplay scale).
   */
  readonly line: number;
  /** Line colour; default ink. The PB ghost (GMR-103) draws in pencil grey. */
  readonly ink?: number;
  /** Squash, stretch and lean (GMR-69); default the rest pose. */
  readonly anim?: HeroAnim;
  /** The head is a drawn sprite placed by the scene (heroHeadTransform); skip the ink head. */
  readonly spriteHead?: boolean;
}

/** Where the head sprite goes: world-pixel centre, display diameter and rotation (GMR-69). */
export interface HeadTransform {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rotation: number;
}

/** Head centre and radius in the body's own frame (before scale, squash and lean). */
function headLocal(c: Pt, facing: -1 | 1): { x: number; y: number; r: number } {
  return { x: c.x + facing * m(0.01), y: c.y - m(0.13), r: m(0.2) };
}

/**
 * The same transform drawHero applies to the body (art scale, squash about the feet, lean about the
 * feet), applied to the head, so a sprite head sits exactly where the ink head would.
 */
export function heroHeadTransform(p: HeroPose): HeadTransform {
  const a = p.anim ?? REST_ANIM;
  const feet = { x: p.c.x, y: p.c.y + m(0.35) };
  const h = headLocal(p.c, p.facing);
  const lx = (h.x - feet.x) * HERO_ART_SCALE * a.sx;
  const ly = (h.y - feet.y) * HERO_ART_SCALE * a.sy;
  const cos = Math.cos(a.lean);
  const sin = Math.sin(a.lean);
  return {
    x: feet.x + lx * cos - ly * sin,
    y: feet.y + lx * sin + ly * cos,
    // The sprite's circle fills about 93% of its square; its lumpy outline is ~4% outside r.
    size: (2 * h.r * HERO_ART_SCALE * Math.sqrt(a.sx * a.sy) * 1.04) / 0.93,
    rotation: a.lean * 0.6,
  };
}

/**
 * The protagonist (design reference assets/concepts/0006-hero-pose-sheet.png, style bible §5):
 * a round, slightly lumpy skull head with tearless eye holes and a stitched mouth, single-line
 * limbs, round hands and solid black boots (owner: no scarf). Speed and direction read from the
 * pose and the speed strokes behind the body.
 */
/**
 * Drawn size relative to the collision circle (GMR-55). The art is 1.3× the body and anchored at
 * the feet: it reads at phone scale, contact with the floor still looks exact, and the hitbox is
 * smaller than the drawing, so near-misses forgive rather than punish (style bible §5).
 */
export const HERO_ART_SCALE = 1.3;

export function drawHero(g: Phaser.GameObjects.Graphics, p: HeroPose): void {
  const feet = { x: p.c.x, y: p.c.y + m(0.35) };
  const a = p.anim ?? REST_ANIM;
  g.save();
  g.translateCanvas(feet.x, feet.y);
  g.rotateCanvas(a.lean);
  g.scaleCanvas(HERO_ART_SCALE * a.sx, HERO_ART_SCALE * a.sy);
  g.translateCanvas(-feet.x, -feet.y);
  // The rope is drawn to p.hand in world space; express it in the scaled frame so the drawn hand
  // lands exactly on the rope end.
  const hand = p.hand ? toBodyFrame(p.hand, feet, a) : null;
  drawHeroBody(g, { ...p, hand });
  g.restore();
}

function drawHeroBody(g: Phaser.GameObjects.Graphics, p: HeroPose): void {
  const { c, facing: face, velocity: v, mode, line: L } = p;
  const INK = p.ink ?? HERO_INK;
  const { r: headR, ...head } = headLocal(c, face);
  const neck = { x: c.x, y: c.y + m(0.06) };
  const hip = { x: c.x - face * m(0.015), y: c.y + m(0.19) };
  const speed = Math.hypot(v.x, v.y);
  const phase = c.x / m(0.4);
  const runAmt = mode === 'grounded' ? Math.min(1, Math.abs(v.x) / 6) : 0;

  // Legs with boots.
  const legLen = m(0.165);
  for (const off of [0, Math.PI]) {
    let ang: number;
    if (mode === 'grounded') ang = Math.sin(phase + off) * 0.8 * runAmt;
    else if (mode === 'tethered') ang = (off === 0 ? 0.4 : -0.15) * face + v.x * 0.02;
    else ang = v.y < 0 ? (off === 0 ? 0.6 : -0.1) * face : (off === 0 ? 0.25 : -0.3) * face;
    const knee = { x: hip.x + Math.sin(ang) * legLen, y: hip.y + Math.cos(ang) * legLen * 0.95 };
    const foot = { x: knee.x + Math.sin(ang * 0.4) * legLen * 0.85, y: knee.y + legLen * 0.72 };
    strokeInk(g, [hip, knee, foot], 2.4 * L, INK);
    // Boot: a small solid black lozenge pointing the way the hero faces.
    g.fillStyle(INK, 1);
    g.fillEllipse(foot.x + face * m(0.035), foot.y - m(0.012), m(0.1), m(0.06));
  }

  // Body.
  strokeInk(g, [neck, hip], 2.6 * L, INK);

  // Arms with round hands.
  const shoulder = { x: c.x, y: c.y + m(0.08) };
  const armLen = m(0.19);
  const hands: Pt[] = [];
  if (mode === 'tethered' && p.hand) {
    strokeInk(g, [shoulder, p.hand], 2.3 * L, INK);
    hands.push(p.hand);
    const free = { x: shoulder.x - face * armLen * 0.55, y: shoulder.y + armLen * 0.75 };
    strokeInk(g, [shoulder, free], 2.3 * L, INK);
    hands.push(free);
  } else {
    for (const off of [0, Math.PI]) {
      const ang =
        mode === 'grounded'
          ? -Math.sin(phase + off) * 0.75 * runAmt
          : off === 0
            ? -2.1 * face
            : 1.1 * face;
      const h = { x: shoulder.x + Math.sin(ang) * armLen, y: shoulder.y + Math.cos(ang) * armLen };
      strokeInk(g, [shoulder, h], 2.3 * L, INK);
      hands.push(h);
    }
  }
  g.fillStyle(INK, 1);
  for (const h of hands) g.fillCircle(h.x, h.y, m(0.028) * Math.max(1, L * 0.8));

  if (!p.spriteHead) drawInkHead(g, head, headR, face, mode, v, L, INK);
  drawSpeedLines(g, c, v, speed, L, INK);
}

/** Inverse of the body transform: a world point expressed in the unscaled body frame. */
function toBodyFrame(q: Pt, feet: Pt, a: HeroAnim): Pt {
  const dx = q.x - feet.x;
  const dy = q.y - feet.y;
  const cos = Math.cos(-a.lean);
  const sin = Math.sin(-a.lean);
  return {
    x: feet.x + (dx * cos - dy * sin) / (HERO_ART_SCALE * a.sx),
    y: feet.y + (dx * sin + dy * cos) / (HERO_ART_SCALE * a.sy),
  };
}

/** The procedural ink head (the PB ghost and labs keep it; the player uses the drawn sprites). */
function drawInkHead(
  g: Phaser.GameObjects.Graphics,
  head: Pt,
  headR: number,
  face: -1 | 1,
  mode: PlayerMode,
  v: Vec2,
  L: number,
  INK: number,
): void {
  // Head: paper fill, lumpy ink outline, underside hatching, eye holes, stitched mouth.
  g.fillStyle(PAPER, 1).fillCircle(head.x, head.y, headR);
  const ring: Pt[] = [];
  for (let k = 0; k <= 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const lump = 1 + 0.035 * Math.sin(a * 3 + 0.7) + 0.02 * Math.sin(a * 5);
    ring.push({
      x: head.x + Math.cos(a) * headR * lump,
      y: head.y + Math.sin(a) * headR * 1.04 * lump,
    });
  }
  strokeInk(g, ring, 2.7 * L, INK);
  // Short cross-hatch on the shaded underside, away from the face.
  g.lineStyle(1.1 * L, INK, 0.7);
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.55 + k * 0.09) + (face > 0 ? 0.25 : -0.25);
    const r0 = headR * 0.62;
    const x0 = head.x + Math.cos(a) * r0;
    const y0 = head.y + Math.sin(a) * r0;
    g.lineBetween(x0, y0, x0 + Math.cos(a) * headR * 0.28, y0 + Math.sin(a) * headR * 0.28);
  }
  // Eyes: tall ovals, looking the way of travel (or down while falling fast).
  const look = mode === 'air' && v.y > 8 ? m(0.02) : 0;
  g.fillStyle(INK, 1);
  g.fillEllipse(head.x + face * m(0.025), head.y - m(0.025) + look, m(0.075), m(0.105));
  g.fillEllipse(head.x + face * m(0.11), head.y - m(0.025) + look, m(0.06), m(0.095));
  // Stitched mouth.
  g.lineStyle(1.5 * L, INK, 1);
  const my = head.y + m(0.095);
  g.lineBetween(head.x + face * m(0.0), my, head.x + face * m(0.14), my);
  for (let k = 0; k < 4; k++) {
    const sx = head.x + face * m(0.015 + k * 0.038);
    g.lineBetween(sx, my - m(0.026), sx, my + m(0.026));
  }
}

function drawSpeedLines(
  g: Phaser.GameObjects.Graphics,
  c: Pt,
  v: Vec2,
  speed: number,
  L: number,
  INK: number,
): void {
  // Speed lines when moving fast: three short pencil-weight dashes behind the body.
  if (speed > 9) {
    const ux = -v.x / speed;
    const uy = -v.y / speed;
    g.lineStyle(1.2 * L, INK, Math.min(0.6, (speed - 9) / 15));
    for (let k = -1; k <= 1; k++) {
      const ox = c.x + ux * m(0.42) - uy * m(0.12 * k);
      const oy = c.y + uy * m(0.42) + ux * m(0.12 * k);
      g.lineBetween(ox, oy, ox + ux * m(0.22), oy + uy * m(0.22));
    }
  }
}
