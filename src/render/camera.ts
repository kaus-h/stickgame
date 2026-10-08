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
  /** Framing offset: negative shows more space above the player (ropes go up). */
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
  verticalBias: -1,
  smoothing: 6,
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
