import { dcos, dsin, SIM_DT, vec2, type Intent, type Vec2 } from '../core';
import type { PhysicsAdapter, PhysicsStats } from '../physics';
import { levelSegments, type LevelDef } from './level';
import type { SimTuning } from './tuning';

export type PlayerMode = 'grounded' | 'air' | 'tethered';

export interface PlayerSnapshot {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly mode: PlayerMode;
  /** -1 left, 1 right: last horizontal input or movement direction. */
  readonly facing: -1 | 1;
}

export interface RopeSnapshot {
  readonly anchor: number;
  /** Mechanical impact point in world space this tick. */
  readonly point: Vec2;
  /** Rope length fixed at connection time. */
  readonly length: number;
}

/** Immutable view of the simulation after a step; render interpolates between two of these. */
export interface SimSnapshot {
  /** Monotonic tick since the simulation was created. */
  readonly tick: number;
  /** Tick within the current attempt; returns to 0 on reset. */
  readonly attemptTick: number;
  readonly resets: number;
  readonly deaths: number;
  readonly player: PlayerSnapshot;
  readonly rope: RopeSnapshot | null;
  /** Current anchor positions (moving anchors move). */
  readonly anchors: readonly Vec2[];
  /** World-space aim point, if any. */
  readonly aim: Vec2 | null;
  /** Index of the anchor the aim currently selects, if any. */
  readonly aimAnchor: number | null;
}

export type DeathCause = 'hazard' | 'out-of-bounds';

export type SimEvent =
  | { readonly type: 'reset'; readonly tick: number }
  | { readonly type: 'jump'; readonly tick: number }
  | { readonly type: 'land'; readonly tick: number; readonly speed: number }
  | { readonly type: 'death'; readonly tick: number; readonly cause: DeathCause; readonly at: Vec2 }
  | { readonly type: 'exit'; readonly tick: number; readonly attemptTicks: number }
  | {
      readonly type: 'ropeAttach';
      readonly tick: number;
      readonly anchor: number;
      readonly length: number;
    }
  | { readonly type: 'ropeRelease'; readonly tick: number; readonly velocity: Vec2 }
  | {
      readonly type: 'ropeInvalid';
      readonly tick: number;
      readonly reason: RopeInvalidReason;
      readonly at: Vec2;
    };

export type RopeInvalidReason = 'no-anchor' | 'too-far' | 'too-close' | 'blocked';

export interface SimStats {
  readonly tick: number;
  readonly attemptTick: number;
  readonly resets: number;
  /** Live simulation entities; must stay constant across resets. */
  readonly entities: number;
  readonly pendingEvents: number;
  readonly physics: PhysicsStats;
}

/**
 * The canonical simulation. Advances only in fixed SIM_DT steps and only from intents, so the
 * same intents produce the same states regardless of frame rate or platform.
 */
export class Simulation {
  private tickCount = 0;
  private attemptTicks = 0;
  private resetCount = 0;
  private deathCount = 0;
  private events: SimEvent[] = [];

  private readonly body: number;
  private readonly anchorIds: number[];

  // Controller state (reset each attempt).
  private axis = 0;
  private facing: -1 | 1 = 1;
  private lastGroundedTick = -1_000;
  private jumpBufferedTick = -1_000;
  private jumpHeld = false;
  private wasGrounded = false;
  private aim: Vec2 | null = null;
  private rope: { id: number; anchor: number; length: number } | null = null;

  constructor(
    private readonly tuning: SimTuning,
    private readonly physics: PhysicsAdapter,
    private readonly level: LevelDef,
  ) {
    physics.setGravity(vec2(0, tuning.gravity));
    physics.setGeometry(levelSegments(level));
    this.body = physics.createBody({
      position: level.spawn,
      velocity: vec2(0, 0),
      radius: tuning.player.radius,
    });
    this.anchorIds = level.anchors.map((a) => physics.createKinematicAnchor(a.position));
  }

  step(intents: readonly Intent[]): void {
    for (const intent of intents) this.applyIntent(intent);
    if (intents.some((i) => i.type === 'restart')) this.reset();

    this.moveAnchors();
    this.control();
    this.physics.step(SIM_DT, this.tuning.physicsSubsteps);
    this.tickCount++;
    this.attemptTicks++;
    this.afterPhysics();
  }

  /** Back to the authored initial state inside the same physics world. */
  reset(): void {
    this.physics.resetBodies();
    this.physics.drainContacts();
    this.attemptTicks = 0;
    this.resetCount++;
    this.lastGroundedTick = -1_000;
    this.jumpBufferedTick = -1_000;
    this.wasGrounded = false;
    this.rope = null;
    this.events.push({ type: 'reset', tick: this.tickCount });
  }

  snapshot(): SimSnapshot {
    const s = this.physics.bodyState(this.body);
    const anchors = this.anchorIds.map((id) => this.physics.anchorPosition(id));
    return {
      tick: this.tickCount,
      attemptTick: this.attemptTicks,
      resets: this.resetCount,
      deaths: this.deathCount,
      player: {
        position: s.position,
        velocity: s.velocity,
        mode: this.rope ? 'tethered' : s.grounded ? 'grounded' : 'air',
        facing: this.facing,
      },
      rope: this.rope
        ? {
            anchor: this.rope.anchor,
            point: anchors[this.rope.anchor] as Vec2,
            length: this.rope.length,
          }
        : null,
      anchors,
      aim: this.aim,
      aimAnchor: null,
    };
  }

