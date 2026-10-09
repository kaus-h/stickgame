import type { DeathRecord, LevelDef } from '../../sim';
import {
  BODY_STEP,
  bodySegments,
  createRagdoll,
  MAX_STEPS,
  stepRagdoll,
  type BodySegment,
  type Ragdoll,
} from './ragdoll';

/** At most this many bodies per level; over the cap the oldest fades out (GMR-104). */
export const BODY_CAP = 60;
/** Over-cap fade-out, seconds. */
const FADE_TIME = 0.4;

export interface PileBody {
  readonly id: number;
  readonly rag: Ragdoll;
  /** 1 while kept; falls to 0 once the body is over the cap, then it is removed. */
  fade: number;
  fading: boolean;
}

/**
 * The bodies left on one level (GMR-104). Pure presentation state with no Phaser: deaths add
 * bodies, a render-side fixed step settles them, the cap fades out the oldest. Never read by the
 * simulation; the scene drops the pile on level change.
 */
export class BodyPile {
  readonly bodies: PileBody[] = [];
  private readonly segments: BodySegment[];
  private readonly floorY: number;
  private acc = 0;
  private nextId = 0;

  constructor(
    level: LevelDef,
    private readonly gravity: number,
  ) {
    this.segments = bodySegments(level);
    this.floorY = level.bounds.maxY + 2;
  }

  spawn(death: Pick<DeathRecord, 'tick' | 'at' | 'velocity'>): PileBody {
    const body: PileBody = { id: this.nextId++, rag: createRagdoll(death), fade: 1, fading: false };
    this.bodies.push(body);
    let kept = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i] as PileBody;
      if (!b.fading && ++kept > BODY_CAP) b.fading = true;
    }
    return body;
  }

  /** Advance by a frame's dt (capped): fixed ragdoll steps and over-cap fades. */
  step(dt: number): void {
    this.acc = Math.min(this.acc + Math.max(0, dt), MAX_STEPS * BODY_STEP);
    const steps = Math.floor(this.acc / BODY_STEP + 1e-9);
    this.acc -= steps * BODY_STEP;
    for (const b of this.bodies) {
      stepRagdoll(b.rag, steps, this.gravity, this.segments, this.floorY);
      if (b.fading) b.fade -= dt / FADE_TIME;
    }
    for (let i = this.bodies.length - 1; i >= 0; i--)
      if ((this.bodies[i] as PileBody).fade <= 0) this.bodies.splice(i, 1);
  }

  /** Stop every body where it is (before the eraser sweep). */
  freezeAll(): void {
    for (const b of this.bodies) b.rag.frozen = true;
  }

  clear(): void {
    this.bodies.length = 0;
  }

  get kept(): number {
    return this.bodies.filter((b) => !b.fading).length;
  }

  get simulating(): number {
    return this.bodies.filter((b) => !b.rag.frozen).length;
  }
}
