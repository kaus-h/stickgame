import type { Vec2 } from '../core';

/**
 * Side-scrolling camera (GMR-25). Pure maths in world meters so it can be tested without Phaser.
 *
 * Outcome of the camera lab: a **hybrid follow camera**. It tracks the player with velocity
 * lookahead, eases toward the target, snaps on reset, and never zooms dynamically. Zoom depends
 * only on the viewport: show `viewHeight` meters of world vertically, but never less than
 * `minViewWidth` horizontally, so narrow screens still see every anchor a rope can reach ahead.
 */
export interface CameraParams {
  /** World meters visible vertically on a normal landscape screen. */
  readonly viewHeight: number;
  /** Minimum world meters visible horizontally (narrow/portrait screens zoom out to keep it). */
  readonly minViewWidth: number;
  /** Seconds of horizontal velocity to look ahead, capped at `lookaheadMax` meters. */
  readonly lookaheadTime: number;
  readonly lookaheadMax: number;
  /** Seconds of vertical velocity to look ahead, clamped to [verticalMin, verticalMax] meters. */
  readonly verticalLookaheadTime: number;
  readonly verticalMin: number;
  readonly verticalMax: number;
  /**
   * Framing offset: positive keeps the player above center, so less empty sky and more of the
   * ground they run on. Anchor attention lifts the frame whenever a rope target is in reach.
   */
  readonly verticalBias: number;
  /** Exponential ease rate, 1/s. */
  readonly smoothing: number;
}

export const DEFAULT_CAMERA: CameraParams = {
  viewHeight: 12,
  // 2 × (rope maxLength 11 m + anchor radius 0.4 m) ≈ 23 m: an anchor at full rope range ahead
  // (or behind) is on screen even while standing still. 16:9 shows 23 × 12.9 m.
  minViewWidth: 23,
  lookaheadTime: 0.35,
  lookaheadMax: 3,
  verticalLookaheadTime: 0.12,
  verticalMin: -1.5,
  verticalMax: 2,
  verticalBias: 1,
  smoothing: 6,
};

/**
 * Reduced motion (GMR-44): no velocity lookahead, so the camera only moves when the player does,
 * never swinging ahead of them. Framing, zoom and anchor attention are unchanged.
 */
export const CALM_CAMERA: CameraParams = {
  ...DEFAULT_CAMERA,
  lookaheadTime: 0,
  verticalLookaheadTime: 0,
};

/** Pixels per world meter for a viewport (fixed per viewport size; never animated). */
export function cameraScale(viewportW: number, viewportH: number, p: CameraParams): number {
  return Math.min(viewportH / p.viewHeight, viewportW / p.minViewWidth);
}

/** Where the camera wants to be centered for this player state. */
export function cameraTarget(position: Vec2, velocity: Vec2, p: CameraParams): Vec2 {
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  return {
    x: position.x + clamp(velocity.x * p.lookaheadTime, -p.lookaheadMax, p.lookaheadMax),
    y:
      position.y +
      clamp(velocity.y * p.verticalLookaheadTime, p.verticalMin, p.verticalMax) +
      p.verticalBias,
  };
}

/** Ease the camera center toward the target; `snap` (reset, first frame) jumps there. */
export function stepCamera(
  center: Vec2,
  target: Vec2,
  dt: number,
  p: CameraParams,
  snap: boolean,
): Vec2 {
  if (snap) return target;
  const k = 1 - Math.exp(-dt * p.smoothing);
  return { x: center.x + (target.x - center.x) * k, y: center.y + (target.y - center.y) * k };
}

/** Clamp a center so the view stays inside the level bounds (axis centered if the level is smaller). */
export function clampToBounds(
  center: Vec2,
  viewW: number,
  viewH: number,
  b: { minX: number; minY: number; maxX: number; maxY: number },
): Vec2 {
  const axis = (c: number, half: number, lo: number, hi: number): number =>
    hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, c));
  return {
    x: axis(center.x, viewW / 2, b.minX, b.maxX),
    y: axis(center.y, viewH / 2, b.minY, b.maxY),
  };
}

/** An anchor as the camera frames it: the whole span it can occupy (movers sweep a path). */
export interface FramedAnchor {
  readonly minX: number;
  readonly maxX: number;
  /** Highest point of its disc anywhere on its path (y down, so the smallest y). */
  readonly top: number;
  /** Lowest point of its disc anywhere on its path. */
  readonly bottom: number;
  /** A static anchor's center (movers have none), for the line-of-sight check. */
  readonly center?: Vec2 | undefined;
}

/** A level solid as the camera sees it: an outline that blocks a rope's line of sight. */
export interface SightBlocker {
  readonly kind?: string;
  readonly points: readonly Vec2[];
}

