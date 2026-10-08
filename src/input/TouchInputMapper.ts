import type { Intent, Vec2 } from '../core';
import type { ScreenToWorld } from './DesktopInputMapper';

/**
 * Mobile landscape control candidates (GMR-27). All of them produce the same hardware-agnostic
 * intents as the desktop mapper: move, jump and rope (aim is part of rope), plus restart and pause
 * UI. The simulation never knows which scheme is in use.
 *
 * - `direct-touch`: touch-and-hold anywhere in the play area. The touch point is the aim; the rope
 *   presses on touch-down and releases on touch-up. The finger covers the target.
 * - `reticle-offset`: as direct-touch, but the aim is `reticleOffset` CSS px above the finger, so
 *   the finger does not cover the target. A reticle follows the finger.
 * - `drag-aim`: a persistent on-screen reticle (a virtual cursor, re-projected every tick like the
 *   desktop mouse). Dragging anywhere in the play area moves it by finger delta × `dragGain`
 *   (relative, so it is never under the finger) without touching the rope. The rope button is
 *   plain hold-to-tether: touch-down presses at the reticle, lift releases. Dragging the
 *   rope-button touch also moves the reticle, so the next shot can be lined up mid-swing.
 */
export type TouchScheme = 'direct-touch' | 'drag-aim' | 'reticle-offset';
export const TOUCH_SCHEMES: readonly TouchScheme[] = ['direct-touch', 'drag-aim', 'reticle-offset'];

/** Digital: two left/right zones (axis -1/+1). Analog: a stick (axis in [-1, 1]). */
export type MoveStyle = 'digital' | 'analog';

/** Safe-area insets in CSS px (env(safe-area-inset-*), read by the app layer). */
export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface TouchOptions {
  readonly scheme: TouchScheme;
  readonly moveStyle: MoveStyle;
  /** Control size multiplier (accessibility / hand size). */
  readonly scale: number;
  /** reticle-offset: aim distance above the finger, CSS px. */
  readonly reticleOffset: number;
  /** drag-aim: reticle travel per finger travel. */
  readonly dragGain: number;
  /** analog: centre dead zone as a fraction of the stick radius. */
  readonly deadzone: number;
}

export const DEFAULT_TOUCH_OPTIONS: TouchOptions = {
  scheme: 'direct-touch',
  moveStyle: 'digital',
  scale: 1,
  reticleOffset: 64,
  dragGain: 1.6,
  deadzone: 0.18,
};

export type TouchControlId = 'left' | 'right' | 'stick' | 'jump' | 'rope' | 'pause' | 'restart';

/** A round control in CSS px. `hit` is the touch radius (larger than the drawn radius). */
export interface TouchControl {
  readonly id: TouchControlId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly hit: number;
}

export interface TouchLayout {
  readonly width: number;
  readonly height: number;
  readonly controls: readonly TouchControl[];
  /** Bottom-left move zone: touches here steer, wherever the thumb lands in it. */
  readonly moveZone: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
}

export type TouchRole = 'move' | 'jump' | 'rope' | 'aim' | 'pause' | 'restart' | 'ignored';

/** Plain state for the on-screen control view (render reads it; no input import there). */
export interface TouchControlsState {
  readonly active: boolean;
  readonly scheme: TouchScheme;
  readonly moveStyle: MoveStyle;
  readonly controls: readonly {
    readonly id: TouchControlId;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly pressed: boolean;
    /** Analog stick knob position, CSS px. */
    readonly knob: { readonly x: number; readonly y: number } | null;
  }[];
  /** Aim reticle in CSS px when the scheme shows its own (offset or drag cursor). */
  readonly reticle: { readonly x: number; readonly y: number } | null;
  /** Where the aim is driven from (finger or rope button), for a leader line to the reticle. */
  readonly leaderFrom: { readonly x: number; readonly y: number } | null;
  /** Active touches with their role (touch lab: overlap and occlusion metrics). */
  readonly touches: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly role: TouchRole;
  }[];
  /** Current move axis. */
  readonly axis: number;
}

interface Pointer {
  role: TouchRole;
  x: number;
  y: number;
}

/** Analog axes are quantised so replays stay compact and noise does not spam intents. */
const AXIS_STEPS = 20;

/**
 * Touch → intents. Takes normalized pointer events (id, CSS px relative to the canvas), so it is
 * testable without a DOM; `bindTouchDom` wires it to real events. Each pointer id is tracked
 * independently, so move, jump and rope overlap freely.
 */
