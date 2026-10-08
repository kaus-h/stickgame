import * as Phaser from 'phaser';
import { metersToPixels as m, vec2, type Vec2 } from '../../core';
import type { LevelDef, SimEvent, SimSnapshot } from '../../sim';
import type { FrameSource, RenderFrame } from '../frame';
import { cameraScale, cameraTarget, DEFAULT_CAMERA, stepCamera } from '../camera';
import { DebugOverlay } from '../debug/DebugOverlay';
import { FailureFeedback } from '../feedback/FailureFeedback';
import { drawHero } from '../hero/drawHero';
import { dashedInk, hash, hatchPolygon, strokeInk, wobble, type Pt } from '../ink';
import { addPaper, bakeGraphics, drawDoodles, drawFrame } from '../page/NotebookPage';
import { TouchControlsView, type TouchControlsViewState } from '../TouchControlsView';
import { entryMarks, exitMissMessage } from '../exit';
import { drawPatroller } from '../enemy';
import { causeText } from '../feedback/causeText';
import { DELTA_COLOURS, formatDelta, formatRaceTime, SPLIT_VISIBLE_TICKS } from '../race';

/** Paper-and-ink palette (doc 07 §1). Black ink is primary; colour is rare and meaningful. */
const PAPER = 0xf3efe6;
const INK = 0x16161a;
const PENCIL = 0x8a8a8a;
const RED_PEN = 0xc5302a;
const HIGHLIGHTER = 0xffe14a;

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
  /** Player setting override for reduced motion; undefined follows the system preference. */
  readonly reducedMotion?: () => boolean | undefined;
  /** Draw the in-canvas exit result card (labs and tests); the app menu UI replaces it. */
  readonly showExitResult?: boolean;
  /** Level-design review: fit the whole level on screen and hold the camera still (?overview=1). */
  readonly overview?: boolean;
  /** On-screen touch controls this frame (GMR-27); null or inactive hides them. */
  readonly touchControls?: () => TouchControlsViewState | null;
  /** Externalized UI strings (content/strings); HUD labels fall back to their keys. */
  readonly strings?: Readonly<Record<string, string>>;
}

/** The PB ghost (GMR-103): the normal hero in pencil grey, about 35% opaque. */
const PB_GHOST_ALPHA = 0.35;

/**
 * The game as drawn on a notebook page (doc 07 §2, §16). Render only reads snapshots; the camera,
 * effects and HUD are presentation and never feed back into the simulation.
 */
