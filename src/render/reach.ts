import type { Vec2 } from '../core';

/** Anchors out of reach fade to pencil (GMR-56 H3); in reach they are full ink. */
export const OUT_OF_REACH_ALPHA = 0.4;
/** High contrast (GMR-50): out-of-reach anchors stay dimmer than live ones, but readable. */
export const OUT_OF_REACH_ALPHA_HC = 0.6;

/**
 * Whether any point of the anchor's impact disc is within max rope length of the player. This is
 * a drawing cue only: selection and the impact point stay with `resolveTarget` (doc 09 C1).
 */
export function anchorInReach(
  player: Vec2,
  anchor: Vec2,
  radius: number,
  maxLength: number,
): boolean {
  return Math.hypot(anchor.x - player.x, anchor.y - player.y) - radius <= maxLength;
}

/** Ease the drawn alpha toward its target so a ring never pops as the player crosses the range. */
export function easeAlpha(current: number, target: number, dt: number): number {
  const step = dt * 4;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
