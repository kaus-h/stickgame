import { dcos, dlen, dsin, vec2, type Vec2 } from '../../../core';
import type {
  BodyDef,
  BodyState,
  ContactEvent,
  PhysicsAdapter,
  PhysicsStats,
  RayHit,
  RopeAnchor,
  RopeOptions,
  Segment,
} from '../../adapter';
import { SegmentGrid } from './SegmentGrid';

/**
 * Candidate C for GMR-32: a purpose-built kinematic solver.
 *
 * - Bodies are circles moved by continuous sweeps against static segments, so a body can never
 *   pass through geometry regardless of speed (no tunneling by construction).
 * - Ropes are inextensible distance limits enforced at velocity level (outward radial velocity
 *   removed) and position level (collision-aware projection back onto the circle).
 * - Kinematic anchors move with a scripted velocity, which drags attached bodies.
 * - Pure double-precision arithmetic in a fixed order: same inputs, same results.
 */

const SKIN = 1e-4;
const MAX_SLIDES = 4;
const GROUND_NORMAL_Y = -0.7;
const GROUND_PROBE = 0.01;
/**
 * Rope/solid conflict policy (GMR-24, docs/collision-policy.md): collision always wins. A body that
 * a solid keeps outside its rope circle by more than this stays where the solid puts it (the rope
 * is simply violated) and is pulled back only along free surface, by the collision-aware
 * projection. The pendulum step is only valid on the circle, so it is not used while violated.
 */
const ROPE_VIOLATION = 0.01;

interface Body {
  def: BodyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grounded: boolean;
  touching: Set<number>;
}

interface Anchor {
  initial: Vec2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Velocity during the previous step: the change since then is the pivot's acceleration. */
  lvx: number;
  lvy: number;
}

interface Rope {
  body: number;
  anchor: RopeAnchor;
  length: number;
  catchRetention: number;
}

interface Hit {
  t: number;
  nx: number;
  ny: number;
  segment: number;
}

export class KinematicPhysicsAdapter implements PhysicsAdapter {
  private segments: Segment[] = [];
  private grid = new SegmentGrid([]);
  private gx = 0;
  private gy = 25;
  private readonly bodies: Body[] = [];
  private readonly anchors: Anchor[] = [];
  private readonly ropes = new Map<number, Rope>();
  private nextRope = 1;
  private contacts: ContactEvent[] = [];

  setGeometry(segments: readonly Segment[]): void {
    this.segments = segments.slice();
    this.grid = new SegmentGrid(this.segments);
  }

  setGravity(gravity: Vec2): void {
    this.gx = gravity.x;
    this.gy = gravity.y;
  }

  createBody(def: BodyDef): number {
    this.bodies.push({
      def,
      x: def.position.x,
      y: def.position.y,
      vx: def.velocity.x,
      vy: def.velocity.y,
      r: def.radius,
      grounded: false,
      touching: new Set(),
    });
    const body = this.bodies[this.bodies.length - 1] as Body;
    // A body authored resting on the floor is grounded from tick 0 (jump works immediately).
    body.grounded = this.isGrounded(body);
    return this.bodies.length - 1;
  }

  bodyState(id: number): BodyState {
    const b = this.body(id);
    return { position: vec2(b.x, b.y), velocity: vec2(b.vx, b.vy), grounded: b.grounded };
  }

  setBodyVelocity(id: number, velocity: Vec2): void {
    const b = this.body(id);
    b.vx = velocity.x;
    b.vy = velocity.y;
  }

  createKinematicAnchor(position: Vec2): number {
    this.anchors.push({
      initial: position,
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      lvx: 0,
      lvy: 0,
    });
    return this.anchors.length - 1;
  }

  moveKinematicAnchor(id: number, position: Vec2, velocity: Vec2): void {
    const a = this.anchor(id);
    a.x = position.x;
    a.y = position.y;
    a.vx = velocity.x;
    a.vy = velocity.y;
  }

