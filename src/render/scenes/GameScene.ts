import * as Phaser from 'phaser';
import { metersToPixels as m, vec2, type Vec2 } from '../../core';
import type { LevelDef, SimEvent, SimSnapshot } from '../../sim';
import type { FrameSource, RenderFrame } from '../frame';
import { DebugOverlay } from '../debug/DebugOverlay';
import { dashedInk, hatchPolygon, strokeInk, wobble, type Pt } from '../ink';

/** Paper-and-ink palette (doc 07 §1). Black ink is primary; colour is rare and meaningful. */
const PAPER = 0xf3efe6;
const RULE = 0x9ec2df;
const MARGIN = 0xe28a8a;
const INK = 0x16161a;
const PENCIL = 0x8a8a8a;
const RED_PEN = 0xc5302a;
const HIGHLIGHTER = 0xffe14a;

/** College-ruled spacing in world meters; world-anchored so it doubles as a height ruler. */
const RULE_SPACING = 0.5;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpV = (a: Vec2, b: Vec2, t: number): Pt => ({
  x: m(lerp(a.x, b.x, t)),
  y: m(lerp(a.y, b.y, t)),
});

interface Splat {
  x: number;
  y: number;
  age: number;
  seed: number;
}

export interface GameSceneOptions {
  readonly level: LevelDef;
  readonly source: FrameSource;
  /** Subscribe to simulation events (feedback effects only; never gameplay). */
  readonly onEvents: (listener: (events: readonly SimEvent[]) => void) => () => void;
  /** Build the development overlay (dev builds or ?debug). Production presentation omits it. */
  readonly debug?: boolean;
}

/**
 * The game as drawn on a notebook page (doc 07 §2, §16). Render only reads snapshots; the camera,
 * effects and HUD are presentation and never feed back into the simulation.
 */