export class GameScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Text;
  private lifeTimer!: Phaser.GameObjects.Text;
  private splitTime!: Phaser.GameObjects.Text;
  private splitDelta!: Phaser.GameObjects.Text;
  private pbGhostG!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private exitResult!: Phaser.GameObjects.Text;
  private exitMiss!: Phaser.GameObjects.Text;
  private stomps: { readonly tick: number; readonly at: Vec2 }[] = [];
  private overlay: DebugOverlay | null = null;
  private touchView: TouchControlsView | null = null;
  private frameG!: Phaser.GameObjects.Graphics;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private readonly routed = new WeakSet<Phaser.GameObjects.GameObject>();
  private splats: Splat[] = [];
  private ghostG!: Phaser.GameObjects.Graphics;
  private causeLabel!: Phaser.GameObjects.Text;
  private feedback = new FailureFeedback();
  private reducedMotion = false;
  private unsubscribe: (() => void) | null = null;
  /** Camera center in world meters (render/camera.ts). */
  private camCenter: Vec2 = vec2(0, 0);
  private lastTime = 0;

  constructor(private opts: GameSceneOptions) {
    super('game');
  }

  /** Rebuild authored art and cameras; the source retains the persistent simulation world. */
  replaceLevel(level: LevelDef): void {
    this.opts = { ...this.opts, level };
    this.scene.restart();
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
    this.splats = [];
    this.stomps = [];
    this.lastTime = 0;
    this.cameras.main.setBackgroundColor(PAPER);
    this.drawStaticPage();
    // Previous-attempt ghost layer: drawn with the normal hero code, faded as a whole.
    this.ghostG = this.add.graphics().setAlpha(0.22);
    this.pbGhostG = this.add.graphics().setAlpha(PB_GHOST_ALPHA).setName('pb-ghost');
    this.dynamic = this.add.graphics();
    this.causeLabel = this.add
      .text(0, 0, '', { fontFamily: '"Caveat", cursive', fontSize: '30px', color: '#8a8a8a' })
      .setOrigin(0.5, 1)
      .setName('enemy-cause')
      .setDepth(20)
      .setVisible(false);
    this.feedback = new FailureFeedback();
    this.reducedMotion =
      this.opts.reducedMotion?.() ??
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.frameG = this.add.graphics().setScrollFactor(0).setDepth(90);
    drawFrame(this.frameG, this.scale.height);
    this.hud = this.add.graphics().setScrollFactor(0);
    const hand = { fontFamily: '"Caveat", "Patrick Hand", cursive', color: '#16161a' };
    this.timer = this.add
      .text(0, 14, '', { ...hand, fontSize: '34px' })
      .setScrollFactor(0)
      .setOrigin(1, 0)
      .setName('run-timer');
    // GMR-103: the life timer sits small under the run timer; splits flash under the title.
    this.lifeTimer = this.add
      .text(0, 50, '', { ...hand, fontSize: '22px', color: '#5a5a5a' })
      .setScrollFactor(0)
      .setOrigin(1, 0)
      .setName('life-timer');
    this.splitTime = this.add
      .text(0, 44, '', { ...hand, fontSize: '26px' })
      .setScrollFactor(0)
      .setOrigin(0.5, 0)
      .setName('split-time')
      .setVisible(false);
    this.splitDelta = this.add
      .text(0, 72, '', { ...hand, fontSize: '30px' })
      .setScrollFactor(0)
      .setOrigin(0.5, 0)
      .setName('split-delta')
      .setVisible(false);
    this.title = this.add
      .text(0, 16, this.opts.level.name, { ...hand, fontSize: '22px', color: '#5a5a5a' })
      .setScrollFactor(0)
      .setOrigin(0.5, 0);
    this.exitResult = this.add
      .text(0, 0, '', {
        ...hand,
        fontSize: '32px',
        align: 'center',
        backgroundColor: '#f3efe6',
        padding: { x: 24, y: 16 },
      })
      .setName('exit-result')
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5)
      .setVisible(false);
    this.exitMiss = this.add
      .text(0, 0, '', {
        ...hand,
        fontSize: '22px',
        color: '#c5302a',
        backgroundColor: '#f3efe6',
        padding: { x: 5, y: 2 },
      })
      .setName('exit-miss')
      .setDepth(20)
      .setOrigin(0.5, 1)
      .setVisible(false);
    if (this.opts.debug) this.overlay = new DebugOverlay(this, this.opts.level);
    if (this.opts.touchControls) this.touchView = new TouchControlsView(this);
    this.unsubscribe = this.opts.onEvents((events) => {
      this.overlay?.onEvents(events);
      this.feedback.onEvents(events);
      for (const e of events) {
        if (e.type === 'reset') this.stomps = [];
        if (e.type === 'stomp') this.stomps.push({ tick: e.tick, at: e.at });
        if (e.type === 'death')
          this.splats.push({ x: m(e.at.x), y: m(e.at.y), age: 0, seed: e.tick });
      }
    });
    // HUD and page frame render through their own unzoomed camera; the world camera zooms.
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.routeCameras();
    const resize = (): void => {
      drawFrame(this.frameG, this.scale.height);
      this.uiCamera.setSize(this.scale.width, this.scale.height);
      this.fitCamera();
    };
    this.scale.on('resize', resize);
    this.events.once('shutdown', () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.scale.off('resize', resize);
      this.overlay?.destroy();
      this.overlay = null;
    });
    this.fitCamera();
    const spawn = this.opts.level.spawn;
    this.camCenter = spawn;
  }

  /**
   * Screen-fixed objects (scroll factor 0) belong to the UI camera, everything else to the world
   * camera. Runs every frame so objects created later (overlays, touch controls) are routed too.
   */
  private routeCameras(): void {
    for (const obj of this.children.list) {
      if (this.routed.has(obj)) continue;
      this.routed.add(obj);
      const screen = (obj as unknown as { scrollFactorX?: number }).scrollFactorX === 0;
      (screen ? this.cameras.main : this.uiCamera).ignore(obj);
    }
  }

  override update(time: number, deltaMs: number): void {
    this.routeCameras();
    const frame = this.opts.source.frame(deltaMs / 1000);
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || deltaMs / 1000);
    this.lastTime = time;
    this.followCamera(frame, dt);
    this.drawDynamic(frame, dt);
    this.drawHud(frame);
  }

  // --- camera ----------------------------------------------------------------------------------

  /**
   * Zoom depends only on the viewport (no dynamic zoom during play, GMR-25): ~12 m of world
   * height, widened on narrow screens so anchors at full rope range ahead stay visible.
   */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const b = this.opts.level.bounds;
    if (this.opts.overview) {
      const zoom = Math.min(
        this.scale.width / m(b.maxX - b.minX),
        this.scale.height / m(b.maxY - b.minY),
      );
      cam.setZoom(zoom);
      cam.removeBounds();
      cam.centerOn(m((b.minX + b.maxX) / 2), m((b.minY + b.maxY) / 2));
      return;
    }
    cam.setZoom(cameraScale(this.scale.width, this.scale.height, DEFAULT_CAMERA) / m(1));
    cam.setBounds(m(b.minX), m(b.minY), m(b.maxX - b.minX), m(b.maxY - b.minY));
  }

  private followCamera({ previous, current, alpha }: RenderFrame, dt: number): void {
    if (this.opts.overview) return;
    const t = this.blend(previous, current, alpha);

    const p = previous.player.position;
    const c = current.player.position;
    const position = vec2(p.x + (c.x - p.x) * t, p.y + (c.y - p.y) * t);
    const target = cameraTarget(position, current.player.velocity, DEFAULT_CAMERA);
    const snap = current.attemptTick < previous.attemptTick || current.attemptTick <= 1;
    this.camCenter = stepCamera(this.camCenter, target, dt, DEFAULT_CAMERA, snap);
    this.cameras.main.centerOn(m(this.camCenter.x), m(this.camCenter.y));
  }

  private blend(previous: SimSnapshot, current: SimSnapshot, alpha: number): number {
    // A reset between snapshots means there is nothing to blend.
    return current.attemptTick > previous.attemptTick ? alpha : 1;
  }

  // --- static page -----------------------------------------------------------------------------

  private drawStaticPage(): void {
    const { bounds, solids, anchors } = this.opts.level;
    // Paper and ruling: one world-locked tiled quad (render/page/NotebookPage.ts).
    addPaper(this, this.opts.level);
    const g = this.add.graphics();
    drawDoodles(g, this.opts.level);

    // Moving-anchor tracks: faint pencil dots telegraph the motion.
    for (const a of anchors) {
      if (!a.path) continue;
      const dx = a.path.to.x - a.position.x;
      const dy = a.path.to.y - a.position.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      g.fillStyle(PENCIL, 0.7);
      for (let d = 0; d <= len; d += 0.35)
        g.fillCircle(m(a.position.x + (dx * d) / len), m(a.position.y + (dy * d) / len), 1.6);
      // Ink stop bars where the anchor turns round, and pencil chevrons just inside each end
      // pointing at it, so the extent and the back-and-forth read before the anchor gets there.
      const ux = dx / len;
      const uy = dy / len;
      const ends: [Vec2, number][] = [
        [a.position, -1],
        [a.path.to, 1],
      ];
      ends.forEach(([e, dir], k) => {
        const bar = 0.32;
        strokeInk(
          g,
          [
            { x: m(e.x - uy * bar), y: m(e.y + ux * bar) },
            { x: m(e.x + uy * bar), y: m(e.y - ux * bar) },
          ],
          2.2,
          INK,
          0.9,
          k + 11,
        );
        const tip = { x: e.x - ux * dir * 0.45, y: e.y - uy * dir * 0.45 };
        const back = 0.22;
        const wing = 0.16;
        g.lineStyle(1.8, PENCIL, 0.9);
        for (const side of [-1, 1]) {
          g.lineBetween(
            m(tip.x),
            m(tip.y),
            m(tip.x - ux * dir * back - uy * wing * side),
            m(tip.y - uy * dir * back + ux * wing * side),
          );
        }
      });
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
      if (s.kind === 'solid') this.drawWalkableEdges(g, s.points, seed);
    });

    this.drawCompartment(g);

    // Bake everything static into world-space texture tiles (a few quads per frame).
    const pad = 4;
    bakeGraphics(
      this,
      g,
      {
        x: m(bounds.minX - pad),
        y: m(bounds.minY - pad),
        w: m(bounds.maxX - bounds.minX + pad * 2),
        h: m(bounds.maxY - bounds.minY + pad * 2),
      },
      -50,
    );
  }

  /** Pencil compartment outline and an inward ink arrow expose the authored opening. */
  private drawCompartment(g: Phaser.GameObjects.Graphics): void {
    const exit = this.opts.level.exit;
    if (!exit) return;
    const { min, max } = exit;
    const entry = 'entry' in exit ? exit.entry : null;
    const side = entry?.side ?? 'left';
    const corners = [min, vec2(max.x, min.y), max, vec2(min.x, max.y)];
    const sides = ['top', 'right', 'bottom', 'left'];
    corners.forEach((p, i) => {
      if (sides[i] === side) return;
      const next = corners[(i + 1) % 4] as Vec2;
      strokeInk(
        g,
        [
          { x: m(p.x), y: m(p.y) },
          { x: m(next.x), y: m(next.y) },
        ],
        1.8,
        PENCIL,
        0.7,
        i + 91,
      );
    });
    const horizontal = side === 'left' || side === 'right';
    const marks = 'entry' in exit ? entryMarks(exit) : null;
    const midpoint = vec2(
      marks
        ? (marks[0].x + marks[1].x) / 2
        : horizontal
          ? side === 'left'
            ? min.x
            : max.x
          : (min.x + max.x) / 2,
      marks
        ? (marks[0].y + marks[1].y) / 2
        : horizontal
          ? (min.y + max.y) / 2
          : side === 'top'
            ? min.y
            : max.y,
    );
    const normal = vec2(
      side === 'left' ? 1 : side === 'right' ? -1 : 0,
      side === 'top' ? 1 : side === 'bottom' ? -1 : 0,
    );
    // Short ink ticks mark the allowed center band, never a fictitious collision wall.
    for (const mark of marks ?? []) {
      strokeInk(
        g,
        [
          { x: m(mark.x - normal.x * 0.18), y: m(mark.y - normal.y * 0.18) },
          { x: m(mark.x + normal.x * 0.18), y: m(mark.y + normal.y * 0.18) },
        ],
        3,
        INK,
        0.9,
        103,
      );
    }
    const start = vec2(midpoint.x - normal.x * 0.65, midpoint.y - normal.y * 0.65);
    const tip = vec2(midpoint.x + normal.x * 0.45, midpoint.y + normal.y * 0.45);
    g.lineStyle(2.5, INK, 0.9).lineBetween(m(start.x), m(start.y), m(tip.x), m(tip.y));
    for (const sign of [-1, 1])
      g.lineBetween(
        m(tip.x),
        m(tip.y),
        m(tip.x - normal.x * 0.25 - normal.y * sign * 0.18),
        m(tip.y - normal.y * 0.25 + normal.x * sign * 0.18),
      );
    const label = entry
      ? `${'family' in exit && exit.family === 'slot' ? 'Slot' : 'family' in exit && exit.family === 'shaft' ? 'Shaft' : 'Wide exit'}\n${String(entry.speed.min)}–${String(entry.speed.max)} m/s · ${String(entry.angle.min)}–${String(entry.angle.max)}°\nStay within the entry marks`
      : 'Exit';
    this.add
      .text(m((min.x + max.x) / 2), m(min.y - 0.3), label, {
        fontFamily: '"Caveat", "Patrick Hand", cursive',
        fontSize: '21px',
        color: '#5a5a5a',
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(-10);
  }

  /**
   * Walkable tops read first (doc 07 §13): a heavier second pen pass on upward-facing edges, and a
   * band of tighter hatching just under them so platforms have a lit top and shaded body.
   */
  private drawWalkableEdges(
    g: Phaser.GameObjects.Graphics,
    points: readonly Vec2[],
    seed: number,
  ): void {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[i] as Vec2;
      const b = points[(i + 1) % n] as Vec2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.3) continue;
      // Polygons are authored clockwise in +y-down space, so the outward normal is (dy, -dx).
      const ny = -dx / len;
      if (ny > -0.7) continue;
      const pts = [
        { x: m(a.x), y: m(a.y) },
        { x: m(b.x), y: m(b.y) },
      ];
      strokeInk(g, wobble(pts, seed + i * 5, m(0.018), m(0.35)), 4.2, INK, 1, seed + i);
      g.lineStyle(1.1, INK, 0.55);
      const step = 0.11;
      for (let t = step / 2; t < len; t += step) {
        const x = a.x + (dx * t) / len;
        const y = a.y + (dy * t) / len;
        const depth = 0.12 + 0.1 * hash(seed + t * 13);
        g.lineBetween(m(x), m(y + 0.06), m(x - 0.07), m(y + 0.06 + depth));
      }
    }
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
        // Teeth sit inside the collision shape (tips on its top edge): the art never extends past
        // the lethal surface, so touching the drawing always means touching the hazard.
        const p0 = { x: m(x), y: m(a.y + h) };
        const p1 = { x: m(x + 0.16), y: m(a.y) };
        const p2 = { x: m(x + 0.32), y: m(a.y + h) };
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

    for (const enemy of current.enemies) {
      if (!enemy.alive) continue;
      const before = previous.enemies.find((item) => item.id === enemy.id) ?? enemy;
      const position = vec2(
        lerp(before.position.x, enemy.position.x, t),
        lerp(before.position.y, enemy.position.y, t),
      );
      const authored = this.opts.level.enemies?.find((item) => item.id === enemy.id);
      drawPatroller(g, position, enemy.size, authored?.stomp.topInset ?? 0, enemy.facing);
    }
    this.stomps = this.stomps.filter((stomp) => current.tick - stomp.tick < 24);
    for (const stomp of this.stomps) {
      const age = current.tick - stomp.tick;
      if (age < 0) continue;
      const radius = m(0.2 + age * 0.025);
      g.lineStyle(2, INK, 1 - age / 24);
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        g.lineBetween(
          m(stomp.at.x) + Math.cos(angle) * radius,
          m(stomp.at.y) + Math.sin(angle) * radius,
          m(stomp.at.x) + Math.cos(angle) * (radius + m(0.13)),
          m(stomp.at.y) + Math.sin(angle) * (radius + m(0.13)),
        );
      }
    }

    // Anchors.
    current.anchors.forEach((a, i) => {
      const prev = previous.anchors[i] ?? a;
      const p = lerpV(prev, a, t);
      const active = current.rope?.anchor === i;
      const targeted = current.target?.valid === true && current.target.anchor === i;
      if (active || targeted) this.highlighter(g, p, i);
      this.drawAnchor(g, p, i);
      const v = current.anchorVelocities[i];
      if (v) this.drawAnchorHeading(g, p, v, i);
    });

    this.drawCheckpoints(current.checkpoint);
    this.drawPreviousAttempt(current, frame);
    this.drawPbGhost(frame);

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

    const miss = current.lastExitAttempt;
    const missAge = miss ? current.tick - miss.tick : Infinity;
    const visibleMiss =
      miss !== null && !miss.accepted && missAge >= 0 && missAge < 90 && !current.completion;
    this.exitMiss.setVisible(visibleMiss);
    if (visibleMiss) {
      const at = { x: m(miss.at.x), y: m(miss.at.y) };
      const fade = Math.min(1, (90 - missAge) / 30);
      g.lineStyle(2.5, RED_PEN, fade);
      const r = m(0.16);
      g.lineBetween(at.x - r, at.y - r, at.x + r, at.y + r);
      g.lineBetween(at.x - r, at.y + r, at.x + r, at.y - r);
      this.exitMiss
        .setPosition(at.x, at.y - m(0.35))
        .setAlpha(fade)
        .setText(exitMissMessage(miss, this.opts.level.exit));
    }

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
    // Snap assist (GMR-27, opt-in): never silent. A highlighter swipe and a pencil dashed line
    // from the aim to the snapped impact point show that the assist chose the anchor.
    if (target?.snapped && target.impact && current.aim) {
      const from = { x: m(current.aim.x), y: m(current.aim.y) };
      const to = { x: m(target.impact.x), y: m(target.impact.y) };
      g.lineStyle(m(0.16), HIGHLIGHTER, 0.5).lineBetween(from.x, from.y, to.x, to.y);
      dashedInk(g, from, to, m(0.1), m(0.08), 1.6, target.valid ? INK : RED_PEN);
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

    // Death punctuation: a fast pen scribble-out over the spot (0.45 s), drawn while the next
    // attempt is already playing, so it never delays control. Reduced motion: no growth, quick fade.
    const life = this.reducedMotion ? 0.25 : 0.45;
    this.splats = this.splats.filter((sp) => (sp.age += dt) < life);
    for (const sp of this.splats) {
      const t = sp.age / life;
      const grow = this.reducedMotion ? 1 : Math.min(1, t * 3);
      g.lineStyle(2.2 * this.lineScale(), INK, 0.85 * (1 - t));
      g.beginPath();
      const r = m(0.45) * grow;
      for (let k = 0; k <= 14; k++) {
        const ang = k * 2.4 + sp.seed;
        const rr = r * (0.35 + 0.65 * (((k * 37 + sp.seed) % 10) / 10));
        const x = sp.x + Math.cos(ang) * rr;
        const y = sp.y + Math.sin(ang) * rr * 0.8;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  /**
   * Checkpoints as little flags doodled on the page (GMR-100): pencil until reached, then inked and
   * filled, so the player always knows where the next life starts.
   */
  private drawCheckpoints(active: number): void {
    const g = this.dynamic;
    (this.opts.level.checkpoints ?? []).forEach((cp, i) => {
      const reached = i <= active;
      const base = { x: m(cp.position.x), y: m(cp.position.y + 0.35) };
      const top = { x: base.x, y: base.y - m(1.1) };
      const tone = reached ? INK : PENCIL;
      g.lineStyle(2.2 * this.lineScale(), tone, reached ? 1 : 0.7);
      g.lineBetween(base.x, base.y, top.x, top.y);
      const p0 = { x: top.x, y: top.y };
      const p1 = { x: top.x + m(0.5), y: top.y + m(0.16) };
      const p2 = { x: top.x, y: top.y + m(0.34) };
      if (reached) g.fillStyle(INK, 0.9).fillTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
      else strokeInk(g, [p0, p1, p2, p0], 1.8 * this.lineScale(), PENCIL, 0.8, i);
    });
  }

  /**
   * The previous attempt, drawn faintly so the player can compare (GMR-43): its path as pencil
   * dots, every rope impact as a small pencil target, and a ghost hero replaying it in time with
   * the current attempt. A cause label appears only after repeated deaths at one spot.
   */
  private drawPreviousAttempt(current: SimSnapshot, frame: RenderFrame): void {
    this.feedback.observe(current);
    const g = this.dynamic;
    const prev = this.feedback.previous;
    const ghost = this.ghostG;
    ghost.clear();
    if (prev) {
      g.fillStyle(PENCIL, 0.35);
      for (let i = 0; i < prev.path.length; i += 4) {
        const p = prev.path[i] as Vec2;
        g.fillCircle(m(p.x), m(p.y), 1.4 * this.lineScale());
      }
      g.lineStyle(1.4 * this.lineScale(), PENCIL, 0.7);
      for (const p of prev.impacts) {
        g.strokeCircle(m(p.x), m(p.y), m(0.14));
        g.fillStyle(PENCIL, 0.8).fillCircle(m(p.x), m(p.y), m(0.035));
      }
      const at = this.reducedMotion ? null : this.feedback.ghostAt(current.attemptTick);
      if (at) {
        const next = this.feedback.ghostAt(current.attemptTick + 1) ?? at;
        drawHero(ghost, {
          c: { x: m(at.x), y: m(at.y) },
          facing: next.x >= at.x ? 1 : -1,
          velocity: vec2((next.x - at.x) * 60, (next.y - at.y) * 60),
          mode: 'air',
          hand: null,
          time: frame.current.tick / 60,
          line: this.lineScale(),
        });
      }
    }
    const last = current.lastDeath;
    const enemyDeathVisible = last?.cause === 'enemy-contact' && current.tick - last.tick < 90;
    const label = enemyDeathVisible
      ? { text: causeText(last.cause, last.solid), at: last.at }
      : this.feedback.label();
    if (label && (enemyDeathVisible || current.attemptTick < 180)) {
      this.causeLabel
        .setText(label.text)
        .setPosition(m(label.at.x), m(label.at.y) - m(0.35))
        .setColor(last?.cause === 'enemy-contact' ? '#c5302a' : '#8a8a8a')
        .setVisible(true);
    } else {
      this.causeLabel.setVisible(false);
    }
  }

  /**
   * The PB ghost (GMR-103): a second, headless simulation replaying the personal best in lockstep
   * with the run clock, drawn as the hero in pencil grey. Only when a PB exists and the setting is on.
   */
  private drawPbGhost(frame: RenderFrame): void {
    const g = this.pbGhostG;
    g.clear();
    const ghost = frame.race?.ghost;
    if (!ghost) return;
    const { previous, current } = ghost;
    const t = current.runTick > previous.runTick ? frame.alpha : 1;
    let hand: Pt | null = null;
    const c = lerpV(previous.player.position, current.player.position, t);
    if (current.player.mode === 'tethered' && current.rope) {
      const anchor = lerpV(previous.rope?.point ?? current.rope.point, current.rope.point, t);
      hand = this.handPoint(c, anchor);
      dashedInk(g, anchor, hand, m(0.2), m(0.13), 2, PENCIL);
    }
    drawHero(g, {
      c,
      facing: current.player.facing,
      velocity: current.player.velocity,
      mode: current.player.mode,
      hand,
      time: current.tick / 60,
      line: this.lineScale(),
      ink: PENCIL,
    });
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

  /**
   * Moving anchors carry a small ink arrow off the ring in the direction they travel now, growing
   * with speed and vanishing at the turn, so the player can read where the pivot will be.
   */
  private drawAnchorHeading(g: Phaser.GameObjects.Graphics, p: Pt, v: Vec2, i: number): void {
    const speed = Math.hypot(v.x, v.y);
    if (speed < 0.3) return;
    const ux = v.x / speed;
    const uy = v.y / speed;
    const r = m(this.opts.level.anchors[i]?.radius ?? 0.4);
    const start = { x: p.x + ux * (r + m(0.12)), y: p.y + uy * (r + m(0.12)) };
    const len = m(0.15 + 0.06 * speed);
    const tip = { x: start.x + ux * len, y: start.y + uy * len };
    const head = m(0.14);
    g.lineStyle(2.2, INK, 0.85);
    g.lineBetween(start.x, start.y, tip.x, tip.y);
    for (const side of [-1, 1]) {
      g.lineBetween(
        tip.x,
        tip.y,
        tip.x - ux * head - uy * head * 0.7 * side,
        tip.y - uy * head + ux * head * 0.7 * side,
      );
    }
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
    let hand: Pt | null = null;
    if (s.player.mode === 'tethered' && s.rope) {
      const prevPoint = frame.previous.rope?.point ?? s.rope.point;
      hand = this.handPoint(c, lerpV(prevPoint, s.rope.point, frame.alpha));
    }
    drawHero(g, {
      c,
      facing: s.player.facing,
      velocity: s.player.velocity,
      mode: s.player.mode,
      hand,
      time: this.time.now / 1000,
      line: this.lineScale(),
    });
  }

  /** Keep ink strokes at least ~their desktop weight on screen when the camera zooms out (phones). */
  private lineScale(): number {
    return Math.min(2.2, Math.max(1, 0.9 / this.cameras.main.zoom));
  }

  // --- HUD (drawn on the page, fixed to the screen) ---------------------------------------------

  /**
   * Checkpoint and exit splits (GMR-103): the run time there and, once a PB exists, the signed
   * delta to the PB split, blue pen when faster and red pen when slower, for about 2 s.
   */
  private drawSplit(frame: RenderFrame): void {
    const w = this.scale.width;
    const split = frame.race?.split ?? null;
    const age = split ? frame.current.tick - split.tick : Infinity;
    const visible = split !== null && age >= 0 && age < SPLIT_VISIBLE_TICKS;
    this.splitTime.setVisible(visible);
    this.splitDelta.setVisible(visible && split.pbTicks !== null);
    if (!visible) return;
    const label = split.kind === 'exit' ? this.str('hud.finish') : this.str('hud.checkpoint');
    this.splitTime.setPosition(w / 2, 44).setText(`${label} ${formatRaceTime(split.ticks)}`);
    if (split.pbTicks !== null) {
      const delta = formatDelta(split.ticks - split.pbTicks);
      this.splitDelta
        .setPosition(w / 2, 72)
        .setColor(DELTA_COLOURS[delta.tone])
        .setText(delta.text);
    }
  }

  private str(key: string): string {
    return this.opts.strings?.[key] ?? key;
  }

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

    this.timer.setPosition(w - 20, 12).setText(formatRaceTime(current.runTick));
    this.lifeTimer
      .setPosition(w - 22, 50)
      .setText(`${this.str('hud.life')} ${formatRaceTime(current.lifeTick)}`);
    this.drawSplit(frame);
    this.title.setPosition(w / 2, 14);
    const completion = current.completion;
    this.exitResult.setVisible(
      this.opts.showExitResult !== false && completion !== null && completion.accepted,
    );
    if (completion?.accepted) {
      this.exitResult
        .setPosition(w / 2, this.scale.height / 2)
        .setText(
          `Exit complete\n${(completion.runTicks / 60).toFixed(2)} s · ${String(current.deaths)} ${current.deaths === 1 ? 'death' : 'deaths'}`,
        );
    }

    this.overlay?.draw(frame);
    this.touchView?.draw(this.opts.touchControls?.() ?? null);
  }
}
