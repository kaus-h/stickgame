import { SIM_DT, vec2, type Intent, type Vec2 } from '../core';
import type { PhysicsAdapter, PhysicsStats } from '../physics';
import { anchorPathState } from './anchorPath';
import { levelSegments, type LevelDef } from './level';
import { resolveTarget, type RopeInvalidReason, type TargetResolution } from './targeting';
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
  /** Mechanical impact point in world space this tick (moves with a moving anchor). */
  readonly point: Vec2;
  /**
   * Swing radius. Locked ropes: the distance when the length locked (connection if airborne,
   * take-off if attached on the ground). Unlocked: the current distance, which is paying out.
   */
  readonly length: number;
  /** Length fixed (airborne). False while grounded: the rope pays out up to maxLength. */
  readonly locked: boolean;
  /** True when the player is on the rope circle; false when the rope hangs slack. */
  readonly taut: boolean;
  /** Tick the rope connected on. */
  readonly attachedTick: number;
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
  /** Path velocity of each anchor at this tick, m/s (zero for fixed anchors). */
  readonly anchorVelocities: readonly Vec2[];
  /** World-space aim point, if any. */
  readonly aim: Vec2 | null;
  /** Contacts that began during the last step (debug and feedback; never gameplay input). */
  readonly contacts: readonly ContactSnapshot[];
  /** The most recent death (survives the reset it caused). */
  readonly lastDeath: DeathRecord | null;
  /** What a rope press would do right now (anchor, impact point, distance, validity). */
  readonly target: TargetResolution | null;
}

/**
 * Machine-readable failure context (GMR-23): enough for telemetry, the death marker and later
 * "what went wrong" feedback (last rope, speed, which hazard). Persists in the snapshot after the
 * instant reset so feedback can draw it during the next attempt.
 */
export interface DeathRecord {
  readonly tick: number;
  readonly cause: DeathCause;
  readonly at: Vec2;
  readonly velocity: Vec2;
  /** Level id of the hazard solid touched, for cause "hazard". */
  readonly solid: string | null;
  /** Ticks into the attempt when it ended. */
  readonly attemptTicks: number;
  /** The rope at the moment of death, if tethered. */
  readonly rope: { readonly anchor: number; readonly point: Vec2; readonly length: number } | null;
}

export interface ContactSnapshot {
  /** Level solid id. */
  readonly solid: string;
  readonly kind: 'solid' | 'hazard';
  readonly normal: Vec2;
  /** Closing speed at impact, m/s. */
  readonly speed: number;
}

export type DeathCause = 'hazard' | 'out-of-bounds';

export type SimEvent =
  | { readonly type: 'reset'; readonly tick: number }
  | { readonly type: 'jump'; readonly tick: number }
  | { readonly type: 'land'; readonly tick: number; readonly speed: number }
  | ({ readonly type: 'death' } & DeathRecord)
  | { readonly type: 'exit'; readonly tick: number; readonly attemptTicks: number }
  | {
      readonly type: 'ropeAttach';
      readonly tick: number;
      readonly anchor: number;
      readonly length: number;
    }
  | { readonly type: 'ropeLock'; readonly tick: number; readonly length: number }
  | { readonly type: 'ropeRelease'; readonly tick: number; readonly velocity: Vec2 }
  | {
      readonly type: 'ropeInvalid';
      readonly tick: number;
      readonly reason: RopeInvalidReason;
      readonly at: Vec2;
    };