  anchorPosition(id: number): Vec2 {
    const a = this.anchor(id);
    return vec2(a.x, a.y);
  }

  attachRope(body: number, anchor: RopeAnchor, length: number, options?: RopeOptions): number {
    this.body(body);
    if (anchor.kind === 'kinematic') this.anchor(anchor.anchor);
    const id = this.nextRope++;
    const catchRetention = Math.min(1, Math.max(0, options?.catchRetention ?? 0));
    this.ropes.set(id, { body, anchor, length, catchRetention });
    return id;
  }

  detachRope(rope: number): void {
    this.ropes.delete(rope);
  }

  raycast(from: Vec2, to: Vec2): RayHit | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let best: RayHit | null = null;
    let bestT = Infinity;
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i] as Segment;
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const ax = s.a.x - from.x;
      const ay = s.a.y - from.y;
      const t = (ax * ey - ay * ex) / denom;
      const u = (ax * dy - ay * dx) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1 || t >= bestT) continue;
      const len = dlen(ex, ey);
      let nx = -ey / len;
      let ny = ex / len;
      if (nx * dx + ny * dy > 0) {
        nx = -nx;
        ny = -ny;
      }
      bestT = t;
      best = {
        point: vec2(from.x + dx * t, from.y + dy * t),
        normal: vec2(nx, ny),
        distance: t * dlen(dx, dy),
        segment: i,
      };
    }
    return best;
  }

  drainContacts(): ContactEvent[] {
    const out = this.contacts;
    this.contacts = [];
    return out;
  }

  step(dt: number, substeps: number): void {
    const n = Math.max(1, Math.floor(substeps));
    const h = dt / n;
    const touchedThisStep = this.bodies.map(() => new Set<number>());
    this.applyPivotAcceleration(dt);
    for (let k = 0; k < n; k++) {
      for (const a of this.anchors) {
        a.x += a.vx * h;
        a.y += a.vy * h;
      }
      for (let i = 0; i < this.bodies.length; i++) {
        this.substepBody(i, h, touchedThisStep[i] as Set<number>);
      }
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i] as Body;
      const touched = touchedThisStep[i] as Set<number>;
      b.grounded = this.isGrounded(b);
      b.touching = touched;
    }
  }

  resetBodies(): void {
    for (const b of this.bodies) {
      b.x = b.def.position.x;
      b.y = b.def.position.y;
      b.vx = b.def.velocity.x;
      b.vy = b.def.velocity.y;
      b.touching = new Set();
      b.grounded = this.isGrounded(b);
    }
    for (const a of this.anchors) {
      a.x = a.initial.x;
      a.y = a.initial.y;
      a.vx = 0;
      a.vy = 0;
      a.lvx = 0;
      a.lvy = 0;
    }
    this.ropes.clear();
    this.contacts = [];
  }

  stats(): PhysicsStats {
    let contacts = 0;
    for (const b of this.bodies) contacts += b.touching.size;
    return { bodies: this.bodies.length, joints: this.ropes.size, contacts };
  }

  clearLevel(): void {
    this.bodies.length = 0;
    this.anchors.length = 0;
    this.ropes.clear();
    this.segments = [];
    this.grid = new SegmentGrid([]);
    this.contacts = [];
    this.nextRope = 1;
  }

  dispose(): void {
    this.clearLevel();
  }

  // --- internals -------------------------------------------------------------------------------

  /**
   * A scripted pivot changes velocity once per step (moveKinematicAnchor). Taken as an impulse, the
   * change would be applied to the body's relative velocity in full: its radial part either made a
   * taut rope go slack for a moment (pivot accelerating toward the body) or was turned into extra
   * swing speed by the momentum-keeping catch (pivot accelerating away), so the swing gained energy
   * the real pendulum never would (GMR-26). A taut rope is rigid radially: while the rope stays in
   * tension under the pivot's acceleration over the step, the body follows the radial part of the
   * velocity change with the pivot and only the tangential part acts on the swing (the fictitious
   * force of the accelerating frame).
   */
  private applyPivotAcceleration(dt: number): void {
    for (const rope of this.ropes.values()) {
      if (rope.anchor.kind !== 'kinematic') continue;
      const a = this.anchor(rope.anchor.anchor);
      const dvx = a.vx - a.lvx;
      const dvy = a.vy - a.lvy;
      if (dvx === 0 && dvy === 0) continue;
      const b = this.body(rope.body);
      const rx = b.x - (a.x + rope.anchor.offset.x);
      const ry = b.y - (a.y + rope.anchor.offset.y);
      const d = dlen(rx, ry);
      const L = rope.length;
      if (d < 1e-9 || d < L - 1e-6 || d > L + ROPE_VIOLATION) continue; // slack or held off
      const nx = rx / d;
      const ny = ry / d;
      const rvx = b.vx - a.lvx;
      const rvy = b.vy - a.lvy;
      if (rvx * nx + rvy * ny < -1e-6) continue; // moving inward: going slack anyway
      const vt = -rvx * ny + rvy * nx;
      const tension = (vt * vt) / L + (this.gx - dvx / dt) * nx + (this.gy - dvy / dt) * ny;
      if (tension < 0) continue; // the pivot outruns gravity toward the body: the rope goes slack
      const dvr = dvx * nx + dvy * ny;
      b.vx += dvr * nx;
      b.vy += dvr * ny;
    }
    for (const a of this.anchors) {
      a.lvx = a.vx;
      a.lvy = a.vy;
    }
  }

  private substepBody(index: number, h: number, touched: Set<number>): void {
    const b = this.bodies[index] as Body;
    this.depenetrate(b, touched, index);

    const rope = this.ropeFor(index);
    const x0 = b.x;
    const y0 = b.y;
    if (rope && this.swingStep(b, rope, h, touched, index, x0, y0)) return;

    // Free flight (or a slack rope).
    b.vx += this.gx * h;
    b.vy += this.gy * h;
    this.sweep(b, b.vx * h, b.vy * h, true, touched, index);
    if (rope) this.enforceRopeLimit(b, rope, touched, index, x0, y0, h);
  }

  /**
   * Taut-rope step, integrated as a pendulum in the anchor's frame: angular velocity, then angle
   * (symplectic Euler), so swing energy oscillates instead of drifting. Returns false when the rope
   * is slack or would not be in tension, in which case the body flies freely this substep.
   */
  private swingStep(
    b: Body,
    rope: Rope,
    h: number,
    touched: Set<number>,
    index: number,
    x0: number,
    y0: number,
  ): boolean {
    const [ax, ay, avx, avy] = this.ropeAnchorKinematics(rope);
    const L = rope.length;
    // The angle is measured from where the pivot was when this substep began (anchors have already
    // advanced by v·h). Measuring it from the advanced pivot dropped the pivot's sideways travel
    // from the body's position each substep, so a moving pivot swung the body about twice as hard
    // as the real pendulum (GMR-26).
    const rx = b.x - (ax - avx * h);
    const ry = b.y - (ay - avy * h);
    const d = dlen(rx, ry);
    if (d < 1e-9 || d < L - 1e-6) return false;
    if (d > L + ROPE_VIOLATION) return false; // a solid holds the body outside the circle

    const nx = rx / d;
    const ny = ry / d;
    const tx = -ny;
    const ty = nx;
    let rvx = b.vx - avx;
    let rvy = b.vy - avy;
    const vr = rvx * nx + rvy * ny;
    if (vr > 0) {
      // Snapping taut: an inextensible rope removes the outward relative velocity (optionally
      // redirecting part of it along the swing).
      [rvx, rvy] = catchTaut(rvx, rvy, nx, ny, vr, rope.catchRetention);
    } else if (vr < -1e-6) {
      return false; // moving inward: the rope goes slack
    }
    const vt = rvx * tx + rvy * ty;
    const gravityOutward = this.gx * nx + this.gy * ny;
    if ((vt * vt) / L + gravityOutward < 0) return false; // no tension: slack

    let w = vt / L;
    w += ((this.gx * tx + this.gy * ty) / L) * h;
    const dth = w * h;
    const c = dcos(dth);
    const s = dsin(dth);
    const nnx = nx * c + tx * s;
    const nny = ny * c + ty * s;
    b.vx = avx + (-nx * s + tx * c) * w * L;
    b.vy = avy + (-ny * s + ty * c) * w * L;
    this.sweep(b, ax + nnx * L - b.x, ay + nny * L - b.y, true, touched, index);
    // A solid blocked the swing and left the body outside the circle: let the rope slide it back
    // along the surface (collision-aware) and drop the outward velocity, as a taut rope would.
    if (dlen(b.x - ax, b.y - ay) > L + 1e-6)
      this.enforceRopeLimit(b, rope, touched, index, x0, y0, h);
    return true;
  }

  /** After free flight, pull the body back onto the rope circle if it went past it (taut snap). */
  private enforceRopeLimit(
    b: Body,
    rope: Rope,
    touched: Set<number>,
    index: number,
    x0: number,
    y0: number,
    h: number,
  ): void {
    const [ax, ay, avx, avy] = this.ropeAnchorKinematics(rope);
    const dx = b.x - ax;
    const dy = b.y - ay;
    const dist = dlen(dx, dy);
    if (dist <= rope.length || dist < 1e-9) return;
    const s = rope.length / dist;
    this.sweep(b, ax + dx * s - b.x, ay + dy * s - b.y, false, touched, index);
    if (dlen(b.x - ax, b.y - ay) > rope.length + 1e-6) {
      // A solid keeps the body outside the rope circle (collision wins): the rope has overridden
      // part of the free motion, so the velocity becomes the motion that actually happened.
      // Otherwise gravity would pile phantom speed onto a body the rope holds in place.
      b.vx = (b.x - x0) / h;
      b.vy = (b.y - y0) / h;
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    const vr = (b.vx - avx) * nx + (b.vy - avy) * ny;
    if (vr > 0) {
      const [rvx, rvy] = catchTaut(b.vx - avx, b.vy - avy, nx, ny, vr, rope.catchRetention);
      b.vx = avx + rvx;
      b.vy = avy + rvy;
    }
  }

  /** Move the circle by (dx, dy), sliding along surfaces it hits. */
  private sweep(
    b: Body,
    dx: number,
    dy: number,
    affectVelocity: boolean,
    touched: Set<number>,
    bodyIndex: number,
  ): void {
    let rx = dx;
    let ry = dy;
    for (let slide = 0; slide < MAX_SLIDES; slide++) {
      if (rx * rx + ry * ry < 1e-18) return;
      const hit = this.firstHit(b.x, b.y, rx, ry, b.r);
      if (!hit) {
        b.x += rx;
        b.y += ry;
        return;
      }
      b.x += rx * hit.t + hit.nx * SKIN;
      b.y += ry * hit.t + hit.ny * SKIN;
      this.touch(b, hit.segment, hit.nx, hit.ny, touched, bodyIndex);
      if (affectVelocity) {
        const vn = b.vx * hit.nx + b.vy * hit.ny;
        if (vn < 0) {
          b.vx -= vn * hit.nx;
          b.vy -= vn * hit.ny;
        }
      }
      rx *= 1 - hit.t;
      ry *= 1 - hit.t;
      const rn = rx * hit.nx + ry * hit.ny;
      if (rn < 0) {
        rx -= rn * hit.nx;
        ry -= rn * hit.ny;
      }
    }
  }

  /** Earliest time of impact in [0, 1] of a circle moving by (dx, dy) against all segments. */
  private firstHit(px: number, py: number, dx: number, dy: number, r: number): Hit | null {
    let best: Hit | null = null;
    const ids = this.grid.candidates(
      Math.min(px, px + dx) - r,
      Math.min(py, py + dy) - r,
      Math.max(px, px + dx) + r,
      Math.max(py, py + dy) + r,
    );
    for (const i of ids) {
      const s = this.segments[i] as Segment;
      const hit = sweepCircleSegment(px, py, dx, dy, r, s.a.x, s.a.y, s.b.x, s.b.y);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, segment: i };
    }
    return best;
  }

  /** Push the circle out of any segment it overlaps (e.g. after a rope projection). */
  private depenetrate(b: Body, touched: Set<number>, bodyIndex: number): void {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const ids = [...this.grid.candidates(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r)];
      for (const i of ids) {
        const s = this.segments[i] as Segment;
        const [qx, qy] = closestPoint(b.x, b.y, s.a.x, s.a.y, s.b.x, s.b.y);
        let nx = b.x - qx;
        let ny = b.y - qy;
        const dist = dlen(nx, ny);
        if (dist >= b.r) continue;
        if (dist > 1e-12) {
          nx /= dist;
          ny /= dist;
        } else {
          const len = dlen(s.b.x - s.a.x, s.b.y - s.a.y);
          nx = -(s.b.y - s.a.y) / len;
          ny = (s.b.x - s.a.x) / len;
        }
        b.x += nx * (b.r - dist + SKIN);
        b.y += ny * (b.r - dist + SKIN);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= vn * nx;
          b.vy -= vn * ny;
        }
        this.touch(b, i, nx, ny, touched, bodyIndex);
        moved = true;
      }
      if (!moved) return;
    }
  }

  private touch(
    b: Body,
    segment: number,
    nx: number,
    ny: number,
    touched: Set<number>,
    bodyIndex: number,
  ): void {
    if (!touched.has(segment) && !b.touching.has(segment)) {
      const s = this.segments[segment] as Segment;
      this.contacts.push({
        body: bodyIndex,
        segment,
        kind: s.kind,
        normal: vec2(nx, ny),
        speed: Math.max(0, -(b.vx * nx + b.vy * ny)),
      });
    }
    touched.add(segment);
  }

  private isGrounded(b: Body): boolean {
    const reach = b.r + GROUND_PROBE;
    for (const i of this.grid.candidates(b.x - reach, b.y - reach, b.x + reach, b.y + reach)) {
      const s = this.segments[i] as Segment;
      const [qx, qy] = closestPoint(b.x, b.y, s.a.x, s.a.y, s.b.x, s.b.y);
      const dx = b.x - qx;
      const dy = b.y - qy;
      const dist = dlen(dx, dy);
      if (dist <= b.r + GROUND_PROBE && dist > 1e-12 && dy / dist < GROUND_NORMAL_Y) return true;
    }
    return false;
  }

  private ropeFor(bodyIndex: number): Rope | undefined {
    for (const rope of this.ropes.values()) if (rope.body === bodyIndex) return rope;
    return undefined;
  }

  private ropeAnchorKinematics(rope: Rope): [number, number, number, number] {
    if (rope.anchor.kind === 'static') return [rope.anchor.point.x, rope.anchor.point.y, 0, 0];
    const a = this.anchor(rope.anchor.anchor);
    return [a.x + rope.anchor.offset.x, a.y + rope.anchor.offset.y, a.vx, a.vy];
  }

  private body(id: number): Body {
    const b = this.bodies[id];
    if (!b) throw new Error(`unknown body ${String(id)}`);
    return b;
  }

  private anchor(id: number): Anchor {
    const a = this.anchors[id];
    if (!a) throw new Error(`unknown anchor ${String(id)}`);
    return a;
  }
}

