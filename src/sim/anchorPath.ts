import { dcos, dsin, vec2, type Vec2 } from '../core';
import type { AnchorDef } from './level';

/**
 * Moving-anchor path model (GMR-26). A path is a smooth ping-pong between `position` and `to`:
 *
 *   p(t) = position + (to - position) · (1 - cos(ω(t + phase·T))) / 2,   ω = 2π / T
 *
 * `phase` (0..1, default 0) shifts where in the cycle the anchor is at attempt tick 0: 0 starts at
 * `position` at rest, 0.25 at the midpoint moving fastest toward `to`, 0.5 at `to` at rest.
 * Velocity and acceleration are smooth (no jerks at reversal), and both peak values follow from the
 * authored numbers alone, so the content parser can enforce the safe envelope
 * (docs/moving-anchors.md).
 */
export interface AnchorPathState {
  readonly position: Vec2;
  readonly velocity: Vec2;
}

const TWO_PI = 2 * Math.PI;

/** Exact path position and velocity at time t (seconds since the attempt started). */
export function anchorPathState(def: AnchorDef, t: number): AnchorPathState {
  const path = def.path;
  if (!path) return { position: def.position, velocity: vec2(0, 0) };
  const w = TWO_PI / path.period;
  const arg = w * (t + (path.phase ?? 0) * path.period);
  const k = (1 - dcos(arg)) / 2;
  const dk = (w * dsin(arg)) / 2;
  const dx = path.to.x - def.position.x;
  const dy = path.to.y - def.position.y;
  return {
    position: vec2(def.position.x + dx * k, def.position.y + dy * k),
    velocity: vec2(dx * dk, dy * dk),
  };
}