/** True when the segment from `a` to `b` crosses the outline of a solid (hazards never block). */
export function sightBlocked(a: Vec2, b: Vec2, solids: readonly SightBlocker[]): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2): number =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  for (const solid of solids) {
    if (solid.kind !== undefined && solid.kind !== 'solid') continue;
    const n = solid.points.length;
    for (let i = 0; i < n; i++) {
      const p = solid.points[i];
      const q = solid.points[(i + 1) % n];
      if (!p || !q) continue;
      const d1 = cross(a, b, p);
      const d2 = cross(a, b, q);
      const d3 = cross(p, q, a);
      const d4 = cross(p, q, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

/** Keep the player at least this far above the bottom edge when the camera lifts for an anchor. */
export const ATTENTION_FLOOR = 1.5;
/** Clear space above a framed anchor, m. */
export const ATTENTION_MARGIN = 0.5;
/** Seconds of fall speed kept as extra room below the player while lifting (camera lag). */
export const ATTENTION_FALL_LAG = 0.3;
/** Screen pixels the HUD (title, run and life timers) covers at the top; framed anchors stay below. */
export const HUD_BAND_PX = 80;
/** Seconds of travel ahead at which a hidden anchor may come into line of sight. */
export const ATTENTION_SIGHT_LEAD = 0.5;
/** Frame anchors this much before they come into rope reach, m. */
export const ATTENTION_EARLY = 4;

/**
 * Anchor attention (GMR-44). Wide screens are height-bound (12 m tall), so an anchor 7–8 m above
 * the player can sit just off the top of the frame. When an anchor within rope reach is above the
 * frame, lift the target until its whole path is visible, but never so far that the player ends up
 * within ATTENTION_FLOOR of the bottom edge. Render-only: it moves the camera, never targeting.
 */
export function attentionTarget(
  target: Vec2,
  player: Vec2,
  velocity: Vec2,
  anchors: readonly FramedAnchor[],
  viewW: number,
  viewH: number,
  reach: number,
  /** World meters at the top of the frame hidden by the HUD (HUD_BAND_PX at the current scale). */
  topInset = 0,
  /** Level solids: a static anchor the player has no line of sight to cannot be roped, so it is not framed. */
  solids: readonly SightBlocker[] = [],
): Vec2 {
  let need = Infinity;
  // Lowest point that must stay on screen. While falling, the eased camera trails the target, so
  // keep extra room below the player in proportion to the fall speed (about the camera's lag).
  let floor = player.y + ATTENTION_FLOOR + Math.max(0, velocity.y) * ATTENTION_FALL_LAG;
  const ahead = {
    x: player.x + velocity.x * ATTENTION_SIGHT_LEAD,
    y: player.y + velocity.y * ATTENTION_SIGHT_LEAD,
  };
  const aheadBlocked = sightBlocked(player, ahead, solids);
  for (const a of anchors) {
    // Off screen horizontally: measured from the target, which leads a running player.
    const sx = target.x < a.minX ? a.minX - target.x : target.x > a.maxX ? target.x - a.maxX : 0;
    if (sx > viewW / 2) continue;
    // Distance to the nearest point of the anchor's whole path box (a mover can come close).
    const dx = player.x < a.minX ? a.minX - player.x : player.x > a.maxX ? player.x - a.maxX : 0;
    const dy = player.y < a.top ? a.top - player.y : player.y > a.bottom ? player.y - a.bottom : 0;
    // Start framing a little before the anchor is in reach, so the camera has settled by the shot.
    if (Math.hypot(dx, dy) > reach + ATTENTION_EARLY) continue;
    // An anchor behind terrain that stays hidden for the next half second (say, above a ceiling
    // slab) cannot be roped, and framing it would pull the hazards below out of view. The
    // look-ahead point only counts if the player can get there: rising under a ceiling, the
    // straight-line extrapolation pokes through the slab and would see the anchor from above.
    if (
      a.center &&
      sightBlocked(player, a.center, solids) &&
      (aheadBlocked || sightBlocked(ahead, a.center, solids))
    )
      continue;
    need = Math.min(need, a.top - ATTENTION_MARGIN - topInset);
    floor = Math.max(floor, a.bottom + ATTENTION_MARGIN);
  }
  if (!Number.isFinite(need)) return target;
  const top = target.y - viewH / 2;
  if (need >= top) return target;
  // Never lift so far that the player or a lower anchor in reach drops off the bottom edge.
  const lowest = floor - viewH / 2;
  return { x: target.x, y: Math.max(need + viewH / 2, lowest) };
}

/** The camera's view of a level's anchors (path extents), computed once per level. */
export function framedAnchors(
  anchors: readonly {
    readonly position: Vec2;
    readonly radius: number;
    readonly path?: { readonly to: Vec2 };
  }[],
): FramedAnchor[] {
  return anchors.map((a) => {
    const to = a.path?.to ?? a.position;
    return {
      center: a.path ? undefined : a.position,
      minX: Math.min(a.position.x, to.x) - a.radius,
      maxX: Math.max(a.position.x, to.x) + a.radius,
      top: Math.min(a.position.y, to.y) - a.radius,
      bottom: Math.max(a.position.y, to.y) + a.radius,
    };
  });
}
