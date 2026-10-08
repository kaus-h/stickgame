import { Circle, Edge, RopeJoint, World, type Body, type Contact, type Joint } from 'planck';
import { dlen, vec2, type Vec2 } from '../../../core';
import type {
  BodyDef,
  BodyState,
  ContactEvent,
  PhysicsAdapter,
  PhysicsStats,
  RayHit,
  RopeAnchor,
  Segment,
} from '../../adapter';

/**
 * Candidate B for GMR-32: Planck.js (Box2D 2.x lineage) behind the project adapter.
 * Bodies are bullet circles with zero friction/restitution, segments are static edges, ropes are
 * rope joints to a static or kinematic pivot body.
 */

interface BodyRecord {
  def: BodyDef;
  body: Body;
}

interface AnchorRecord {
  initial: Vec2;
  body: Body;
}

type FixtureTag = { kind: 'segment'; index: number } | { kind: 'body'; index: number };

const GROUND_NORMAL_Y = -0.7;

export class PlanckPhysicsAdapter implements PhysicsAdapter {
  private readonly world = new World({ gravity: { x: 0, y: 25 } });
  private segments: Segment[] = [];
  private segmentBodies: Body[] = [];
  private readonly bodies: BodyRecord[] = [];
  private readonly anchors: AnchorRecord[] = [];
  private readonly ropes = new Map<number, Joint>();
  private readonly staticPivots = new Map<number, Body>();
  private nextRope = 1;
  private contacts: ContactEvent[] = [];
  private readonly groundContacts = new Map<number, number>();

  constructor() {
    this.world.on('begin-contact', (c) => {
      this.onContact(c, true);
    });
    this.world.on('end-contact', (c) => {
      this.onContact(c, false);
    });
  }

  setGeometry(segments: readonly Segment[]): void {
    for (const b of this.segmentBodies) this.world.destroyBody(b);
    this.segments = segments.slice();
    this.segmentBodies = this.segments.map((s, index) => {
      const body = this.world.createBody();
      body.createFixture(new Edge(s.a, s.b), {
        friction: 0,
        restitution: 0,
        userData: { kind: 'segment', index } satisfies FixtureTag,
      });
      return body;
    });
  }

  setGravity(gravity: Vec2): void {
    this.world.setGravity({ x: gravity.x, y: gravity.y });
  }

  createBody(def: BodyDef): number {
    const index = this.bodies.length;
    const body = this.world.createBody({
      type: 'dynamic',
      position: def.position,
      linearVelocity: def.velocity,
      bullet: true,
      fixedRotation: true,
    });
    body.createFixture(new Circle(def.radius), {
      density: 1,
      friction: 0,
      restitution: 0,
      userData: { kind: 'body', index } satisfies FixtureTag,
    });
    this.bodies.push({ def, body });
    return index;
  }

  bodyState(id: number): BodyState {
    const { body } = this.record(id);
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return {
      position: vec2(p.x, p.y),
      velocity: vec2(v.x, v.y),
      grounded: (this.groundContacts.get(id) ?? 0) > 0,
    };
  }

  setBodyVelocity(id: number, velocity: Vec2): void {
    this.record(id).body.setLinearVelocity(velocity);
  }

  teleportBody(id: number, position: Vec2): void {
    const { body } = this.record(id);
    body.setTransform(position, 0);
    body.setLinearVelocity({ x: 0, y: 0 });
    body.setAwake(true);
    this.groundContacts.delete(id);
  }

  createKinematicAnchor(position: Vec2): number {
    const body = this.world.createBody({ type: 'kinematic', position });
    this.anchors.push({ initial: position, body });
    return this.anchors.length - 1;
  }

  moveKinematicAnchor(id: number, position: Vec2, velocity: Vec2): void {
    const { body } = this.anchorRecord(id);
    body.setPosition(position);
    body.setLinearVelocity(velocity);
  }

  anchorPosition(id: number): Vec2 {
    const p = this.anchorRecord(id).body.getPosition();
    return vec2(p.x, p.y);
  }

  /** catchRetention is not supported by the Planck fallback (GMR-32 notes); catches are inelastic. */
  attachRope(bodyId: number, anchor: RopeAnchor, length: number): number {
    const { body } = this.record(bodyId);
    const id = this.nextRope++;
    let pivot: Body;
    let localAnchorA: Vec2;
    if (anchor.kind === 'static') {
      pivot = this.world.createBody({ type: 'static', position: anchor.point });
      this.staticPivots.set(id, pivot);
      localAnchorA = vec2(0, 0);
    } else {
      pivot = this.anchorRecord(anchor.anchor).body;
      localAnchorA = anchor.offset;
    }
    const joint = this.world.createJoint(
      new RopeJoint({
        bodyA: pivot,
        bodyB: body,
        localAnchorA,
        localAnchorB: { x: 0, y: 0 },
        maxLength: length,
      }),
    );
    if (!joint) throw new Error('planck refused the rope joint');
    this.ropes.set(id, joint);
    return id;
  }