export class GameScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private overlay: DebugOverlay | null = null;
  private splats: Splat[] = [];
  private unsubscribe: (() => void) | null = null;
  private camX = 0;
  private camY = 0;
  private lastTime = 0;

  constructor(private readonly opts: GameSceneOptions) {
    super('game');
  }

  /** Convert a canvas point (CSS px) to world meters with the current camera. Used by input. */
  screenToWorld(x: number, y: number): Vec2 {
    const cam = this.cameras.main;
    const p = cam.getWorldPoint(x, y);
    return vec2(p.x / m(1), p.y / m(1));
  }

  /** World metres to canvas pixels under the current camera (tests and tools). */
  worldToScreen(p: Vec2): Vec2 {
    const cam = this.cameras.main;
    return vec2((m(p.x) - cam.worldView.x) * cam.zoom, (m(p.y) - cam.worldView.y) * cam.zoom);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAPER);
    this.drawStaticPage();
    this.dynamic = this.add.graphics();
    this.hud = this.add.graphics().setScrollFactor(0);
    const hand = { fontFamily: '"Caveat", "Patrick Hand", cursive', color: '#16161a' };
    this.timer = this.add
      .text(0, 14, '', { ...hand, fontSize: '34px' })
      .setScrollFactor(0)
      .setOrigin(1, 0);
    this.title = this.add
      .text(0, 16, this.opts.level.name, { ...hand, fontSize: '22px', color: '#5a5a5a' })
      .setScrollFactor(0)
      .setOrigin(0.5, 0);
    if (this.opts.debug) this.overlay = new DebugOverlay(this);
    this.unsubscribe = this.opts.onEvents((events) => {
      this.overlay?.onEvents(events);
      for (const e of events) {
        if (e.type === 'death')
          this.splats.push({ x: m(e.at.x), y: m(e.at.y), age: 0, seed: e.tick });
      }
    });
    this.events.once('shutdown', () => this.unsubscribe?.());
    this.scale.on('resize', () => {
      this.fitCamera();
    });
    this.fitCamera();
    const spawn = this.opts.level.spawn;
    this.camX = m(spawn.x);
    this.camY = m(spawn.y);
  }

  override update(time: number, deltaMs: number): void {
    const frame = this.opts.source.frame(deltaMs / 1000);
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || deltaMs / 1000);
    this.lastTime = time;
    this.followCamera(frame, dt);
    this.drawDynamic(frame, dt);
    this.drawHud(frame);
  }

  // --- camera ----------------------------------------------------------------------------------

  /** Show about 12 m of world height on any screen; aspect ratio changes framing only (doc 03). */
  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(this.scale.height / m(12));
    const b = this.opts.level.bounds;
    cam.setBounds(m(b.minX), m(b.minY), m(b.maxX - b.minX), m(b.maxY - b.minY));
  }

  private followCamera({ previous, current, alpha }: RenderFrame, dt: number): void {
    const p = lerpV(
      previous.player.position,
      current.player.position,
      this.blend(previous, current, alpha),
    );
    const v = current.player.velocity;
    // Gentle lookahead in the direction of travel so required anchors appear early (doc 03).
    const targetX = p.x + m(Math.max(-3, Math.min(3, v.x * 0.35)));
    const targetY = p.y + m(Math.max(-1.5, Math.min(2, v.y * 0.12))) - m(1);
    const k = 1 - Math.exp(-dt * 6);
    if (current.attemptTick < previous.attemptTick || current.attemptTick <= 1) {
      this.camX = targetX;
      this.camY = targetY;
    } else {
      this.camX += (targetX - this.camX) * k;
      this.camY += (targetY - this.camY) * k;
    }
    this.cameras.main.centerOn(this.camX, this.camY);
  }

  private blend(previous: SimSnapshot, current: SimSnapshot, alpha: number): number {
    // A reset between snapshots means there is nothing to blend.
    return current.attemptTick > previous.attemptTick ? alpha : 1;
  }

  // --- static page -----------------------------------------------------------------------------

  private drawStaticPage(): void {
    const { bounds, solids, anchors } = this.opts.level;
    const g = this.add.graphics();
    const x0 = m(bounds.minX - 20);
    const x1 = m(bounds.maxX + 20);
    const y0 = m(bounds.minY - 20);
    const y1 = m(bounds.maxY + 20);
    g.fillStyle(PAPER, 1).fillRect(x0, y0, x1 - x0, y1 - y0);

    // College ruling, world-anchored.
    g.lineStyle(1.2, RULE, 0.5);
    const first = Math.ceil((bounds.minY - 20) / RULE_SPACING) * RULE_SPACING;
    for (let y = first; y < bounds.maxY + 20; y += RULE_SPACING) g.lineBetween(x0, m(y), x1, m(y));

    // Margin and punched holes at the start of the page.
    const marginX = m(bounds.minX + 0.6);
    g.lineStyle(2, MARGIN, 0.75).lineBetween(marginX, y0, marginX, y1);
    g.fillStyle(0xd9d3c6, 1);
    for (let y = bounds.minY; y < bounds.maxY; y += 5)
      g.fillCircle(m(bounds.minX + 0.25), m(y + 2.5), m(0.2));

    // Moving-anchor tracks: faint pencil dots telegraph the motion.
    for (const a of anchors) {
      if (!a.path) continue;
      const dx = a.path.to.x - a.position.x;
      const dy = a.path.to.y - a.position.y;
      const len = Math.hypot(dx, dy);
      g.fillStyle(PENCIL, 0.7);
      for (let d = 0; d <= len; d += 0.35)
        g.fillCircle(m(a.position.x + (dx * d) / len), m(a.position.y + (dy * d) / len), 1.6);
    }

    solids.forEach((s, i) => {
      const poly = s.points.map((p) => ({ x: m(p.x), y: m(p.y) }));
      const seed = i * 7.31 + 1;
      if (s.kind === 'hazard') {
        hatchPolygon(g, poly, m(0.12), -0.9, 1.6, RED_PEN, 0.8, seed);
        hatchPolygon(g, poly, m(0.16), 0.7, 1.3, RED_PEN, 0.55, seed + 3);
        this.drawTeeth(g, s.points, seed);
      } else {
        hatchPolygon(g, poly, m(0.17), 0.8, 1.3, INK, 0.5, seed);
      }
      const closed = [...poly, poly[0] as Pt];
      strokeInk(
        g,
        wobble(closed, seed, m(0.025), m(0.3)),
        s.kind === 'hazard' ? 2.4 : 3,
        INK,
        1,
        seed,
      );
    });
  }

  /** Thorny teeth along the upward-facing edges of a hazard, so danger reads by silhouette. */
  private drawTeeth(g: Phaser.GameObjects.Graphics, points: readonly Vec2[], seed: number): void {
    for (let i = 0; i < points.length; i++) {
      const a = points[i] as Vec2;
      const b = points[(i + 1) % points.length] as Vec2;
      if (Math.abs(a.y - b.y) > 0.01 || Math.abs(b.x - a.x) < 0.5) continue;
      const top = Math.min(...points.map((p) => p.y));
      if (Math.abs(a.y - top) > 0.01) continue;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      g.fillStyle(RED_PEN, 0.9);
      g.lineStyle(2, INK, 1);
      let k = 0;
      for (let x = left + 0.1; x < right - 0.3; x += 0.42, k++) {
        const h = 0.28 + (0.18 * ((seed * 13 + k * 7) % 5)) / 5;
        const p0 = { x: m(x), y: m(a.y) };
        const p1 = { x: m(x + 0.16), y: m(a.y - h) };
        const p2 = { x: m(x + 0.32), y: m(a.y) };
        g.fillTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
        strokeInk(g, wobble([p0, p1, p2], seed + k, 0.8, m(0.1)), 1.8, INK, 1, k);
      }
    }
  }

  // --- dynamic layer ---------------------------------------------------------------------------

  private drawDynamic(frame: RenderFrame, dt: number): void {
    const { previous, current, alpha } = frame;
    const g = this.dynamic;
    g.clear();
    const t = this.blend(previous, current, alpha);

    // Anchors.
    current.anchors.forEach((a, i) => {
      const prev = previous.anchors[i] ?? a;
      const p = lerpV(prev, a, t);
      const active = current.rope?.anchor === i;
      const targeted = current.target?.valid === true && current.target.anchor === i;
      if (active || targeted) this.highlighter(g, p, i);
      this.drawAnchor(g, p, i);
    });

    // Last attempt: a faint red-pen cross where it ended and, if tethered, a pencil trace of
    // that rope, so the next attempt can adjust (doc 08 candidate feedback; never blocks retry).
    const last = current.lastDeath;
    if (last) {
      const at = { x: m(last.at.x), y: m(last.at.y) };
      if (last.rope) {
        dashedInk(
          g,
          { x: m(last.rope.point.x), y: m(last.rope.point.y) },
          at,
          m(0.12),
          m(0.2),
          1.2,
          PENCIL,
        );
      }
      const c = m(0.16);
      g.lineStyle(2, RED_PEN, 0.45);
      g.lineBetween(at.x - c, at.y - c, at.x + c, at.y + c);
      g.lineBetween(at.x - c, at.y + c, at.x + c, at.y - c);
    }

    // Rope: a dashed pen line from the hand to the impact point.
    const player = lerpV(previous.player.position, current.player.position, t);
    if (current.rope) {
      const prevPoint = previous.rope?.point ?? current.rope.point;
      const anchor = lerpV(prevPoint, current.rope.point, t);
      const hand = this.handPoint(player, anchor);
      dashedInk(g, anchor, hand, m(0.2), m(0.13), 2.6, INK);
    }

    this.drawPlayer(g, player, current, frame);

    // Aim reticle: pencil when nothing is selected, ink when a rope press would connect, red pen
    // when an anchor is selected but the shot is invalid. The impact point gets a small cross.
    const target = current.target;
    if (target?.impact) {
      const ip = { x: m(target.impact.x), y: m(target.impact.y) };
      const c = m(0.1);
      g.lineStyle(2, target.valid ? INK : RED_PEN, 0.95);
      g.lineBetween(ip.x - c, ip.y - c, ip.x + c, ip.y + c);
      g.lineBetween(ip.x - c, ip.y + c, ip.x + c, ip.y - c);
    }
    if (current.aim) {
      const a = { x: m(current.aim.x), y: m(current.aim.y) };
      const r = m(0.18);
      const tone = !target || target.anchor === null ? PENCIL : target.valid ? INK : RED_PEN;
      g.lineStyle(1.6, tone, 0.9);
      g.strokeCircle(a.x, a.y, r);
      g.lineBetween(a.x - r * 1.6, a.y, a.x - r * 0.6, a.y);
      g.lineBetween(a.x + r * 0.6, a.y, a.x + r * 1.6, a.y);
      g.lineBetween(a.x, a.y - r * 1.6, a.x, a.y - r * 0.6);
      g.lineBetween(a.x, a.y + r * 0.6, a.x, a.y + r * 1.6);
    }

    // Death ink splats: short punctuation that never delays the retry.
    this.splats = this.splats.filter((s) => (s.age += dt) < 0.6);
    for (const s of this.splats) {
      const fade = 1 - s.age / 0.6;
      g.fillStyle(INK, 0.8 * fade);
      for (let k = 0; k < 9; k++) {
        const ang = k * 0.7 + s.seed;
        const d = m(0.15 + (0.5 * ((k * 37 + s.seed) % 10)) / 10) * (0.6 + s.age);
        g.fillCircle(s.x + Math.cos(ang) * d, s.y + Math.sin(ang) * d, m(0.06 + 0.05 * (k % 3)));
      }
    }
  }

  private highlighter(g: Phaser.GameObjects.Graphics, p: Pt, seed: number): void {
    g.fillStyle(HIGHLIGHTER, 0.55);
    for (let k = 0; k < 3; k++) {
      const dy = (k - 1) * m(0.16);
      g.fillRoundedRect(
        p.x - m(0.65) + k * 3,
        p.y - m(0.12) + dy + ((seed + k) % 2) * 2,
        m(1.3),
        m(0.2),
        m(0.08),
      );
    }
  }

  private drawAnchor(g: Phaser.GameObjects.Graphics, p: Pt, i: number): void {
    // The ring is the impact disc: art matches collision (AGENTS.md, Codex review on PR 6).
    const r = m(this.opts.level.anchors[i]?.radius ?? 0.4);
    const ring: Pt[] = [];
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      ring.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
    strokeInk(g, wobble(ring, i * 3.3, 0.9, m(0.08)), 3.4, INK, 1, i);
    // Bolt plate above the ring.
    g.fillStyle(INK, 1);
    g.fillRect(p.x - m(0.08), p.y - r - m(0.2), m(0.16), m(0.14));
    g.lineStyle(2.4, INK, 1).lineBetween(p.x, p.y - r - m(0.08), p.x, p.y - r);
  }

  private handPoint(player: Pt, anchor: Pt): Pt {
    const dx = anchor.x - player.x;
    const dy = anchor.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: player.x + (dx / len) * m(0.3), y: player.y + (dy / len) * m(0.3) - m(0.02) };
  }

  /** The doodled hero: skull-round head with hollow eyes and a stitched mouth, stick limbs. */
  private drawPlayer(
    g: Phaser.GameObjects.Graphics,
    c: Pt,
    s: SimSnapshot,
    frame: RenderFrame,
  ): void {
    const face = s.player.facing;
    const v = s.player.velocity;
    const mode = s.player.mode;
    const headR = m(0.19);
    const head = { x: c.x, y: c.y - m(0.14) };
    const neck = { x: c.x, y: c.y + m(0.03) };
    const hip = { x: c.x - face * m(0.02), y: c.y + m(0.19) };
    const phase = c.x / m(0.42);
    const runAmt = mode === 'grounded' ? Math.min(1, Math.abs(v.x) / 6) : 0;

    // Legs.
    const legLen = m(0.17);
    const legs: [Pt, Pt][] = [0, Math.PI].map((off) => {
      let ang: number;
      if (mode === 'grounded') ang = Math.sin(phase + off) * 0.75 * runAmt;
      else if (mode === 'tethered') ang = (off === 0 ? 0.35 : -0.2) * face + v.x * 0.02;
      else ang = (off === 0 ? 0.5 : -0.35) * face;
      const knee = { x: hip.x + Math.sin(ang) * legLen, y: hip.y + Math.cos(ang) * legLen * 0.95 };
      const foot = { x: knee.x + Math.sin(ang * 0.4) * legLen * 0.9, y: knee.y + legLen * 0.75 };
      return [knee, foot];
    });
    for (const [knee, foot] of legs) strokeInk(g, [hip, knee, foot], 2.6, INK);

    // Body.
    strokeInk(g, [neck, hip], 2.8, INK);

    // Arms: reach up the rope when tethered, swing while running.
    const shoulder = { x: c.x, y: c.y + m(0.07) };
    const armLen = m(0.2);
    if (mode === 'tethered' && s.rope) {
      const prevPoint = frame.previous.rope?.point ?? s.rope.point;
      const anchor = lerpV(prevPoint, s.rope.point, frame.alpha);
      const hand = this.handPoint(c, anchor);
      strokeInk(g, [shoulder, hand], 2.4, INK);
      strokeInk(
        g,
        [shoulder, { x: shoulder.x - face * armLen * 0.6, y: shoulder.y + armLen * 0.8 }],
        2.4,
        INK,
      );
    } else {
      for (const off of [0, Math.PI]) {
        const ang =
          mode === 'grounded'
            ? -Math.sin(phase + off) * 0.7 * runAmt
            : off === 0
              ? -1.9 * face
              : 1.2 * face;
        strokeInk(
          g,
          [
            shoulder,
            { x: shoulder.x + Math.sin(ang) * armLen, y: shoulder.y + Math.cos(ang) * armLen },
          ],
          2.4,
          INK,
        );
      }
    }

    // Head: paper-white fill, ink outline, hollow eyes, stitched mouth (our dash/stitch motif).
    g.fillStyle(PAPER, 1).fillCircle(head.x, head.y, headR);
    const ring: Pt[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ring.push({ x: head.x + Math.cos(a) * headR, y: head.y + Math.sin(a) * headR * 1.05 });
    }
    strokeInk(g, ring, 2.8, INK);
    g.fillStyle(INK, 1);
    g.fillEllipse(head.x + face * m(0.035), head.y - m(0.02), m(0.08), m(0.1));
    g.fillEllipse(head.x + face * m(0.115), head.y - m(0.02), m(0.065), m(0.09));
    g.lineStyle(1.6, INK, 1);
    const my = head.y + m(0.09);
    g.lineBetween(head.x + face * m(0.0), my, head.x + face * m(0.14), my);
    for (let k = 0; k < 3; k++) {
      const sx = head.x + face * m(0.025 + k * 0.045);
      g.lineBetween(sx, my - m(0.03), sx, my + m(0.03));
    }
  }

  // --- HUD (drawn on the page, fixed to the screen) ---------------------------------------------

  private drawHud(frame: RenderFrame): void {
    const { current } = frame;
    const w = this.scale.width;
    const g = this.hud;
    g.clear();

    // Death count as tally marks in the margin.
    const deaths = current.deaths;
    g.lineStyle(2.4, INK, 0.9);
    for (let i = 0; i < deaths && i < 60; i++) {
      const group = Math.floor(i / 5);
      const k = i % 5;
      const gx = 22 + (group % 6) * 34;
      const gy = 22 + Math.floor(group / 6) * 34;
      if (k < 4) g.lineBetween(gx + k * 6, gy, gx + k * 6 + 1, gy + 22);
      else g.lineBetween(gx - 4, gy + 18, gx + 24, gy + 4);
    }

    const secs = current.attemptTick / 60;
    const mm = Math.floor(secs / 60);
    const ss = secs - mm * 60;
    this.timer
      .setPosition(w - 20, 12)
      .setText(`${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`);
    this.title.setPosition(w / 2, 14);

    this.overlay?.draw(frame);
  }
}