export class TouchInputMapper {
  private opts: TouchOptions;
  private width = 0;
  private height = 0;
  private insets: SafeAreaInsets = NO_INSETS;
  private cachedLayout: TouchLayout | null = null;
  private readonly pointers = new Map<number, Pointer>();
  private axis = 0;
  private ropeHeld = false;
  /** drag-aim virtual cursor, CSS px. Null until the first layout. */
  private cursor: { x: number; y: number } | null = null;
  private lastAim: Vec2 | null = null;
  private activeFlag = false;

  constructor(
    private readonly emit: (intent: Intent) => void,
    private readonly screenToWorld: ScreenToWorld,
    options: Partial<TouchOptions> = {},
  ) {
    this.opts = { ...DEFAULT_TOUCH_OPTIONS, ...options };
  }

  get options(): TouchOptions {
    return this.opts;
  }

  /** True once a touch arrived (or the app forced touch mode): the overlay is shown. */
  get active(): boolean {
    return this.activeFlag;
  }

  activate(): void {
    this.activeFlag = true;
  }

  /** Viewport size and safe-area insets, CSS px. Re-lays out the controls. */
  setViewport(width: number, height: number, insets: SafeAreaInsets = NO_INSETS): void {
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.cachedLayout = null;
    if (this.cursor) {
      this.cursor = { x: clamp(this.cursor.x, 0, width), y: clamp(this.cursor.y, 0, height) };
    }
  }

  /** Switch scheme at runtime. Everything held is released; current touches are ignored. */
  setScheme(scheme: TouchScheme): void {
    if (scheme === this.opts.scheme) return;
    this.releaseAll();
    this.opts = { ...this.opts, scheme };
    this.cachedLayout = null;
  }

  setMoveStyle(moveStyle: MoveStyle): void {
    if (moveStyle === this.opts.moveStyle) return;
    this.releaseAll();
    this.opts = { ...this.opts, moveStyle };
    this.cachedLayout = null;
  }

  /** Other options (scale, offsets, gain). Releases everything if the layout changes. */
  configure(options: Partial<Omit<TouchOptions, 'scheme' | 'moveStyle'>>): void {
    this.releaseAll();
    this.opts = { ...this.opts, ...options };
    this.cachedLayout = null;
  }

  layout(): TouchLayout {
    this.cachedLayout ??= computeLayout(this.width, this.height, this.insets, this.opts);
    return this.cachedLayout;
  }

  pointerDown(id: number, x: number, y: number): void {
    this.activeFlag = true;
    if (this.pointers.has(id)) this.pointerUp(id); // a lost up event: never leave a role stuck
    const role = this.classify(x, y);
    const p: Pointer = { role, x, y };
    this.pointers.set(id, p);
    switch (role) {
      case 'jump':
        if (this.countRole('jump') === 1) this.emit({ type: 'jumpPress' });
        break;
      case 'move':
        this.updateAxis();
        break;
      case 'rope':
        this.ropeHeld = true;
        this.emitAim(true);
        this.emit({ type: 'ropePress' });
        break;
      case 'pause':
        this.emit({ type: 'pause' });
        break;
      case 'restart':
        this.emit({ type: 'restart' });
        break;
      case 'aim':
      case 'ignored':
        break;
    }
  }

  pointerMove(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (p.role === 'move') this.updateAxis();
    if (this.opts.scheme === 'drag-aim' && (p.role === 'aim' || p.role === 'rope')) {
      this.moveCursor(dx * this.opts.dragGain, dy * this.opts.dragGain);
      this.emitAim(false);
    }
    // direct-touch / reticle-offset ropes re-aim in beforeTick, like the desktop mouse.
  }

  pointerUp(id: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    switch (p.role) {
      case 'jump':
        if (this.countRole('jump') === 0) this.emit({ type: 'jumpRelease' });
        break;
      case 'move':
        this.updateAxis();
        break;
      case 'rope':
        if (this.countRole('rope') === 0 && this.ropeHeld) {
          this.ropeHeld = false;
          this.emit({ type: 'ropeRelease' });
        }
        break;
      default:
        break;
    }
  }

  /** The OS took the touch (gesture, notification shade): same as lifting it. */
  pointerCancel(id: number): void {
    this.pointerUp(id);
  }

  /** Window lost focus or the page was hidden: release everything and forget every touch. */
  blur(): void {
    this.releaseAll();
    this.pointers.clear();
  }

  /** Once per simulation tick: the aim follows a held finger (or the cursor) under a moving camera. */
  beforeTick(): void {
    if (!this.activeFlag) return;
    this.emitAim(false);
  }