function closestPoint(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
  return [ax + ex * t, ay + ey * t];
}

/** Swept circle (center p, radius r, displacement d) vs segment AB. Returns earliest t in [0, 1]. */
function sweepCircleSegment(
  px: number,
  py: number,
  dx: number,
  dy: number,
  r: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; nx: number; ny: number } | null {
  let best: { t: number; nx: number; ny: number } | null = null;
  const ex = bx - ax;
  const ey = by - ay;
  const len = dlen(ex, ey);

  if (len > 1e-12) {
    // Face: the line offset by r on the side the circle starts on.
    let nx = -ey / len;
    let ny = ex / len;
    let side = (px - ax) * nx + (py - ay) * ny;
    if (side < 0) {
      nx = -nx;
      ny = -ny;
      side = -side;
    }
    const approach = dx * nx + dy * ny;
    if (approach < 0 && side < r - 1e-9) {
      // Already overlapping the face (squeezed in a crevice) and moving deeper: block at once.
      const u = ((px - ax) * ex + (py - ay) * ey) / (len * len);
      if (u >= 0 && u <= 1) best = { t: 0, nx, ny };
    } else if (approach < 0 && side >= r - 1e-9) {
      const t = (r - side) / approach;
      if (t >= 0 && t <= 1) {
        const cx = px + dx * t - ax;
        const cy = py + dy * t - ay;
        const u = (cx * ex + cy * ey) / (len * len);
        if (u >= 0 && u <= 1) best = { t, nx, ny };
      }
    }
  }

  // Endpoints: ray vs circle of radius r around each end.
  for (const [cx, cy] of [
    [ax, ay],
    [bx, by],
  ] as const) {
    const fx = px - cx;
    const fy = py - cy;
    const a = dx * dx + dy * dy;
    const bq = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    if (a < 1e-18 || bq >= 0) continue;
    if (c < 0) {
      // Already overlapping this end cap (squeezed between two surfaces) and moving deeper: block
      // at once instead of letting the body sink further.
      if (best && best.t <= 0) continue;
      const hl = dlen(fx, fy);
      if (hl > 1e-12) best = { t: 0, nx: fx / hl, ny: fy / hl };
      continue;
    }
    const disc = bq * bq - 4 * a * c;
    if (disc < 0) continue;
    const t = (-bq - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1 || (best && t >= best.t)) continue;
    const hx = fx + dx * t;
    const hy = fy + dy * t;
    const hl = dlen(hx, hy);
    best = { t, nx: hx / hl, ny: hy / hl };
  }
  return best;
}

