import type { Vec2 } from '../core';

export interface PhysicsStats {
  readonly bodies: number;
  readonly joints: number;
  readonly contacts: number;
}

/** Static level geometry: one-sided-agnostic line segments authored in level data (doc 32). */
export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Hazard segments collide like solids and are reported so the sim can kill the player. */
  readonly kind: 'solid' | 'hazard';
}

/** A dynamic body. The player is a circle for the spike; a capsule is evaluated in GMR-20. */
export interface BodyDef {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

export interface BodyState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** Standing on a surface whose normal points mostly up (+y is down). */
  readonly grounded: boolean;
}

/** Chronological integrated motion, with velocity before the next collision impulse. */
export interface BodyMotionSegment {
  /** Zero-duration correction marker: update occupancy, never sweep as integrated motion. */
  readonly correction?: boolean;
  readonly startFraction?: number;
  readonly endFraction?: number;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly velocity: Vec2;
}

export type RopeAnchor =
  | { readonly kind: 'static'; readonly point: Vec2 }
  | { readonly kind: 'kinematic'; readonly anchor: number; readonly offset: Vec2 };

export interface RopeOptions {
  /**
   * Share of the outward radial speed kept, redirected along the swing, when the rope snaps taut
   * (0 = classic inelastic catch, 1 = speed fully preserved). Default 0.
   */
  readonly catchRetention?: number;
}

export interface RayHit {
  readonly point: Vec2;
  readonly normal: Vec2;
  readonly distance: number;
  readonly segment: number;
}

export interface ContactEvent {
  /** Fixed-step time fraction, when supplied by the production continuous solver. */
  readonly fraction?: number;
  readonly body: number;
  readonly segment: number;
  readonly kind: Segment['kind'];
  readonly normal: Vec2;
  /** Closing speed along the normal at impact, m/s. */
  readonly speed: number;
}

/**
 * The only way game code touches physics (ADR-001). One persistent world per scene lifecycle:
 * reset restores bodies, anchors and ropes inside the same world and never recreates it
 * (ADR-001 Amendment 1). Units are meters and seconds, +y down.
 */
export interface PhysicsAdapter {
  /** Replace the static level geometry (level load only). */
  setGeometry(segments: readonly Segment[]): void;
  setGravity(gravity: Vec2): void;

  createBody(def: BodyDef): number;
  bodyState(body: number): BodyState;
  /** Optional precise path for gameplay crossings; excludes depenetration/position corrections. */
  bodyMotion?(body: number): readonly BodyMotionSegment[];
  setBodyVelocity(body: number, velocity: Vec2): void;
  /** Move a body to a point at rest (checkpoint respawn, GMR-100); contacts and motion clear. */
  teleportBody(body: number, position: Vec2): void;
  /** Resolve a gameplay contact without replacing its body/world or detaching its rope. */
  setBodyPosition?(body: number, position: Vec2): void;

  /** A pivot whose motion the sim scripts (moving anchors). */
  createKinematicAnchor(position: Vec2): number;
  /** Position at the start of the coming step and its velocity during that step. */
  moveKinematicAnchor(anchor: number, position: Vec2, velocity: Vec2): void;
  anchorPosition(anchor: number): Vec2;

  /** Inextensible rope: the body may move closer than `length`, never farther. */
  attachRope(body: number, anchor: RopeAnchor, length: number, options?: RopeOptions): number;
  detachRope(rope: number): void;

  /** Closest solid or hazard segment hit along from→to. */
  raycast(from: Vec2, to: Vec2): RayHit | null;
  /** Contacts that began during the last step(s), oldest first. */
  drainContacts(): ContactEvent[];

  /** Advance the world by one fixed simulation step. */
  step(dt: number, substeps: number): void;
  /** Restore every body and anchor to its creation state and remove all ropes, inside the same world. */
  resetBodies(): void;
  /** Remove level bodies, anchors, ropes and geometry without replacing the persistent world. */
  clearLevel(): void;
  stats(): PhysicsStats;
  dispose(): void;
}
