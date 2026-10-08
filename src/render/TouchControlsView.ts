import * as Phaser from 'phaser';
import { dashedInk, strokeInk, wobble, type Pt } from './ink';

const INK = 0x16161a;
const PENCIL = 0x8a8a8a;
const HIGHLIGHTER = 0xffe14a;

/**
 * What the on-screen touch controls look like this frame (GMR-27). A plain object built by the
 * app from the touch input adapter; render never imports input. Coordinates are CSS px.
 */
export interface TouchControlsViewState {
  readonly active: boolean;
  readonly scheme: string;
  readonly controls: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly pressed: boolean;
    readonly knob: { readonly x: number; readonly y: number } | null;
  }[];
  readonly reticle: { readonly x: number; readonly y: number } | null;
  readonly leaderFrom: { readonly x: number; readonly y: number } | null;
}

/**
 * Notebook-ink touch controls: inked circles doodled on the page. Idle controls are drawn in
 * pencil (they recede), pressed ones get a highlighter swipe and full black ink. Fixed to the
 * screen and drawn at 1:1 CSS px (GameScene renders scroll-factor-0 objects through its unzoomed UI camera).
 */
export class TouchControlsView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(95);
  }

  draw(state: TouchControlsViewState | null): void {
    const g = this.g;
    g.clear();
    if (!state?.active) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);

    for (const [i, c] of state.controls.entries()) {
      const p = { x: c.x, y: c.y };
      if (c.pressed) {
        g.fillStyle(HIGHLIGHTER, 0.55);
        g.fillCircle(p.x + 2, p.y + 1, c.r * 0.92);
      }
      const tone = c.pressed ? INK : PENCIL;
      const alpha = c.pressed ? 1 : 0.75;
      strokeInk(
        g,
        wobble(circle(p, c.r, 24), i * 5.1 + 2, 0.8, 9),
        c.pressed ? 3 : 2.2,
        tone,
        alpha,
        i,
      );
      this.icon(c.id, p, c.r, tone, alpha, c.knob);
    }

    if (state.reticle) {
      const r = state.reticle;
      if (state.leaderFrom) dashedInk(g, state.leaderFrom, r, 5, 6, 1.4, PENCIL);
      // A small open bracket so the screen-space reticle reads apart from the world reticle.
      g.lineStyle(1.8, INK, 0.85);
      const k = 13;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        g.lineBetween(r.x + sx * k, r.y + sy * k, r.x + sx * k * 0.45, r.y + sy * k);
        g.lineBetween(r.x + sx * k, r.y + sy * k, r.x + sx * k, r.y + sy * k * 0.45);
      }
    }
  }

  private icon(
    id: string,
    p: Pt,
    r: number,
    tone: number,
    alpha: number,
    knob: { readonly x: number; readonly y: number } | null,
  ): void {
    const g = this.g;
    const s = r * 0.38;
    g.lineStyle(2.4, tone, alpha);
    switch (id) {
      case 'left':
      case 'right': {
        const d = id === 'left' ? -1 : 1;
        strokeInk(
          g,
          [
            { x: p.x - d * s * 0.5, y: p.y - s },
            { x: p.x + d * s * 0.6, y: p.y },
            { x: p.x - d * s * 0.5, y: p.y + s },
          ],
          2.6,
          tone,
          alpha,
          d,
        );
        break;
      }
      case 'jump':
        for (const off of [0.35, -0.35]) {
          strokeInk(
            g,
            [
              { x: p.x - s, y: p.y + s * (0.4 + off) },
              { x: p.x, y: p.y - s * (0.5 - off) },
              { x: p.x + s, y: p.y + s * (0.4 + off) },
            ],
            2.6,
            tone,
            alpha,
            off,
          );
        }
        break;
      case 'rope':
        // A dashed line ending in a small ring: the rope verb.
        dashedInk(
          g,
          { x: p.x - s, y: p.y + s },
          { x: p.x + s * 0.5, y: p.y - s * 0.5 },
          5,
          4,
          2.4,
          tone,
        );
        g.lineStyle(2.4, tone, alpha).strokeCircle(p.x + s * 0.7, p.y - s * 0.7, s * 0.35);
        break;
      case 'stick':
        if (knob) {
          g.lineStyle(1.4, tone, alpha * 0.8).strokeCircle(p.x, p.y, r * 0.15);
          g.fillStyle(tone, alpha * 0.25).fillCircle(knob.x, knob.y, r * 0.42);
          strokeInk(g, circle(knob, r * 0.42, 16), 2.4, tone, alpha, 3);
        }
        break;
      case 'pause':
        g.lineBetween(p.x - s * 0.45, p.y - s, p.x - s * 0.45, p.y + s);
        g.lineBetween(p.x + s * 0.45, p.y - s, p.x + s * 0.45, p.y + s);
        break;
      case 'restart': {
        const arc: Pt[] = [];
        for (let k = 0; k <= 12; k++) {
          const a = -Math.PI * 0.35 + (k / 12) * Math.PI * 1.6;
          arc.push({ x: p.x + Math.cos(a) * s, y: p.y + Math.sin(a) * s });
        }
        strokeInk(g, arc, 2, tone, alpha, 4);
        const end = arc[0] as Pt;
        g.lineBetween(end.x, end.y, end.x + s * 0.5, end.y - s * 0.1);
        g.lineBetween(end.x, end.y, end.x + s * 0.05, end.y + s * 0.5);
        break;
      }
      default:
        break;
    }
  }
}

function circle(c: { readonly x: number; readonly y: number }, r: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}