/** Sideways speed, as a share of the outward speed, needed for the full momentum redirect. */
const CATCH_BLEND = 1;

/**
 * Remove the outward radial component vr of a relative velocity at a taut catch and, with
 * retention k, turn part of it into swing in the direction already travelled.
 *
 * The redirected amount blends in with the sideways speed: kept = k·vr·min(1, |steer| / vr), steer = vt + horizontal velocity along the tangent.
 * A catch with clear sideways motion keeps its speed (k = 1: momentum becomes swing, owner
 * direction 2026-10-07). A catch moving straight along the rope gets the plain inelastic catch,
 * so there is no arbitrary left/right choice and the outcome is continuous in the attach timing
 * (GMR-26 found a 4–5 m/s release jump per tick without this blend on moving anchors).
 */
function catchTaut(
  rvx: number,
  rvy: number,
  nx: number,
  ny: number,
  vr: number,
  k: number,
): [number, number] {
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  if (k <= 0) return [tx * vt, ty * vt];
  // Which way the swing goes: the sideways motion plus the horizontal (run/jump) motion seen along
  // the tangent. Running into a catch therefore swings the way you ran.
  const steer = vt + rvx * tx;
  if (steer === 0) return [tx * vt, ty * vt];
  const blend = Math.min(1, Math.abs(steer) / (CATCH_BLEND * vr));
  const kept = k * vr * blend;
  // Add the speed gained by folding `kept` into the swing, in the steer direction. Never more
  // energy than before the catch (|result| ≤ sqrt(vt² + kept²) ≤ incoming speed), and exactly vt
  // when steer → 0, so the outcome is continuous in the catch state.
  const speed = vt + Math.sign(steer) * (Math.sqrt(vt * vt + kept * kept) - Math.abs(vt));
  return [tx * speed, ty * speed];
}
