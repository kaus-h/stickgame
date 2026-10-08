import type { DeathCause, SimEvent, SimSnapshot } from '../../sim';
import type { Vec2 } from '../../core';

/** One attempt as feedback remembers it: where the hero went and where ropes connected. */
export interface AttemptTrace {
  /** Player positions, one per tick from attempt tick 0 (world meters). */
  readonly path: readonly Vec2[];
  /** Impact points of every rope connection in the attempt. */
  readonly impacts: readonly Vec2[];
  /** How it ended. */
  readonly ended: 'death' | 'exit' | 'restart';
}

export interface DeathLabel {
  readonly text: string;
  readonly at: Vec2;
}

/** How many deaths in a row near the same spot before a handwritten cause label is shown. */
export const LABEL_AFTER_REPEATS = 3;
/** Two deaths count as "the same spot" within this distance (m). */
const SAME_SPOT_M = 2;
/** Cap on recorded ticks per attempt (5 minutes at 60 Hz). */
const MAX_TICKS = 18_000;

/**
 * Failure feedback state (GMR-43), fed only by snapshots and events, never by the simulation's
 * internals, and never able to delay the retry: it only remembers the previous attempt so the
 * next one can be drawn against it.
 *
 * - Previous-attempt ghost: the in-session ghost replays recorded positions of the last attempt in
 *   time with the current one. Shareable ghosts use input replay (GMR-29); an in-session ghost
 *   from the same run is exact either way, and recording positions avoids a second simulation.
 * - Last rope and impact markers come from the attempt's ropeAttach events.
 * - Death labels appear only after repeated deaths at the same spot (an explicit cause helps when
 *   the player is stuck, and is noise otherwise).
 */
export class FailureFeedback {
  private path: Vec2[] = [];
  private impacts: Vec2[] = [];
  private lastAttemptTick = -1;
  private previousTrace: AttemptTrace | null = null;
  private streak: { cause: DeathCause; solid: string | null; at: Vec2; count: number } | null =
    null;

  /** Call once per rendered frame with the newest snapshot. */
  observe(s: SimSnapshot): void {
    if (s.attemptTick === this.lastAttemptTick) return;
    if (s.attemptTick < this.lastAttemptTick) this.path = [];
    this.lastAttemptTick = s.attemptTick;
    // Fill every tick so ghost timing matches the attempt clock even if frames skip ticks.
    while (this.path.length <= s.attemptTick && this.path.length < MAX_TICKS) {
      this.path.push(s.player.position);
    }
    // Record each rope connection once, at the first frame it is seen (moving anchors move it).
    const rope = s.rope;
    if (rope && rope.attachedTick !== this.lastRopeTick) {
      this.impacts.push(rope.point);
      this.lastRopeTick = rope.attachedTick;
    }
  }

  private lastRopeTick = -1;

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'death') {
        this.finish('death');
        const same =
          this.streak !== null &&
          this.streak.cause === e.cause &&
          Math.hypot(this.streak.at.x - e.at.x, this.streak.at.y - e.at.y) < SAME_SPOT_M;
        this.streak = {
          cause: e.cause,
          solid: e.solid,
          at: e.at,
          count: same && this.streak ? this.streak.count + 1 : 1,
        };
      } else if (e.type === 'exit') {
        this.finish('exit');
        this.streak = null;
      } else if (e.type === 'reset' && this.path.length > 1) {
        // A manual restart (deaths and exits already finished the attempt above).
        this.finish('restart');
      }
    }
  }

  /** The attempt before the current one, if any. */
  get previous(): AttemptTrace | null {
    return this.previousTrace;
  }

  /** Where the previous attempt's hero was at this tick of the current attempt (ghost). */
  ghostAt(attemptTick: number): Vec2 | null {
    const p = this.previousTrace?.path;
    if (!p || p.length === 0 || attemptTick >= p.length) return null;
    return p[attemptTick] ?? null;
  }

  /** A short handwritten cause label, only after repeated deaths at the same spot. */
  label(): DeathLabel | null {
    const s = this.streak;
    if (!s || s.count < LABEL_AFTER_REPEATS) return null;
    return { text: causeText(s.cause, s.solid), at: s.at };
  }

  private finish(ended: AttemptTrace['ended']): void {
    if (this.path.length > 1) {
      this.previousTrace = { path: this.path, impacts: this.impacts, ended };
    }
    this.path = [];
    this.impacts = [];
    this.lastRopeTick = -1;
  }
}

/** Plain-language cause, written the way a margin note would be. */
export function causeText(cause: DeathCause, solid: string | null): string {
  if (cause === 'out-of-bounds') return 'fell off the page';
  const id = (solid ?? '').toLowerCase();
  if (id.includes('thorn') || id.includes('spike') || id.includes('teeth')) return 'spikes!';
  if (id.includes('floor') || id.includes('lava') || id.includes('pit')) return 'red ink = danger';
  return 'touched red ink';
}
