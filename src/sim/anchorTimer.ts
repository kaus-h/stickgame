import { SIM_DT } from '../core';
import type { AnchorDef } from './level';

/**
 * Timed anchors (GMR-60). The schedule is counted in whole simulation ticks from the start of the
 * attempt, so it is exact, frame-rate independent and restarts with every reset or respawn. An
 * anchor without a timer is always usable.
 */
export interface AnchorTimerState {
  /** Usable for targeting and holding a rope this tick. */
  readonly active: boolean;
  /** Ticks until the state flips (null for an untimed anchor). Drives the telegraph. */
  readonly ticksLeft: number | null;
  /** Length of the current on or off span, ticks (null for an untimed anchor). */
  readonly span: number | null;
}

const ALWAYS: AnchorTimerState = { active: true, ticksLeft: null, span: null };

const ticks = (seconds: number): number => Math.max(1, Math.round(seconds / SIM_DT));

export function anchorTimerState(def: AnchorDef, attemptTick: number): AnchorTimerState {
  const timer = def.timed;
  if (!timer) return ALWAYS;
  const on = ticks(timer.on);
  const off = ticks(timer.off);
  const cycle = on + off;
  const t = (attemptTick + Math.round((timer.phase ?? 0) * cycle)) % cycle;
  return t < on
    ? { active: true, ticksLeft: on - t, span: on }
    : { active: false, ticksLeft: cycle - t, span: off };
}