  detachRope(rope: number): void {
    const joint = this.ropes.get(rope);
    if (joint) this.world.destroyJoint(joint);
    this.ropes.delete(rope);
    const pivot = this.staticPivots.get(rope);
    if (pivot) this.world.destroyBody(pivot);
    this.staticPivots.delete(rope);
  }

  raycast(from: Vec2, to: Vec2): RayHit | null {
    let best: RayHit | null = null;
    const length = dlen(to.x - from.x, to.y - from.y);
    this.world.rayCast(from, to, (fixture, point, normal, fraction) => {
      const tag = fixture.getUserData() as FixtureTag | null;
      if (tag?.kind !== 'segment') return -1;
      best = {
        point: vec2(point.x, point.y),
        normal: vec2(normal.x, normal.y),
        distance: fraction * length,
        segment: tag.index,
      };
      return fraction;
    });
    return best;
  }

  drainContacts(): ContactEvent[] {
    const out = this.contacts;
    this.contacts = [];
    return out;
  }

  step(dt: number, substeps: number): void {
    const n = Math.max(1, Math.floor(substeps));
    for (let i = 0; i < n; i++) this.world.step(dt / n, 8, 3);
  }

  resetBodies(): void {
    for (const id of [...this.ropes.keys()]) this.detachRope(id);
    // Contacts from before the teleport no longer describe the body (Codex review on PR 3).
    this.groundContacts.clear();
    for (const { def, body } of this.bodies) {
      body.setTransform(def.position, 0);
      body.setLinearVelocity(def.velocity);
      body.setAwake(true);
    }
    for (const { initial, body } of this.anchors) {
      body.setTransform(initial, 0);
      body.setLinearVelocity({ x: 0, y: 0 });
    }
    this.contacts = [];
  }

  stats(): PhysicsStats {
    let contacts = 0;
    for (let c = this.world.getContactList(); c; c = c.getNext()) if (c.isTouching()) contacts++;
    return { bodies: this.bodies.length, joints: this.ropes.size, contacts };
  }

  clearLevel(): void {
    for (const id of [...this.ropes.keys()]) this.detachRope(id);
    for (const { body } of this.bodies) this.world.destroyBody(body);
    for (const { body } of this.anchors) this.world.destroyBody(body);
    this.bodies.length = 0;
    this.anchors.length = 0;
    this.setGeometry([]);
    this.contacts = [];
    this.groundContacts.clear();
    this.nextRope = 1;
  }

  dispose(): void {
    this.clearLevel();
  }

  private onContact(c: Contact, begin: boolean): void {
    const a = c.getFixtureA().getUserData() as FixtureTag | null;
    const b = c.getFixtureB().getUserData() as FixtureTag | null;
    const bodyTag = a?.kind === 'body' ? a : b?.kind === 'body' ? b : null;
    const segTag = a?.kind === 'segment' ? a : b?.kind === 'segment' ? b : null;
    if (!bodyTag || !segTag) return;
    const manifold = c.getWorldManifold(null);
    let nx = manifold?.normal.x ?? 0;
    let ny = manifold?.normal.y ?? -1;
    // Planck's normal points from fixture A to B; we want it pointing toward the body.
    if (a?.kind === 'body') {
      nx = -nx;
      ny = -ny;
    }
    // A hazard is never standing ground: touching it kills, it never grants a jump (GMR-102).
    const isGround =
      ny < GROUND_NORMAL_Y && (this.segments[segTag.index] as Segment).kind !== 'hazard';
    if (isGround)
      this.groundContacts.set(
        bodyTag.index,
        (this.groundContacts.get(bodyTag.index) ?? 0) + (begin ? 1 : -1),
      );
    if (!begin) return;
    const v = this.record(bodyTag.index).body.getLinearVelocity();
    const s = this.segments[segTag.index] as Segment;
    this.contacts.push({
      body: bodyTag.index,
      segment: segTag.index,
      kind: s.kind,
      normal: vec2(nx, ny),
      speed: Math.max(0, -(v.x * nx + v.y * ny)),
    });
  }

  private record(id: number): BodyRecord {
    const r = this.bodies[id];
    if (!r) throw new Error(`unknown body ${String(id)}`);
    return r;
  }

  private anchorRecord(id: number): AnchorRecord {
    const r = this.anchors[id];
    if (!r) throw new Error(`unknown anchor ${String(id)}`);
    return r;
  }
}
