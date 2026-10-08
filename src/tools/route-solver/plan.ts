import { vec2, type Intent, type Vec2 } from '../../core';
import type { LevelDef, SimSnapshot } from '../../sim';

/**
 * A route as the player would input it: an ordered list of steps on absolute simulation ticks
 * (tick 0 = level start). Only the three verbs exist: Move (held axis), Jump (press + release)
 * and Rope (aim + press, release later). Nothing here can do what a player cannot.
 */
export type PlanStep =
  /** Hold the move axis from tick `t` on (digital input: -1, 0 or 1). */
  | { readonly t: number; readonly action: 'move'; readonly axis: -1 | 0 | 1 }
  /** Press jump on tick `t`, release on tick `t + hold` (variable jump height). */
  | { readonly t: number; readonly action: 'jump'; readonly hold: number }
  /**
   * Aim at `anchor` (impact point `offset` on its disc, see ROPE_OFFSETS) and press on tick `t`;
   * release on tick `release` (null: still held when the goal was reached).
   */
  | {
      readonly t: number;
      readonly action: 'rope';
      readonly anchor: number;
      readonly offset: number;
      readonly release: number | null;
    };

/**
 * Impact points on an anchor disc, as fractions of its radius: the centre, then the rim side
 * toward +x, -x, -y (up) and +y (down). Aim inside the disc is the exact impact point (doc 04).
 */
export const ROPE_OFFSETS: readonly Vec2[] = [
  vec2(0, 0),
  vec2(0.7, 0),
  vec2(-0.7, 0),
  vec2(0, -0.7),
  vec2(0, 0.7),
];

type PlanEvent =
  | { readonly kind: 'move'; readonly axis: number }
  | { readonly kind: 'jumpPress' }
  | { readonly kind: 'jumpRelease' }
  | { readonly kind: 'ropePress'; readonly anchor: number; readonly offset: number }
  | { readonly kind: 'ropeRelease' };

/** Order inside one tick: axis first, then releases before presses (re-shoot on one tick). */
const ORDER: Record<PlanEvent['kind'], number> = {
  move: 0,
  ropeRelease: 1,
  jumpRelease: 2,
  ropePress: 3,
  jumpPress: 4,
};

/**
 * Turns a plan into intents tick by tick. The rope aim is resolved against the anchor positions
 * of the tick it is pressed on, so a plan stays meaningful when a press is shifted in time
 * (moving anchors). Recorded replays store the resulting world-space aim point.
 */
export class PlanSource {
  private readonly byTick = new Map<number, PlanEvent[]>();

  constructor(
    steps: readonly PlanStep[],
    private readonly level: LevelDef,
  ) {
    const add = (t: number, e: PlanEvent) => {
      let list = this.byTick.get(t);
      if (!list) this.byTick.set(t, (list = []));
      list.push(e);
    };
    for (const s of steps) {
      if (s.action === 'move') add(s.t, { kind: 'move', axis: s.axis });
      else if (s.action === 'jump') {
        add(s.t, { kind: 'jumpPress' });
        add(s.t + s.hold, { kind: 'jumpRelease' });
      } else {
        add(s.t, { kind: 'ropePress', anchor: s.anchor, offset: s.offset });
        if (s.release !== null) add(s.release, { kind: 'ropeRelease' });
      }
    }
    for (const list of this.byTick.values()) list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  }

  /** Intents for `tick`; `before` gives the snapshot just before that tick is stepped. */
  intents(tick: number, before: () => SimSnapshot): Intent[] {
    const events = this.byTick.get(tick);
    if (!events) return [];
    const out: Intent[] = [];
    for (const e of events) {
      switch (e.kind) {
        case 'move':
          out.push({ type: 'move', axis: e.axis });
          break;
        case 'jumpPress':
          out.push({ type: 'jumpPress' });
          break;
        case 'jumpRelease':
          out.push({ type: 'jumpRelease' });
          break;
        case 'ropeRelease':
          out.push({ type: 'ropeRelease' });
          break;
        case 'ropePress':
          out.push({
            type: 'ropeAim',
            target: ropeAimPoint(this.level, before(), e.anchor, e.offset),
          });
          out.push({ type: 'ropePress' });
          break;
      }
    }
    return out;
  }
}

/** World-space aim for an anchor and impact offset at the current anchor position. */
export function ropeAimPoint(
  level: LevelDef,
  snap: SimSnapshot,
  anchor: number,
  offset: number,
): Vec2 {
  const at = snap.anchors[anchor] ?? level.anchors[anchor]?.position ?? vec2(0, 0);
  const r = level.anchors[anchor]?.radius ?? 0;
  const o = ROPE_OFFSETS[offset] ?? vec2(0, 0);
  return vec2(at.x + o.x * r, at.y + o.y * r);
}

/** Last tick on which the plan does anything (a pending release included). */
export function planLastTick(steps: readonly PlanStep[]): number {
  let last = -1;
  for (const s of steps) {
    const end = s.action === 'jump' ? s.t + s.hold : s.action === 'rope' ? (s.release ?? s.t) : s.t;
    last = Math.max(last, end);
  }
  return last;
}