export type { RopeInvalidReason };

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

  private body!: number;
  private anchorIds: number[] = [];
  /** Level solid id for each physics segment (levelSegments keeps solid order). */
  private segmentSolid: string[] = [];
  private lastDeath: DeathRecord | null = null;
  private lastContacts: readonly ContactSnapshot[] = [];

  // Controller state (reset each attempt).
  private axis = 0;
  private facing: -1 | 1 = 1;
  private lastGroundedTick = -1_000;
  private jumpBufferedTick = -1_000;
  private jumpHeld = false;
  private wasGrounded = false;
  private aim: Vec2 | null = null;
  private rope: {
    id: number;
    anchor: number;
    offset: Vec2;
    /** Swing radius once locked; while unlocked the physics rope is a max-length leash. */
    length: number;
    /** Locked = length fixed. Attaching in the air locks at once; on the ground, at take-off. */
    locked: boolean;
    tick: number;
    /** Swing energy per unit mass when the length locked (steering may add a capped amount). */
    energy: number;
  } | null = null;
  /** Rope presses and releases in input order, applied once anchors are placed for the tick. */
  private ropeActions: ('press' | 'release')[] = [];

  constructor(
    private tuning: SimTuning,
    private readonly physics: PhysicsAdapter,
    private level: LevelDef,
  ) {
    physics.setGravity(vec2(0, tuning.gravity));
    this.createLevelBodies();
  }

  /** Authoring reload: discard all attempt state while retaining the physics world and tuning. */
  replaceLevel(level: LevelDef): void {
    this.physics.clearLevel();
    this.level = level;
    this.tickCount = 0;
    this.attemptTicks = 0;
    this.resetCount = 0;
    this.deathCount = 0;
    this.events = [];
    this.lastDeath = null;
    this.lastContacts = [];
    this.axis = 0;
    this.facing = 1;
    this.lastGroundedTick = -1_000;
    this.jumpBufferedTick = -1_000;
    this.jumpHeld = false;
    this.wasGrounded = false;
    this.aim = null;
    this.rope = null;
    this.ropeActions = [];
    this.createLevelBodies();
  }

  private createLevelBodies(): void {
    const { physics, level, tuning } = this;
    physics.setGeometry(levelSegments(level));
    this.segmentSolid = level.solids.flatMap((solid) => solid.points.map(() => solid.id));
    this.body = physics.createBody({
      position: level.spawn,
      velocity: vec2(0, 0),
      radius: tuning.player.radius,
    });
    // Created where the path puts them at attempt tick 0, so reset restores them exactly.
    this.anchorIds = level.anchors.map((a) =>
      physics.createKinematicAnchor(anchorPathState(a, 0).position),
    );
  }

  step(intents: readonly Intent[]): void {
    for (const intent of intents) this.applyIntent(intent);
    if (intents.some((i) => i.type === 'restart')) this.reset();

    this.moveAnchors();
    this.applyRopeActions();
    this.control();
    this.physics.step(SIM_DT, this.tuning.physicsSubsteps);
    this.tickCount++;
    this.attemptTicks++;
    this.afterPhysics();
  }

  /** Back to the authored initial state inside the same physics world. */
  /**
   * Dev tuning panel only (GMR-28): swap tuning values live. Breaks replay equivalence with
   * earlier inputs, so never call it from gameplay code.
   */
  retune(tuning: SimTuning): void {
    this.tuning = tuning;
    this.physics.setGravity(vec2(0, tuning.gravity));
  }

  reset(): void {
    this.physics.resetBodies();
    this.physics.drainContacts();
    this.attemptTicks = 0;
    this.resetCount++;
    this.lastGroundedTick = -1_000;
    this.jumpBufferedTick = -1_000;
    this.wasGrounded = false;
    this.rope = null; // resetBodies already removed the physics rope
    this.ropeActions = [];
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
        mode: s.grounded ? 'grounded' : this.rope ? 'tethered' : 'air',
        facing: this.facing,
      },
      rope: this.rope ? this.ropeSnapshot(s.position, anchors) : null,
      anchors,
      anchorVelocities: this.level.anchors.map(
        (a) => anchorPathState(a, this.attemptTicks * SIM_DT).velocity,
      ),
      aim: this.aim,
      lastDeath: this.lastDeath,
      contacts: this.lastContacts,
      target: this.target(s.position, anchors),
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

  private target(player: Vec2, anchors: readonly Vec2[]): TargetResolution | null {
    if (!this.aim) return null;
    return resolveTarget(
      player,
      this.aim,
      anchors.map((position, i) => ({
        position,
        radius: (this.level.anchors[i] as LevelDef['anchors'][number]).radius,
      })),
      this.tuning.rope,
      (from, to) => this.physics.raycast(from, to),
    );
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
        this.ropeActions.push('press');
        break;
      case 'ropeRelease':
        this.ropeActions.push('release');
        break;
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

    // A taut locked rope owns the motion; a slack one leaves the normal air controller in charge.
    const swinging = !s.grounded && this.ropeTaut(s.position);
    if (swinging) {
      // On the rope, gravity and the shot drive the swing; input only steers a little.
      const v = this.steer(s.position, vec2(vx, vy));
      this.physics.setBodyVelocity(this.body, v);
      return;
    }

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

    // Snappy falls are a platforming aid. On a locked rope (even slack) they would add energy that
    // the momentum-keeping catch then turns into swing, so the pendulum gets plain gravity.
    if (vy > 0 && !this.rope?.locked) vy += this.tuning.gravity * (p.fallGravityScale - 1) * dt;
    vy = Math.min(vy, p.maxFallSpeed);
    this.physics.setBodyVelocity(this.body, vec2(vx, vy));
  }

  // --- rope ------------------------------------------------------------------------------------

  /**
   * Hold-to-tether. A press tries to connect once, on this exact tick: the rope length is the
   * distance to the impact point now (doc 04). An invalid press reports why and does nothing else;
   * holding the button does not retry. Release removes the rope and keeps the velocity as is.
   */
  private applyRopeActions(): void {
    const actions = this.ropeActions;
    this.ropeActions = [];
    for (const action of actions) {
      if (action === 'release') {
        this.detach();
        continue;
      }
      if (this.rope) continue; // already tethered: a second press cannot re-shoot mid-swing
      const s = this.physics.bodyState(this.body);
      const anchors = this.anchorIds.map((id) => this.physics.anchorPosition(id));
      const target = this.target(s.position, anchors);
      if (!target) continue;
      if (!target.valid) {
        this.events.push({
          type: 'ropeInvalid',
          tick: this.tickCount,
          reason: target.reason,
          at: target.impact ?? this.aim ?? s.position,
        });
        continue;
      }
      this.rope = {
        id: -1,
        anchor: target.anchor,
        offset: target.offset,
        length: target.distance,
        locked: false,
        tick: this.tickCount,
        energy: 0,
      };
      this.events.push({
        type: 'ropeAttach',
        tick: this.tickCount,
        anchor: target.anchor,
        length: target.distance,
      });
      if (s.grounded) this.leash();
      else this.lock(target.distance);
    }
  }

  /**
   * Owner decision 2026-10-07 (doc 04 amendment): while grounded the rope pays out freely up to
   * maxLength, so running carries the player under or past the anchor; the length locks to the
   * distance at the moment the player becomes airborne. Only used before the first lock.
   */
  private leash(): void {
    const rope = this.rope;
    if (!rope) return;
    if (rope.id >= 0) this.physics.detachRope(rope.id);
    rope.id = this.physics.attachRope(this.body, this.ropeAnchor(rope), this.tuning.rope.maxLength);
    rope.locked = false;
  }

  /**
   * Fix the swing radius to exactly the measured distance (never clamped: canon says the rope
   * is the distance). Run and jump momentum carries into the swing at the taut catch.
   */
  private lock(length: number): void {
    const rope = this.rope;
    if (!rope) return;
    const r = this.tuning.rope;
    if (rope.id >= 0) this.physics.detachRope(rope.id);
    rope.id = this.physics.attachRope(this.body, this.ropeAnchor(rope), length, {
      catchRetention: r.catchRetention,
    });
    rope.length = length;
    rope.locked = true;
    const s = this.physics.bodyState(this.body);
    rope.energy = this.energy(s.position, s.velocity);
    this.events.push({ type: 'ropeLock', tick: this.tickCount, length });
  }

  private ropeAnchor(rope: { anchor: number; offset: Vec2 }) {
    return {
      kind: 'kinematic' as const,
      anchor: this.anchorIds[rope.anchor] as number,
      offset: rope.offset,
    };
  }

  /**
   * After each step: a paying-out rope locks on the first airborne tick. Once locked it stays
   * locked until release, including across landings, so a shot cannot be re-measured afterwards
   * (no rope shortening/extension, doc 12). If the player leaves the ground closer than minLength,
   * the rope keeps paying out and locks on the first airborne tick at or beyond minLength, at the
   * distance measured then.
   */
  private updateRopeLock(grounded: boolean, position: Vec2): void {
    const rope = this.rope;
    if (!rope || rope.locked || grounded) return;
    const p = this.ropePoint(rope.anchor, rope.offset);
    const distance = Math.sqrt((position.x - p.x) ** 2 + (position.y - p.y) ** 2);
    if (distance >= this.tuning.rope.minLength) this.lock(distance);
  }

  private detach(): void {
    if (!this.rope) return;
    this.physics.detachRope(this.rope.id);
    this.rope = null;
    const v = this.physics.bodyState(this.body).velocity;
    this.events.push({ type: 'ropeRelease', tick: this.tickCount, velocity: v });
  }

  /** Mechanical energy per unit mass; +y is down, so height is -y. */
  private energy(p: Vec2, v: Vec2): number {
    return 0.5 * (v.x * v.x + v.y * v.y) - this.tuning.gravity * p.y;
  }

  /**
   * Small tangential push toward the held direction, only while the rope is taut and only up to
   * steerEnergyHeight of energy above the energy at connection (no unlimited pumping, doc 09 B3).
   */
  private steer(p: Vec2, v: Vec2): Vec2 {
    const rope = this.rope;
    if (!rope?.locked || this.axis === 0) return v;
    const pivot = this.ropePoint(rope.anchor, rope.offset);
    const rx = p.x - pivot.x;
    const ry = p.y - pivot.y;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < rope.length - 1e-3 || dist < 1e-9) return v; // slack: no rope to push against
    // Tangent pointing the way the input asks for.
    let tx = -ry / dist;
    let ty = rx / dist;
    if (tx * this.axis < 0) {
      tx = -tx;
      ty = -ty;
    }
    if (Math.abs(tx) < 0.2) return v; // near horizontal rope: no meaningful sideways steer
    const dv = this.tuning.rope.steerAccel * SIM_DT;
    const next = vec2(v.x + tx * dv, v.y + ty * dv);
    const cap = rope.energy + this.tuning.gravity * this.tuning.rope.steerEnergyHeight;
    return this.energy(p, next) <= cap || this.energy(p, next) <= this.energy(p, v) ? next : v;
  }

  private ropeTaut(p: Vec2): boolean {
    const rope = this.rope;
    if (!rope?.locked) return false;
    const a = this.ropePoint(rope.anchor, rope.offset);
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2) >= rope.length - 1e-3;
  }

  private ropePoint(anchor: number, offset: Vec2): Vec2 {
    const a = this.physics.anchorPosition(this.anchorIds[anchor] as number);
    return vec2(a.x + offset.x, a.y + offset.y);
  }

  private ropeSnapshot(player: Vec2, anchors: readonly Vec2[]): RopeSnapshot | null {
    const rope = this.rope;
    if (!rope) return null;
    const a = anchors[rope.anchor] as Vec2;
    const point = vec2(a.x + rope.offset.x, a.y + rope.offset.y);
    const dx = player.x - point.x;
    const dy = player.y - point.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
      anchor: rope.anchor,
      point,
      length: rope.locked ? rope.length : Math.min(dist, this.tuning.rope.maxLength),
      locked: rope.locked,
      taut: rope.locked ? dist >= rope.length - 1e-3 : dist >= this.tuning.rope.maxLength - 1e-3,
      attachedTick: rope.tick,
    };
  }

  private cutJump(): void {
    const s = this.physics.bodyState(this.body);
    // Variable jump height still works on a slack rope; a taut rope owns the motion.
    if (s.velocity.y < 0 && !this.ropeTaut(s.position)) {
      this.physics.setBodyVelocity(
        this.body,
        vec2(s.velocity.x, s.velocity.y * this.tuning.player.jumpCut),
      );
    }
  }

  /**
   * Place each moving anchor exactly on its path for this tick. The velocity handed to physics is
   * the secant to next tick's path point, so the anchor ends the step exactly where the path says
   * and never jumps at the next placement (GMR-26: a per-tick jump of a·dt²/2 made a taut rope
   * flicker slack under an accelerating pivot).
   */
  private moveAnchors(): void {
    const t = this.attemptTicks * SIM_DT;
    this.level.anchors.forEach((def, i) => {
      if (!def.path) return;
      const now = anchorPathState(def, t).position;
      const next = anchorPathState(def, t + SIM_DT).position;
      this.physics.moveKinematicAnchor(
        this.anchorIds[i] as number,
        now,
        vec2((next.x - now.x) / SIM_DT, (next.y - now.y) / SIM_DT),
      );
    });
  }

  private afterPhysics(): void {
    const s = this.physics.bodyState(this.body);
    const contacts = this.physics.drainContacts();
    this.lastContacts = contacts.map((c) => ({
      solid: this.segmentSolid[c.segment] ?? '?',
      kind: c.kind,
      normal: c.normal,
      speed: c.speed,
    }));
    if (s.grounded && !this.wasGrounded) {
      // The solver has already removed the impact velocity; contacts carry the closing speed.
      const speed = contacts.reduce(
        (max, c) => (c.normal.y < -0.7 ? Math.max(max, c.speed) : max),
        0,
      );
      this.events.push({ type: 'land', tick: this.tickCount, speed });
    }
    this.wasGrounded = s.grounded;
    this.updateRopeLock(s.grounded, s.position);

    const hazard = contacts.find((c) => c.kind === 'hazard');
    if (hazard) {
      this.die('hazard', s.position, s.velocity, this.segmentSolid[hazard.segment] ?? null);
      return;
    }
    if (s.position.y > this.level.killY) {
      this.die('out-of-bounds', s.position, s.velocity, null);
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
  private die(cause: DeathCause, at: Vec2, velocity: Vec2, solid: string | null): void {
    this.deathCount++;
    const rope = this.rope;
    this.lastDeath = {
      tick: this.tickCount,
      cause,
      at,
      velocity,
      solid,
      attemptTicks: this.attemptTicks,
      rope: rope
        ? {
            anchor: rope.anchor,
            point: this.ropePoint(rope.anchor, rope.offset),
            length: rope.length,
          }
        : null,
    };
    this.events.push({ type: 'death', ...this.lastDeath });
    this.reset();
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}