  drainEvents(): SimEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  stats(): SimStats {
    return {
      tick: this.tickCount,
      attemptTick: this.attemptTicks,
      resets: this.resetCount,
      entities: 1 + this.anchorIds.length,
      pendingEvents: this.events.length,
      physics: this.physics.stats(),
    };
  }

  dispose(): void {
    this.physics.dispose();
    this.events = [];
  }

  // --- intents and control ---------------------------------------------------------------------

  private applyIntent(intent: Intent): void {
    switch (intent.type) {
      case 'move':
        this.axis = Math.max(-1, Math.min(1, intent.axis));
        if (this.axis !== 0) this.facing = this.axis > 0 ? 1 : -1;
        break;
      case 'jumpPress':
        this.jumpHeld = true;
        this.jumpBufferedTick = this.tickCount;
        break;
      case 'jumpRelease':
        this.jumpHeld = false;
        this.cutJump();
        break;
      case 'ropeAim':
        this.aim = intent.target;
        break;
      case 'ropePress':
      case 'ropeRelease':
      case 'restart':
      case 'pause':
        break;
    }
  }

  private control(): void {
    const p = this.tuning.player;
    const s = this.physics.bodyState(this.body);
    let vx = s.velocity.x;
    let vy = s.velocity.y;
    const dt = SIM_DT;
    const target = this.axis * p.runSpeed;

    if (s.grounded) {
      this.lastGroundedTick = this.tickCount;
      const reversing =
        this.axis !== 0 && Math.sign(vx) !== 0 && Math.sign(vx) !== Math.sign(target);
      const rate = this.axis === 0 || reversing ? p.groundDecel : p.groundAccel;
      vx = approach(vx, target, rate * dt);
    } else if (this.axis !== 0) {
      // Air control steers toward the input but never brakes momentum above airMaxSpeed, so
      // release velocity from a swing is preserved (doc 04).
      const airTarget = this.axis * p.airMaxSpeed;
      const sameDirFast = Math.sign(vx) === this.axis && Math.abs(vx) >= p.airMaxSpeed;
      if (!sameDirFast) vx = approach(vx, airTarget, p.airAccel * dt);
    }

    const canJump = this.tickCount - this.lastGroundedTick <= p.coyoteTicks;
    const buffered = this.tickCount - this.jumpBufferedTick <= p.jumpBufferTicks;
    if (buffered && canJump) {
      vy = -p.jumpSpeed;
      this.jumpBufferedTick = -1_000;
      this.lastGroundedTick = -1_000;
      this.events.push({ type: 'jump', tick: this.tickCount });
      if (!this.jumpHeld) vy *= p.jumpCut; // tapped and released within the same tick
    }

    if (vy > 0) vy += this.tuning.gravity * (p.fallGravityScale - 1) * dt;
    vy = Math.min(vy, p.maxFallSpeed);
    this.physics.setBodyVelocity(this.body, vec2(vx, vy));
  }

  private cutJump(): void {
    const s = this.physics.bodyState(this.body);
    if (s.velocity.y < 0 && !this.rope) {
      this.physics.setBodyVelocity(
        this.body,
        vec2(s.velocity.x, s.velocity.y * this.tuning.player.jumpCut),
      );
    }
  }

  private moveAnchors(): void {
    const t = this.attemptTicks * SIM_DT;
    this.level.anchors.forEach((def, i) => {
      if (!def.path) return;
      // Smooth ping-pong: position = start + (to - start) * (1 - cos(2πt/T)) / 2.
      const w = (2 * Math.PI) / def.path.period;
      const k = (1 - dcos(w * t)) / 2;
      const dk = (w * dsin(w * t)) / 2;
      const dx = def.path.to.x - def.position.x;
      const dy = def.path.to.y - def.position.y;
      this.physics.moveKinematicAnchor(
        this.anchorIds[i] as number,
        vec2(def.position.x + dx * k, def.position.y + dy * k),
        vec2(dx * dk, dy * dk),
      );
    });
  }

  private afterPhysics(): void {
    const s = this.physics.bodyState(this.body);
    if (s.grounded && !this.wasGrounded) {
      this.events.push({ type: 'land', tick: this.tickCount, speed: Math.abs(s.velocity.y) });
    }
    this.wasGrounded = s.grounded;

    if (this.physics.drainContacts().some((c) => c.kind === 'hazard')) {
      this.die('hazard', s.position);
      return;
    }
    if (s.position.y > this.level.killY) {
      this.die('out-of-bounds', s.position);
      return;
    }

    const exit = this.level.exit;
    if (
      exit &&
      s.position.x >= exit.min.x &&
      s.position.x <= exit.max.x &&
      s.position.y >= exit.min.y &&
      s.position.y <= exit.max.y
    ) {
      this.events.push({ type: 'exit', tick: this.tickCount, attemptTicks: this.attemptTicks });
      this.reset();
    }
  }

  /** Death is instant: no delay or UI may sit between death and retry (doc 13). */
  private die(cause: DeathCause, at: Vec2): void {
    this.deathCount++;
    this.events.push({ type: 'death', tick: this.tickCount, cause, at });
    this.reset();
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}