  state(): TouchControlsState {
    const layout = this.layout();
    const pressed = new Set<TouchControlId>();
    let knob: { x: number; y: number } | null = null;
    const stick = layout.controls.find((c) => c.id === 'stick');
    for (const p of this.pointers.values()) {
      if (p.role === 'jump') pressed.add('jump');
      if (p.role === 'pause') pressed.add('pause');
      if (p.role === 'restart') pressed.add('restart');
      if (p.role === 'rope' && this.opts.scheme === 'drag-aim') pressed.add('rope');
    }
    if (this.axis < 0) pressed.add('left');
    if (this.axis > 0) pressed.add('right');
    const mover = this.latest('move');
    if (stick && mover) {
      pressed.add('stick');
      const dx = mover.x - stick.x;
      const dy = mover.y - stick.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const k = len > stick.r ? stick.r / len : 1;
      knob = { x: stick.x + dx * k, y: stick.y + dy * k };
    }
    const aimFrom = this.aimScreenPoint();
    let reticle: { x: number; y: number } | null = null;
    let leaderFrom: { x: number; y: number } | null = null;
    if (this.opts.scheme === 'drag-aim') {
      reticle = aimFrom;
      const driver = this.latest('rope') ?? this.latest('aim');
      if (driver) leaderFrom = { x: driver.x, y: driver.y };
    } else if (this.opts.scheme === 'reticle-offset') {
      const rope = this.latest('rope');
      if (rope && aimFrom) {
        reticle = aimFrom;
        leaderFrom = { x: rope.x, y: rope.y };
      }
    }
    return {
      active: this.activeFlag,
      scheme: this.opts.scheme,
      moveStyle: this.opts.moveStyle,
      controls: layout.controls.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        r: c.r,
        pressed: pressed.has(c.id),
        knob: c.id === 'stick' ? (knob ?? { x: c.x, y: c.y }) : null,
      })),
      reticle,
      leaderFrom,
      touches: [...this.pointers.entries()].map(([id, p]) => ({
        id,
        x: p.x,
        y: p.y,
        role: p.role,
      })),
      axis: this.axis,
    };
  }

  // --- internals -------------------------------------------------------------------------------

  private classify(x: number, y: number): TouchRole {
    const layout = this.layout();
    // Nearest control whose touch radius contains the point wins (controls never steal from
    // each other at the overlap).
    let best: TouchControl | null = null;
    let bestD = Infinity;
    for (const c of layout.controls) {
      if (c.id === 'left' || c.id === 'right' || c.id === 'stick') continue;
      const d = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2);
      if (d <= c.hit && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      if (best.id === 'rope') return this.countRole('rope') > 0 ? 'ignored' : 'rope';
      return best.id as TouchRole;
    }
    const z = layout.moveZone;
    if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return 'move';
    if (this.opts.scheme === 'drag-aim') return 'aim';
    // direct-touch / reticle-offset: one rope finger at a time; extra play-area touches do nothing.
    return this.countRole('rope') > 0 ? 'ignored' : 'rope';
  }

  private updateAxis(): void {
    const mover = this.latest('move');
    let axis = 0;
    if (mover) {
      const layout = this.layout();
      if (this.opts.moveStyle === 'digital') {
        const left = layout.controls.find((c) => c.id === 'left');
        const right = layout.controls.find((c) => c.id === 'right');
        const split = left && right ? (left.x + right.x) / 2 : layout.moveZone.x1 / 2;
        axis = mover.x < split ? -1 : 1;
      } else {
        const stick = layout.controls.find((c) => c.id === 'stick');
        if (stick) {
          const raw = clamp((mover.x - stick.x) / stick.r, -1, 1);
          const mag = Math.abs(raw);
          const dz = this.opts.deadzone;
          const scaled = mag <= dz ? 0 : (mag - dz) / (1 - dz);
          axis = Math.round(Math.sign(raw) * scaled * AXIS_STEPS) / AXIS_STEPS;
          if (Object.is(axis, -0)) axis = 0;
        }
      }
    }
    if (axis !== this.axis) {
      this.axis = axis;
      this.emit({ type: 'move', axis });
    }
  }

  /** The screen point the aim comes from, per scheme. */
  private aimScreenPoint(): { x: number; y: number } | null {
    if (this.opts.scheme === 'drag-aim') {
      this.cursor ??= this.defaultCursor();
      return this.cursor;
    }
    const rope = this.latest('rope');
    if (!rope) return null;
    if (this.opts.scheme === 'reticle-offset') {
      return { x: rope.x, y: Math.max(0, rope.y - this.opts.reticleOffset * this.opts.scale) };
    }
    return { x: rope.x, y: rope.y };
  }

  private emitAim(force: boolean): void {
    const at = this.aimScreenPoint();
    if (!at) return;
    const target = this.screenToWorld(at.x, at.y);
    if (!force && this.lastAim && this.lastAim.x === target.x && this.lastAim.y === target.y)
      return;
    this.lastAim = target;
    this.emit({ type: 'ropeAim', target });
  }

  private moveCursor(dx: number, dy: number): void {
    const c = this.cursor ?? this.defaultCursor();
    this.cursor = { x: clamp(c.x + dx, 0, this.width), y: clamp(c.y + dy, 0, this.height) };
  }

  private defaultCursor(): { x: number; y: number } {
    return { x: this.width * 0.62, y: this.height * 0.3 };
  }

  /** Release every held intent and mark current touches ignored until they lift. */
  private releaseAll(): void {
    const jumpHeld = this.countRole('jump') > 0;
    for (const p of this.pointers.values()) p.role = 'ignored';
    if (jumpHeld) this.emit({ type: 'jumpRelease' });
    if (this.ropeHeld) {
      this.ropeHeld = false;
      this.emit({ type: 'ropeRelease' });
    }
    if (this.axis !== 0) {
      this.axis = 0;
      this.emit({ type: 'move', axis: 0 });
    }
  }

  private countRole(role: TouchRole): number {
    let n = 0;
    for (const p of this.pointers.values()) if (p.role === role) n++;
    return n;
  }

  /** The most recently pressed pointer with this role (Map keeps insertion order). */
  private latest(role: TouchRole): Pointer | null {
    let found: Pointer | null = null;
    for (const p of this.pointers.values()) if (p.role === role) found = p;
    return found;
  }
}

