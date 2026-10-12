import type { Vec2 } from '../../core';
import type { PlayerMode } from '../../sim';

/**
 * Hero animation state (GMR-69). Presentation only: it reads the snapshot each frame and never
 * feeds back into the simulation or collision. Pure and Phaser-free so it is unit-tested.
 */
export type HeroState = 'idle' | 'run' | 'rise' | 'fall' | 'swing';

/** Which drawn head (assets/art/hero-0008) shows. Profile and three-quarter face right. */
export type HeadFrame = 'front' | 'profile' | 'three-quarter' | 'dead';

export interface HeroAnim {
  readonly state: HeroState;
  readonly head: HeadFrame;
  /** Horizontal and vertical scale about the feet: squash on landing, stretch on take-off. */
  readonly sx: number;
  readonly sy: number;
  /** Body lean about the feet, radians (positive = clockwise on screen, i.e. leaning right). */
  readonly lean: number;
}

export interface HeroAnimInput {
  readonly mode: PlayerMode;
  readonly velocity: Vec2;
  /** Rope fixing point minus body centre (metres, y down), if tethered. */
  readonly rope: Vec2 | null;
}

/** Landing squash per m/s of downward speed at touchdown, capped. */
const SQUASH_PER_MS = 0.018;
const SQUASH_MAX = 0.28;
const STRETCH_ON_JUMP = 0.16;
/** Squash and stretch spring back with this time constant, s (about 4 of them in 0.25 s). */
const RECOVER_TAU = 0.06;
const RUN_LEAN = 0.13;
const SWING_LEAN_MAX = 0.75;
/** Lean eases toward its target at this rate (1/s), so pose changes never pop. */
const LEAN_RATE = 14;
const RUN_SPEED = 0.6;

export class HeroAnimator {
  private squash = 0;
  private lean = 0;
  private lastMode: PlayerMode | null = null;
  private lastVy = 0;

  /** Restart without carry-over (respawn puts the hero at rest). */
  reset(): void {
    this.squash = 0;
    this.lean = 0;
    this.lastMode = null;
    this.lastVy = 0;
  }

  step(input: HeroAnimInput, dt: number): HeroAnim {
    const { mode, velocity: v, rope } = input;
    const wasAir = this.lastMode !== null && this.lastMode !== 'grounded';
    if (mode === 'grounded' && wasAir && this.lastVy > 2) {
      this.squash = Math.min(SQUASH_MAX, this.lastVy * SQUASH_PER_MS);
    } else if (this.lastMode === 'grounded' && mode === 'air' && v.y < -5) {
      this.squash = -STRETCH_ON_JUMP;
    }
    this.squash *= Math.exp(-dt / RECOVER_TAU);
    if (Math.abs(this.squash) < 1e-3) this.squash = 0;

    let state: HeroState;
    let target: number;
    if (mode === 'tethered' && rope) {
      state = 'swing';
      // Hang along the rope: the body tilts so its head points at the fixing point.
      const angle = Math.atan2(rope.x, -rope.y);
      target = Math.max(-SWING_LEAN_MAX, Math.min(SWING_LEAN_MAX, angle));
    } else if (mode === 'grounded') {
      state = Math.abs(v.x) > RUN_SPEED ? 'run' : 'idle';
      target = Math.max(-1, Math.min(1, v.x / 7.5)) * RUN_LEAN;
    } else {
      state = v.y < 0 ? 'rise' : 'fall';
      target = Math.max(-1, Math.min(1, v.x / 10)) * RUN_LEAN * 0.6;
    }
    this.lean += (target - this.lean) * Math.min(1, dt * LEAN_RATE);

    this.lastMode = mode;
    this.lastVy = v.y;
    const s = this.squash;
    return {
      state,
      head: state === 'idle' ? 'front' : state === 'swing' ? 'three-quarter' : 'profile',
      sx: 1 + s * 0.6,
      sy: 1 - s,
      lean: this.lean,
    };
  }
}

/** The resting pose (labs, the PB ghost before it has frames). */
export const REST_ANIM: HeroAnim = { state: 'idle', head: 'front', sx: 1, sy: 1, lean: 0 };
