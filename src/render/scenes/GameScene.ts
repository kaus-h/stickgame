import * as Phaser from 'phaser';
import { metersToPixels as m, vec2, type Vec2 } from '../../core';
import type { LevelDef, SimEvent, SimSnapshot } from '../../sim';
import type { FrameSource, RenderFrame } from '../frame';
import {
  attentionTarget,
  HUD_BAND_PX,
  cameraScale,
  cameraTarget,
  CALM_CAMERA,
  DEFAULT_CAMERA,
  framedAnchors,
  stepCamera,
  type FramedAnchor,
} from '../camera';
import { DebugOverlay } from '../debug/DebugOverlay';
import { FailureFeedback } from '../feedback/FailureFeedback';
import { HeroAnimator } from '../hero/animator';
import { drawHero, heroHeadTransform, type HeroPose } from '../hero/drawHero';
import { HeroHead } from '../hero/heads';
import { dashedInk, strokeInk, type Pt } from '../ink';
import { addPaper, drawDoodles, drawFrame } from '../page/NotebookPage';
import { TouchControlsView, type TouchControlsViewState } from '../TouchControlsView';
import { entryMarks, exitMissMessage, exitSpec, speedStreaks } from '../exit';
import { anchorInReach, easeAlpha, OUT_OF_REACH_ALPHA, OUT_OF_REACH_ALPHA_HC } from '../reach';
import { drawPatroller, goonSeed } from '../enemy';
import { DrawIn } from '../living/drawIn';
import { HAND_FONT } from '../typeface';
import { PageTurn } from '../living/pageTurn';
import { MarginDoodles } from '../living/marginDoodles';
import { InkJuice } from '../living/inkJuice';
import { addPageVignette } from '../living/pageVignette';
import { DustMotes, LevelTitleCard } from '../living/atmosphere';
import { drawPoolSurfaces, poolShape, type PoolShape } from '../living/inkPool';
import { LineBoil } from '../living/lineBoil';
import { causeText } from '../feedback/causeText';
import { DELTA_COLOURS, formatDelta, formatRaceTime, SPLIT_VISIBLE_TICKS } from '../race';
import { BodiesLayer, type BodiesStats } from '../bodies/BodiesLayer';
import { kitHazardKind, LevelKit } from '../kit/LevelKit';
import { Kit17Background } from '../kit/Kit17Background';
import { resolveKitVersion } from '../kit/Kit17Terrain';
import { getLevelTheme } from '../../content';

/** Paper-and-ink palette (doc 07 §1). Black ink is primary; colour is rare and meaningful. */
const PAPER = 0xf3efe6;
const INK = 0x16161a;
const PENCIL = 0x8a8a8a;
/** High contrast (GMR-50): pencil marks darken toward ink but stay distinguishable from it. */
const PENCIL_HC = 0x4a4a52;
/** Larger aim reticle (GMR-50): the reticle and impact cross scale by this. */
const LARGE_RETICLE = 1.6;
const RED_PEN = 0xc5302a;
const HIGHLIGHTER = 0xffe14a;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Move a camera to a render-order slot (camera lists are drawn front to back). */
function placeCamera(
  list: Phaser.Cameras.Scene2D.Camera[] | undefined,
  camera: Phaser.Cameras.Scene2D.Camera,
  index: number,
): void {
  if (!Array.isArray(list)) return;
  const at = list.indexOf(camera);
  if (at >= 0) list.splice(at, 1);
  list.splice(index, 0, camera);
}

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
  /** Release the completion pause if a scene reload cancels a presentation. */
  readonly onPresentationCancel?: () => void;
  /** Level-design review: fit the whole level on screen and hold the camera still (?overview=1). */
  readonly overview?: boolean;
  /** On-screen touch controls this frame (GMR-27); null or inactive hides them. */
  readonly touchControls?: () => TouchControlsViewState | null;
  /** Externalized UI strings (content/strings); HUD labels fall back to their keys. */
  readonly strings?: Readonly<Record<string, string>>;
  /** Gravity for the death bodies (runtime tuning, m/s²). Presentation only (GMR-104). */
  readonly gravity?: number;
  /** Whether death bodies are shown (the B setting); read when a level's scene is built. */
  readonly bodiesVisible?: () => boolean;
  /** Max rope length (runtime tuning, m): anchors beyond it are drawn faded (GMR-56). */
  readonly ropeReach?: number;
  /** Extra debug-overlay line from outside the scene (music state, GMR-42). */
  readonly debugExtra?: () => string;
  /** Accessibility settings (GMR-50), read every frame; a high-contrast change rebuilds the scene. */
  readonly accessibility?: () => AccessibilityView;
}

export interface AccessibilityView {
  readonly highContrast: boolean;
  readonly largeReticle: boolean;
}