/**
 * Control layout for a landscape viewport. The base unit scales with the short side, clamped to
 * a thumb-sized range, times `scale`; everything is pushed in by the safe-area insets.
 */
export function computeLayout(
  width: number,
  height: number,
  insets: SafeAreaInsets,
  opts: Pick<TouchOptions, 'scheme' | 'moveStyle' | 'scale'>,
): TouchLayout {
  const u = clamp(Math.min(width, height) * 0.12, 40, 76) * opts.scale;
  const margin = u * 0.45;
  const bottom = height - insets.bottom - margin - u;
  const left = insets.left + margin;
  const right = width - insets.right - margin;
  const controls: TouchControl[] = [];
  let zoneRight: number;
  if (opts.moveStyle === 'digital') {
    const lx = left + u;
    const rx = lx + u * 2.3;
    controls.push({ id: 'left', x: lx, y: bottom, r: u, hit: u * 1.15 });
    controls.push({ id: 'right', x: rx, y: bottom, r: u, hit: u * 1.15 });
    zoneRight = rx + u * 1.4;
  } else {
    const sr = u * 1.25;
    const sx = left + sr;
    controls.push({ id: 'stick', x: sx, y: height - insets.bottom - margin - sr, r: sr, hit: sr });
    zoneRight = sx + sr * 1.6;
  }
  const jump = { id: 'jump' as const, x: right - u, y: bottom, r: u, hit: u * 1.25 };
  controls.push(jump);
  if (opts.scheme === 'drag-aim') {
    controls.push({ id: 'rope', x: jump.x - u * 2.2, y: jump.y - u * 0.9, r: u, hit: u * 1.2 });
  }
  const small = u * 0.42;
  const topY = insets.top + 58 + small;
  controls.push({ id: 'pause', x: right - small, y: topY, r: small, hit: small * 1.5 });
  controls.push({ id: 'restart', x: right - small * 3.6, y: topY, r: small, hit: small * 1.5 });
  return {
    width,
    height,
    controls,
    moveZone: { x0: 0, y0: height * 0.4, x1: Math.min(zoneRight, width * 0.42), y1: height },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Attach the mapper to DOM pointer events from touch (mouse and pen stay with the desktop mapper).
 * `onFirstTouch` fires once, on the first touch, so the app can show the overlay.
 */
export function bindTouchDom(
  target: HTMLElement,
  mapper: TouchInputMapper,
  onFirstTouch?: () => void,
): () => void {
  let seen = false;
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    if (!seen) {
      seen = true;
      onFirstTouch?.();
    }
    const p = local(e);
    mapper.pointerDown(e.pointerId, p.x, p.y);
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    const p = local(e);
    mapper.pointerMove(e.pointerId, p.x, p.y);
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    mapper.pointerUp(e.pointerId);
  };
  const onCancel = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    mapper.pointerCancel(e.pointerId);
  };
  const onBlur = (): void => {
    mapper.blur();
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') mapper.blur();
  };
  // Long-press callouts and double-tap zoom must not steal game touches.
  const prevent = (e: Event): void => {
    e.preventDefault();
  };
  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  target.addEventListener('touchstart', prevent, { passive: false });
  target.addEventListener('contextmenu', prevent);
  return () => {
    target.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    target.removeEventListener('touchstart', prevent);
    target.removeEventListener('contextmenu', prevent);
  };
}