/** The PB ghost (GMR-103): the normal hero in pencil grey, about 35% opaque. */
const PB_GHOST_ALPHA = 0.35;

/**
 * The game as drawn on a notebook page (doc 07 §2, §16). Render only reads snapshots; the camera,
 * effects and HUD are presentation and never feed back into the simulation.
 */
export class GameScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Graphics;
  /** Anchor path extents for the camera's anchor attention (GMR-44), per level. */
  private framed: FramedAnchor[] = [];
  private anchorFx!: Phaser.GameObjects.Graphics;
  /** Hero squash, stretch, lean and head choice (GMR-69); presentation only. */
  private readonly animator = new HeroAnimator();
  private head!: HeroHead;
  private animResets = -1;
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
  private highContrast = false;
  private reticleScale = 1;
  /** PENCIL, or PENCIL_HC under high contrast. */
  private pencil = PENCIL;
  private unsubscribe: (() => void) | null = null;
  /** Camera center in world meters (render/camera.ts). */
  private camCenter: Vec2 = vec2(0, 0);
  private lastTime = 0;
  private bodies!: BodiesLayer;
  private kit!: LevelKit;
  private kit17Background: Kit17Background | null = null;
  /** Drawn alpha per anchor, eased toward the reach cue (GMR-56). */
  private readonly anchorAlpha: number[] = [];
  /** Completion presentation owns the camera until this scene is replaced. */
  private eraserCamera = false;
  /** Living Notebook: hand-drawn line boil over the world camera. */
  private boil: LineBoil | null = null;
  private juice = new InkJuice();
  private drawIn: DrawIn | null = null;
  private pageTurn: PageTurn | null = null;
  private doodles: MarginDoodles | null = null;
  private vignette: Phaser.GameObjects.Image | null = null;
  private motes: DustMotes | null = null;
  private titleCard: LevelTitleCard | null = null;
  /** The paper renders through its own camera under the world camera, so paper never boils. */
  private paper: Phaser.GameObjects.GameObject | null = null;
  private paperCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  /** Above the boiling world: the hero and spikes stay crisp (owner, 2026-10-12). */
  private crispCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private crispObjects = new WeakSet<Phaser.GameObjects.GameObject>();
  private heroG!: Phaser.GameObjects.Graphics;
  /** Live pool surfaces (ripples, bubbles), over the static pool body in the kit canvas. */
  private poolG!: Phaser.GameObjects.Graphics;
  private pools: PoolShape[] = [];

  kitPresentation(): {
    ready: boolean;
    theme: string;
    tiles: number;
    surfacePixels: number;
    kitId?: string;
    backgrounds: ReturnType<Kit17Background['presentation']>;
  } {
    return {
      // Fully presented: the kit is built and the level has finished inking itself onto the page.
      ready: !!(this.kit as LevelKit | undefined) && (this.drawIn?.finished ?? true),
      theme: getLevelTheme(this.opts.level),
      ...this.kit.stats(),
      backgrounds: this.kit17Background?.presentation() ?? {
        active: false,
        layers: [],
        textures: 0,
        surfacePixels: 0,
      },
    };
  }

  constructor(private opts: GameSceneOptions) {
    super('game');
  }

  /** Rebuild authored art and cameras; the source retains the persistent simulation world. */
  replaceLevel(level: LevelDef): void {
    this.opts = { ...this.opts, level };
    this.scene.restart();
  }

  /** Death bodies (GMR-104): B shows or hides them with a pop. */
  setBodiesVisible(on: boolean): void {
    this.bodies.setVisible(on);
  }

  /** C: scribble out every body on this level. */
  clearBodies(): void {
    this.bodies.clear();
  }

  /** After an accepted exit: the eraser rubs out the bodies, then `done` (at once if none). */
  eraseBodies(done: () => void): void {
    if (this.bodies.sweeping) return;
    this.eraserCamera = this.bodies.stats().count > 0;
    if (this.eraserCamera && !this.reducedMotion) this.fitEraserCamera();
    this.bodies.erase(done, (worldX) => {
      const b = this.opts.level.bounds;
      this.cameras.main.centerOn(worldX, m((b.minY + b.maxY) / 2));
    });
  }

  /** Dev evidence: pixels, from the same timeline used to crop bodies and move the camera. */
  eraserPresentation() {
    return {
      scrollX: this.cameras.main.scrollX,
      zoom: this.cameras.main.zoom,
      ...this.bodies.sweepPresentation(),
    };
  }

  /** Only accepted exits call this: no turn or delay on death/retry. */
  turnPage(done: () => void): void {
    this.pageTurn?.start(done);
    this.routeCameras();
  }

  pageTurnPresentation(): { active: boolean; progress: number } {
    return this.pageTurn?.presentation() ?? { active: false, progress: 0 };
  }

  bodyStats(): BodiesStats {
    return this.bodies.stats();
  }

  /** Dev and tests: a body as if the hero had died here. */
  addBody(death: { tick: number; at: Vec2; velocity: Vec2 }): void {
    this.bodies.onDeath(death);
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
    this.eraserCamera = false;
    this.juice = new InkJuice();
    this.splats = [];
    this.stomps = [];
    this.lastTime = 0;
    this.reducedMotion =
      this.opts.reducedMotion?.() ??
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.highContrast = this.opts.accessibility?.().highContrast ?? false;
    this.pencil = this.highContrast ? PENCIL_HC : PENCIL;
    this.pageTurn = new PageTurn(this, this.reducedMotion, this.highContrast);
    this.drawStaticPage();
    // Paper camera first in the render list; the world camera above it is transparent and boils.
    this.paperCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.paperCamera.setBackgroundColor(PAPER);
    const list = (this.cameras as unknown as { cameras: Phaser.Cameras.Scene2D.Camera[] }).cameras;
    placeCamera(list, this.paperCamera, 0);
    this.boil = new LineBoil(this, this.cameras.main);
    // Crisp layer renders between the paper and the boiling world. (A camera drawn after a
    // filtered camera in Phaser 4 loses the filtered camera's composite, so it cannot go on top.)
    this.crispCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    placeCamera(list, this.crispCamera, 1);
    this.crispObjects = new WeakSet();
    this.pools = this.opts.level.solids
      .filter((s) => s.kind === 'hazard' && kitHazardKind(s.id) === 'pool')
      .map(poolShape);
    this.poolG = this.add.graphics().setDepth(-48.5);
    // Margin doodles sit on the page behind the terrain, above the sketched scenery (-97..-99).
    this.doodles = new MarginDoodles(
      this.add.graphics().setDepth(-60),
      this.opts.level,
      this.opts.level.spawn,
      this.highContrast,
    );
    this.bodies = new BodiesLayer(
      this,
      this.opts.level,
      this.opts.gravity ?? 30,
      this.opts.bodiesVisible?.() ?? true,
      () => this.reducedMotion,
      () => this.lineScale(),
    );
    // Previous-attempt ghost layer: drawn with the normal hero code, faded as a whole.
    this.ghostG = this.add.graphics().setAlpha(0.22);
    this.pbGhostG = this.add.graphics().setAlpha(PB_GHOST_ALPHA).setName('pb-ghost');
    this.dynamic = this.add.graphics();
    this.heroG = this.add.graphics();
    this.crispObjects.add(this.heroG);
    // Above the anchor rings (depth 1): erases timed rings segment by segment (GMR-60, H3).
    this.anchorFx = this.add.graphics().setDepth(1.5);
    this.head = new HeroHead(this, 2);
    // The level inks itself in on first appearance (never after a death: retry stays instant).
    this.drawIn = new DrawIn(this, this.reducedMotion || this.opts.overview === true);
    if (this.head.object) this.crispObjects.add(this.head.object);
    this.causeLabel = this.add
      .text(0, 0, '', { fontFamily: HAND_FONT, fontSize: '30px', color: '#8a8a8a' })
      .setOrigin(0.5, 1)
      .setName('enemy-cause')
      .setDepth(20)
      .setVisible(false);
    this.feedback = new FailureFeedback();
    this.frameG = this.add.graphics().setScrollFactor(0).setDepth(90);
    // Lamplight; flat light under high contrast, and ?lamp=0 for pixel-measuring tests.
    const flat =
      this.highContrast ||
      (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('lamp') === '0');
    this.vignette = flat ? null : addPageVignette(this, 85);
    this.motes = new DustMotes(this, 84, this.reducedMotion);
    // Written onto the page as the level opens; the scene persists across deaths, so never on retry.
    if (LevelTitleCard.shouldShow(this.opts.level.id) && this.opts.overview !== true)
      this.titleCard = new LevelTitleCard(
        this,
        this.opts.level.id,
        this.opts.level.name,
        86,
        this.reducedMotion,
      );
    drawFrame(this.frameG, this.scale.height);
    this.hud = this.add.graphics().setScrollFactor(0);
    // A paper halo keeps the HUD legible where it crosses hatched terrain (c6's ceiling bar).
    const hand = {
      fontFamily: HAND_FONT,
      color: '#16161a',
      stroke: '#f3efe6',
      strokeThickness: 5,
    };
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
        color: '#16161a',
        backgroundColor: '#f3efe6',
        padding: { x: 5, y: 2 },
      })
      .setName('exit-miss')
      .setDepth(20)
      .setOrigin(0.5, 1)
      .setVisible(false);
    if (this.opts.debug)
      this.overlay = new DebugOverlay(this, this.opts.level, () => {
        const b = this.bodies.stats();
        const k = this.kit.stats();
        const bg = this.kit17Background?.presentation();
        const extra = this.opts.debugExtra
          ? `
${this.opts.debugExtra()}`
          : '';
        return `${exitSpec(this.opts.level.exit)}${extra}
art ${k.kitId}/${getLevelTheme(this.opts.level)} | tiles ${String(k.tiles)} | backgrounds ${String(bg?.layers.length ?? 0)} | canvas ${(((k.surfacePixels + (bg?.surfacePixels ?? 0)) * 4) / 1024 / 1024).toFixed(1)} MiB
bodies ${String(b.count)} | simulating ${String(b.simulating)} | visible ${b.visible ? 'on' : 'off'}${b.sweeping ? ' | erasing' : ''}
page turn ${this.pageTurnPresentation().active ? 'active' : 'idle'} | progress ${this.pageTurnPresentation().progress.toFixed(3)}
a11y contrast ${this.highContrast ? 'high' : 'normal'} | reticle ${String(this.reticleScale)}x | boil ${this.reducedMotion ? 'off' : 'on'}
doodles ${String(this.doodles?.stats().count ?? 0)} | birds flying ${String(this.doodles?.stats().flying ?? 0)} | title card ${this.titleCard ? this.titleCard.progress().toFixed(2) : 'off'}`;
      });
    if (this.opts.touchControls) this.touchView = new TouchControlsView(this);
    this.unsubscribe = this.opts.onEvents((events) => {
      this.overlay?.onEvents(events);
      this.feedback.onEvents(events);
      this.juice.onEvents(events);
      for (const e of events) {
        if (e.type === 'reset') {
          this.stomps = [];
          this.pageTurn?.clear();
        }
        if (e.type === 'stomp') this.stomps.push({ tick: e.tick, at: e.at });
        if (e.type === 'death') {
          this.splats.push({ x: m(e.at.x), y: m(e.at.y), age: 0, seed: e.tick });
          this.bodies.onDeath(e);
        }
      }
    });
    // HUD and page frame render through their own unzoomed camera; the world camera zooms.
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.routeCameras();
    const resize = (): void => {
      drawFrame(this.frameG, this.scale.height);
      this.uiCamera.setSize(this.scale.width, this.scale.height);
      this.fitCamera();
      if (this.eraserCamera && !this.reducedMotion) this.fitEraserCamera();
      this.kit17Background?.update(this.cameras.main, this.reducedMotion);
    };
    this.scale.on('resize', resize);
    this.events.once('shutdown', () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.scale.off('resize', resize);
      this.overlay?.destroy();
      this.overlay = null;
      this.bodies.destroy();
      this.pageTurn?.destroy();
      this.pageTurn = null;
      this.opts.onPresentationCancel?.();
    });
    this.fitCamera();
    this.kit17Background?.update(this.cameras.main, this.reducedMotion);
    const spawn = this.opts.level.spawn;
    this.camCenter = spawn;
  }

  /**
   * Screen-fixed objects (scroll factor 0) belong to the UI camera, everything else to the world
   * camera. Runs every frame so objects created later (overlays, touch controls) are routed too.
   */
  private syncPaperCamera(): void {
    const main = this.cameras.main;
    for (const cam of [this.paperCamera, this.crispCamera]) {
      if (!cam) continue;
      cam.setViewport(main.x, main.y, main.width, main.height);
      cam.setZoom(main.zoom);
      cam.setScroll(main.scrollX, main.scrollY);
    }
  }

  private routeCameras(): void {
    for (const obj of this.children.list) {
      if (this.routed.has(obj)) continue;
      this.routed.add(obj);
      if (obj === this.paper) {
        this.cameras.main.ignore(obj);
        this.uiCamera.ignore(obj);
        continue;
      }
      this.paperCamera?.ignore(obj);
      if (this.crispObjects.has(obj) || this.kit.crisp.includes(obj)) {
        this.cameras.main.ignore(obj);
        this.uiCamera.ignore(obj);
        continue;
      }
      this.crispCamera?.ignore(obj);
      const screen = (obj as unknown as { scrollFactorX?: number }).scrollFactorX === 0;
      (screen ? this.cameras.main : this.uiCamera).ignore(obj);
    }
  }

  override update(time: number, deltaMs: number): void {
    this.routeCameras();
    const frame = this.opts.source.frame(deltaMs / 1000);
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000 || deltaMs / 1000));
    this.lastTime = time;
    this.followCamera(frame, dt);
    this.kit17Background?.update(this.cameras.main, this.reducedMotion);
    this.syncPaperCamera();
    this.drawIn?.update(dt, this.cameras.main.worldView);
    this.vignette?.setDisplaySize(this.scale.width, this.scale.height);
    const cam = this.cameras.main;
    this.motes?.update(dt, cam.scrollX, cam.scrollY, this.scale.width, this.scale.height);
    this.titleCard?.update(dt, this.scale.width, this.scale.height);
    if (this.titleCard && this.titleCard.progress() >= 1) this.titleCard = null;
    this.boil?.setEnabled(!this.reducedMotion);
    this.boil?.update(time / 1000);
    // Body physics caps its own catch-up; presentation effects keep their wall-time duration.
    this.bodies.update(Math.max(0, deltaMs / 1000));
    this.pageTurn?.update(Math.max(0, deltaMs / 1000), this.scale.width, this.scale.height);
    this.drawDynamic(frame, dt);
    this.drawHud(frame);
    this.routeCameras(); // bodies baked this frame
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

  /** Show the full height of the page while following the completion eraser. */
  private fitEraserCamera(): void {
    const b = this.opts.level.bounds;
    this.cameras.main.setZoom(
      Math.min(
        cameraScale(this.scale.width, this.scale.height, DEFAULT_CAMERA) / m(1),
        this.scale.height / m(b.maxY - b.minY),
      ),
    );
    this.cameras.main.setBounds(m(b.minX), m(b.minY), m(b.maxX - b.minX), m(b.maxY - b.minY));
  }

  private followCamera({ previous, current, alpha }: RenderFrame, dt: number): void {
    if (this.eraserCamera && !this.bodies.sweeping && current.resets > previous.resets) {
      this.eraserCamera = false;
      this.fitCamera();
    }
    if (this.opts.overview || this.eraserCamera) return;
    const t = this.blend(previous, current, alpha);

    const p = previous.player.position;
    const c = current.player.position;
    const position = vec2(p.x + (c.x - p.x) * t, p.y + (c.y - p.y) * t);
    // Anchor attention (GMR-44): lift to show reachable anchors above a height-bound view.
    const screen = cameraScale(this.scale.width, this.scale.height, DEFAULT_CAMERA);
    const target = attentionTarget(
      cameraTarget(
        position,
        current.player.velocity,
        this.reducedMotion ? CALM_CAMERA : DEFAULT_CAMERA,
      ),
      position,
      current.player.velocity,
      this.framed,
      this.scale.width / screen,
      this.scale.height / screen,
      this.opts.ropeReach ?? 11,
      HUD_BAND_PX / screen,
      this.opts.level.solids,
    );
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
    const { anchors } = this.opts.level;
    // Paper and ruling: one world-locked tiled quad (render/page/NotebookPage.ts).
    this.paper = addPaper(this, this.opts.level);
    this.kit17Background =
      !this.highContrast &&
      typeof window !== 'undefined' &&
      resolveKitVersion(window.location.search) === '0017'
        ? new Kit17Background(this)
        : null;
    const g = this.add.graphics();
    if (getLevelTheme(this.opts.level) === 'scenery') drawDoodles(g, this.opts.level);
    this.kit = new LevelKit(this, this.opts.level);
    this.framed = framedAnchors(this.opts.level.anchors);

    // Moving-anchor tracks: faint pencil dots telegraph the motion.
    for (const a of anchors) {
      if (!a.path) continue;
      const dx = a.path.to.x - a.position.x;
      const dy = a.path.to.y - a.position.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      g.fillStyle(this.pencil, 0.7);
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
        g.lineStyle(1.8, this.pencil, 0.9);
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

    this.drawCompartment(g);

    // Terrain is already baked by LevelKit. These sparse guides stay above it without a
    // second full-world texture set (paper themes contain only tracks and entry marks).
    g.setDepth(-48);
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
        this.pencil,
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
    // Mouth bracket: ink dots at the band ends, joined across the band below (GMR-56). Dots, not
    // ticks: in the blind test, ticks parallel to the arrow were read as speed marks.
    g.fillStyle(INK, 0.9);
    for (const mark of marks ?? []) g.fillCircle(m(mark.x), m(mark.y), m(0.08));
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
    if (marks) {
      strokeInk(
        g,
        [
          { x: m(marks[0].x), y: m(marks[0].y) },
          { x: m(marks[1].x), y: m(marks[1].y) },
        ],
        2,
        INK,
        0.8,
        107,
      );
    }
    if (entry) {
      // No angle rule (max 90: any inward approach) means no cone, like no streaks for speed.
      if (entry.angle.max < 90) this.drawEntryFan(g, midpoint, normal, entry.angle);
      // Speed streaks trail the arrow's tail: three for "come in from a fast swing".
      const streaks = speedStreaks(entry.speed);
      const offsets = streaks === 3 ? [-0.22, 0, 0.22] : streaks === 1 ? [0] : [];
      for (const [k, o] of offsets.entries()) {
        const back = 0.12 + (k % 2) * 0.1;
        const from = vec2(
          start.x - normal.x * back - normal.y * o,
          start.y - normal.y * back + normal.x * o,
        );
        const len = 0.85 - Math.abs(o);
        strokeInk(
          g,
          [
            { x: m(from.x), y: m(from.y) },
            { x: m(from.x - normal.x * len), y: m(from.y - normal.y * len) },
          ],
          2,
          INK,
          0.85,
          111 + k,
        );
      }
    }
  }

  /**
   * The allowed entry cone, drawn on the approach side around the inward normal: two dashed
   * pencil rays at ±max and an arc between them (plus inner rays when min > 0). Wordless signage
   * for the angle window (GMR-56); the numbers live in the debug overlay.
   */
  private drawEntryFan(
    g: Phaser.GameObjects.Graphics,
    mouth: Vec2,
    normal: Vec2,
    angle: { readonly min: number; readonly max: number },
  ): void {
    const out = Math.atan2(-normal.y, -normal.x);
    const reach = 1.7;
    const arcR = 1.25;
    const ray = (deg: number, sign: number): void => {
      const a = out + (sign * deg * Math.PI) / 180;
      dashedInk(
        g,
        { x: m(mouth.x + Math.cos(a) * 0.35), y: m(mouth.y + Math.sin(a) * 0.35) },
        { x: m(mouth.x + Math.cos(a) * reach), y: m(mouth.y + Math.sin(a) * reach) },
        m(0.12),
        m(0.1),
        1.3,
        this.pencil,
      );
    };
    for (const sign of [-1, 1]) {
      ray(angle.max, sign);
      if (angle.min > 0) ray(angle.min, sign);
    }
    const half = (Math.max(angle.max, 4) * Math.PI) / 180;
    const steps = Math.max(4, Math.ceil(angle.max / 6));
    const arc: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = out - half + (2 * half * i) / steps;
      arc.push({ x: m(mouth.x + Math.cos(a) * arcR), y: m(mouth.y + Math.sin(a) * arcR) });
    }
    strokeInk(g, arc, 1.3, this.pencil, 0.8, 109);
  }

  // --- dynamic ink ---

  private drawDynamic(frame: RenderFrame, dt: number): void {
    // Accessibility (GMR-50): the reticle size follows the setting live; high contrast also
    // restyles the static layers, so a change rebuilds the scene (as a level change does).
    const a11y = this.opts.accessibility?.();
    this.reticleScale = a11y?.largeReticle ? LARGE_RETICLE : 1;
    if ((a11y?.highContrast ?? false) !== this.highContrast) {
      this.scene.restart();
      return;
    }
    const { previous, current, alpha } = frame;
    const g = this.dynamic;
    g.clear();
    this.anchorFx.clear();
    const t = this.blend(previous, current, alpha);

    for (const enemy of current.enemies) {
      if (!enemy.alive) continue;
      const before = previous.enemies.find((item) => item.id === enemy.id) ?? enemy;
      const position = vec2(
        lerp(before.position.x, enemy.position.x, t),
        lerp(before.position.y, enemy.position.y, t),
      );
      // Legs step with distance walked (position.x), so a still goon stands still.
      drawPatroller(g, position, enemy.size, enemy.facing, goonSeed(enemy.id), position.x);
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

    // Anchors: full ink in rope reach, faded pencil beyond it (GMR-56 H3).
    current.anchors.forEach((a, i) => {
      const prev = previous.anchors[i] ?? a;
      const p = lerpV(prev, a, t);
      const active = current.rope?.anchor === i;
      const targeted = current.target?.valid === true && current.target.anchor === i;
      if (active || targeted) this.highlighter(g, p, i);
      const reach = this.opts.ropeReach;
      const radius = this.opts.level.anchors[i]?.radius ?? 0.4;
      const target =
        active ||
        targeted ||
        reach === undefined ||
        anchorInReach(current.player.position, a, radius, reach)
          ? 1
          : this.highContrast
            ? OUT_OF_REACH_ALPHA_HC
            : OUT_OF_REACH_ALPHA;
      const state = current.anchorStates[i];
      // Timed off or one-use spent (GMR-60): the ring fades out; its marks below say why.
      const gone = state?.spent ? 0 : state && !state.active ? 0.18 : 1;
      const shown = easeAlpha(this.anchorAlpha[i] ?? target * gone, target * gone, dt);
      this.anchorAlpha[i] = shown;
      this.kit.setAnchorAlpha(i, shown);
      if (state) this.drawAnchorState(g, p, m(radius), state, i);
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
          this.pencil,
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
      // The rope draws itself on from the hand to the anchor in a few frames (visual only).
      const drawn = this.juice.ropeDrawn(this.reducedMotion);
      const tip =
        drawn >= 1
          ? anchor
          : { x: hand.x + (anchor.x - hand.x) * drawn, y: hand.y + (anchor.y - hand.y) * drawn };
      dashedInk(g, tip, hand, m(0.2), m(0.13), this.highContrast ? 3.4 : 2.6, INK);
    }

    this.juice.update(dt, current, this.reducedMotion);
    const heroView = {
      x: current.player.position.x,
      y: current.player.position.y,
      vx: current.player.velocity.x,
      vy: current.player.velocity.y,
      roped: !!current.rope,
    };
    this.doodles?.update(dt, heroView, this.reducedMotion, this.titleCard !== null);
    this.doodles?.draw(this.cameras.main.worldView, heroView, this.reducedMotion);
    this.juice.draw(
      g,
      player,
      current.player.velocity,
      this.highContrast ? 2.6 : 2,
      this.reducedMotion,
    );
    this.heroG.clear();
    this.drawPlayer(this.heroG, player, current, frame);
    this.poolG.clear();
    drawPoolSurfaces(
      this.poolG,
      this.pools,
      this.cameras.main.worldView,
      this.time.now / 1000,
      this.reducedMotion,
    );

    const miss = current.lastExitAttempt;
    const missAge = miss ? current.tick - miss.tick : Infinity;
    const visibleMiss =
      miss !== null && !miss.accepted && missAge >= 0 && missAge < 90 && !current.completion;
    this.exitMiss.setVisible(visibleMiss);
    if (visibleMiss) {
      const at = { x: m(miss.at.x), y: m(miss.at.y) };
      const fade = Math.min(1, (90 - missAge) / 30);
      g.lineStyle(2.5, INK, fade);
      const r = m(0.16);
      g.lineBetween(at.x - r, at.y - r, at.x + r, at.y + r);
      g.lineBetween(at.x - r, at.y + r, at.x + r, at.y - r);
      this.exitMiss
        .setPosition(at.x, at.y - m(0.35))
        .setAlpha(fade)
        .setText(exitMissMessage(miss, this.opts.level.exit));
    }

    // Aim reticle: ink when a rope press would connect, pencil otherwise. Red is reserved for
    // lethal things (GMR-56 H1), so an invalid shot is pencil too; its impact cross still shows
    // which anchor is selected.
    const target = current.target;
    if (target?.impact) {
      const ip = { x: m(target.impact.x), y: m(target.impact.y) };
      const c = m(0.1) * this.reticleScale;
      g.lineStyle(2 * this.reticleScale, target.valid ? INK : this.pencil, 0.95);
      g.lineBetween(ip.x - c, ip.y - c, ip.x + c, ip.y + c);
      g.lineBetween(ip.x - c, ip.y + c, ip.x + c, ip.y - c);
    }
    // Snap assist (GMR-27, opt-in): never silent. A highlighter swipe and a pencil dashed line
    // from the aim to the snapped impact point show that the assist chose the anchor.
    if (target?.snapped && target.impact && current.aim) {
      const from = { x: m(current.aim.x), y: m(current.aim.y) };
      const to = { x: m(target.impact.x), y: m(target.impact.y) };
      g.lineStyle(m(0.16), HIGHLIGHTER, 0.5).lineBetween(from.x, from.y, to.x, to.y);
      dashedInk(g, from, to, m(0.1), m(0.08), 1.6, target.valid ? INK : this.pencil);
    }
    if (current.aim) {
      const a = { x: m(current.aim.x), y: m(current.aim.y) };
      const r = m(0.18) * this.reticleScale;
      const tone = target?.valid ? INK : this.pencil;
      g.lineStyle(1.6 * this.reticleScale, tone, 0.9);
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
      const tone = reached ? INK : this.pencil;
      g.lineStyle(2.2 * this.lineScale(), tone, reached ? 1 : 0.7);
      g.lineBetween(base.x, base.y, top.x, top.y);
      const p0 = { x: top.x, y: top.y };
      const p1 = { x: top.x + m(0.5), y: top.y + m(0.16) };
      const p2 = { x: top.x, y: top.y + m(0.34) };
      if (reached) g.fillStyle(INK, 0.9).fillTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
      else strokeInk(g, [p0, p1, p2, p0], 1.8 * this.lineScale(), this.pencil, 0.8, i);
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
      g.fillStyle(this.pencil, 0.35);
      for (let i = 0; i < prev.path.length; i += 4) {
        const p = prev.path[i] as Vec2;
        g.fillCircle(m(p.x), m(p.y), 1.4 * this.lineScale());
      }
      g.lineStyle(1.4 * this.lineScale(), this.pencil, 0.7);
      for (const p of prev.impacts) {
        g.strokeCircle(m(p.x), m(p.y), m(0.14));
        g.fillStyle(this.pencil, 0.8).fillCircle(m(p.x), m(p.y), m(0.035));
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
      dashedInk(g, anchor, hand, m(0.2), m(0.13), 2, this.pencil);
    }
    drawHero(g, {
      c,
      facing: current.player.facing,
      velocity: current.player.velocity,
      mode: current.player.mode,
      hand,
      time: current.tick / 60,
      line: this.lineScale(),
      ink: this.pencil,
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

  /**
   * Timed and one-use marks (GMR-60, doc 09 H3). A timed ring is drawn as 8 segments that erase in
   * turn: over the last half of its on span (at least 0.5 s) paper-coloured arcs rub out the ring
   * one eighth at a time, clockwise from 12 o'clock. While it is off, the faded ring sits inside a
   * dashed pencil circle and its segments draw back in as it returns. A one-use anchor carries a pen
   * crack; once released it is erased, leaving a faint pencil ghost of the crack.
   */
  private drawAnchorState(
    g: Phaser.GameObjects.Graphics,
    p: Pt,
    r: number,
    state: SimSnapshot['anchorStates'][number],
    seed: number,
  ): void {
    const fx = this.anchorFx;
    if (state.span !== null && state.ticksLeft !== null) {
      const segments = 8;
      let erased: number;
      if (state.active) {
        const warn = Math.max(30, Math.round(state.span / 2));
        erased =
          state.ticksLeft >= warn ? 0 : segments - Math.ceil((segments * state.ticksLeft) / warn);
      } else {
        erased = segments - Math.floor((segments * (state.span - state.ticksLeft)) / state.span);
        g.lineStyle(1.4, this.pencil, 0.8);
        for (let k = 0; k < 16; k += 2) {
          g.beginPath();
          g.arc(p.x, p.y, r * 1.25, (k / 16) * Math.PI * 2, ((k + 1) / 16) * Math.PI * 2);
          g.strokePath();
        }
      }
      fx.lineStyle(r * 0.5, PAPER, 1);
      for (let k = 0; k < erased; k++) {
        const a0 = -Math.PI / 2 + (k / segments) * Math.PI * 2;
        fx.beginPath();
        fx.arc(p.x, p.y, r * 0.86, a0 - 0.02, a0 + (Math.PI * 2) / segments + 0.02);
        fx.strokePath();
      }
      // Hairline gaps between the 8 segments: the ring reads as a clock even when full.
      fx.lineStyle(Math.max(1.5, r * 0.07), PAPER, 1);
      for (let k = 0; k < segments; k++) {
        const a = -Math.PI / 2 + (k / segments) * Math.PI * 2;
        fx.lineBetween(
          p.x + Math.cos(a) * r * 0.6,
          p.y + Math.sin(a) * r * 0.6,
          p.x + Math.cos(a) * r * 1.12,
          p.y + Math.sin(a) * r * 1.12,
        );
      }
    }
    if (state.oneUse) {
      const crack = [
        { x: p.x - r * 0.55, y: p.y - r * 0.75 },
        { x: p.x - r * 0.12, y: p.y - r * 0.2 },
        { x: p.x - r * 0.34, y: p.y + r * 0.05 },
        { x: p.x + r * 0.2, y: p.y + r * 0.72 },
      ];
      strokeInk(
        state.spent ? g : fx,
        crack,
        state.spent ? 1.2 : 2.2,
        state.spent ? this.pencil : INK,
        state.spent ? 0.35 : 0.95,
        seed + 211,
      );
    }
  }

  private drawAnchor(_g: Phaser.GameObjects.Graphics, p: Pt, i: number): void {
    this.kit.moveAnchor(i, p.x, p.y);
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
    if (s.resets !== this.animResets) {
      this.animResets = s.resets;
      this.animator.reset();
    }
    const anim = this.animator.step(
      {
        mode: s.player.mode,
        velocity: s.player.velocity,
        rope:
          s.player.mode === 'tethered' && s.rope
            ? vec2(s.rope.point.x - s.player.position.x, s.rope.point.y - s.player.position.y)
            : null,
      },
      Math.min(0.05, this.game.loop.delta / 1000),
    );
    const pose: HeroPose = {
      c,
      facing: s.player.facing,
      velocity: s.player.velocity,
      mode: s.player.mode,
      hand,
      time: this.time.now / 1000,
      line: this.lineScale(),
      anim,
      spriteHead: this.head.ready,
    };
    drawHero(g, pose);
    this.head.place(heroHeadTransform(pose), anim.head, s.player.facing);
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
      this.opts.showExitResult !== false &&
        completion !== null &&
        completion.accepted &&
        !this.bodies.sweeping &&
        !this.pageTurnPresentation().active,
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
