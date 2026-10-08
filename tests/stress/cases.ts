import { vec2, type Vec2 } from '../../src/core';
import { Simulation, type LevelDef, type SimTuning, type SolidDef } from '../../src/sim';
import { KinematicPhysicsAdapter } from '../../src/physics/backends/kinematic/KinematicPhysicsAdapter';
import {
  box,
  emptyRow,
  energy,
  finite,
  flag,
  G,
  insideAny,
  makeRig,
  PEN_TOL,
  penetration,
  poly,
  pos,
  R,
  rad,
  speedOf,
  step,
  vel,
  type Rig,
  type Row,
} from './harness';

/** Rope stretch tolerated while a ceiling holds the swing (measured max 0.105 m up to 80 m/s). */
const CEILING_STRETCH = 0.12;
const dist = (a: Vec2, b: Vec2): number => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const fmt = (n: number): string =>
  Math.abs(n) < 1e-3 && n !== 0 ? n.toExponential(1) : n.toFixed(3);

/** Per-step invariants shared by every adapter case. Returns false when the run is unusable. */
function observe(row: Row, rig: Rig, radius = R): boolean {
  const p = pos(rig);
  const v = vel(rig);
  if (!finite(p) || !finite(v)) {
    flag(row, 'non-finite state');
    return false;
  }
  row.pen = Math.max(row.pen, penetration(p, radius, rig.segments));
  if (insideAny(p, rig.solids)) flag(row, 'center inside solid');
  return true;
}

function close(row: Row): Row {
  if (row.pen > PEN_TOL) flag(row, `penetration ${fmt(row.pen)} m`);
  return row;
}

// --- thin wall / thin floor (tunneling) ----------------------------------------------------------

/** Body fired at a thin vertical wall; angle is measured from the wall normal (0 = head-on). */
export function thinWall(thickness: number, speed: number, angleDeg: number): Row {
  const row = emptyRow('thin-wall', `t=${String(thickness)}`, speed, angleDeg);
  const wall = box('wall', 10, -400, thickness, 800);
  const a = rad(angleDeg);
  const rig = makeRig([wall], vec2(0, 0), vec2(speed * Math.cos(a), speed * Math.sin(a)));
  for (let i = 0; i < 120; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (pos(rig).x > 10 + thickness) flag(row, 'tunneled through wall');
  }
  return close(row);
}

/** Body falling onto a thin horizontal floor; angle from the floor normal (0 = straight down). */
export function thinFloor(thickness: number, speed: number, angleDeg: number): Row {
  const row = emptyRow('thin-floor', `t=${String(thickness)}`, speed, angleDeg);
  const floor = box('floor', -400, 10, 800, thickness);
  const a = rad(angleDeg);
  const rig = makeRig([floor], vec2(0, 0), vec2(speed * Math.sin(a), speed * Math.cos(a)));
  for (let i = 0; i < 120; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (pos(rig).y > 10 + thickness) flag(row, 'tunneled through floor');
  }
  return close(row);
}

// --- rope cases ----------------------------------------------------------------------------------

interface SwingResult {
  row: Row;
  rig: Rig;
}

/** Swing a body on a static rope and measure stretch, penetration, energy. */
function swing(
  row: Row,
  solids: readonly SolidDef[],
  anchor: Vec2,
  length: number,
  start: Vec2,
  v: Vec2,
  steps: number,
  retention = 1,
  gravity = G,
  energyCheck = true,
): SwingResult {
  const rig = makeRig(solids, start, v, gravity);
  rig.world.attachRope(rig.body, { kind: 'static', point: anchor }, length, {
    catchRetention: retention,
  });
  const e0 = energy(start, v, gravity);
  const scale = 0.5 * (v.x * v.x + v.y * v.y) + gravity * 2 * length + 1;
  let gain = 0;
  for (let i = 0; i < steps; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    const p = pos(rig);
    row.stretch = Math.max(row.stretch, dist(p, anchor) - length);
    gain = Math.max(gain, energy(p, vel(rig), gravity) - e0);
  }
  row.keep = gain / scale;
  if (energyCheck && gain > 0.1 * scale) flag(row, `energy gain ${fmt(gain / scale)} of scale`);
  return { row, rig };
}

/** Swing whose arc runs into a horizontal ceiling slab; `underside` is the slab's lower face y. */
export function lowCeilingSwing(underside: number, speed: number): Row {
  const row = emptyRow('low-ceiling-swing', `underside y=${String(underside)}`, speed, 0);
  const slab = box('ceiling', 1, underside - 1, 12, 1);
  const { row: r } = swing(row, [slab], vec2(0, 0), 5, vec2(0, 5), vec2(speed, 0), 120);
  if (r.stretch > CEILING_STRETCH) flag(r, `rope stretched ${fmt(r.stretch)} m`);
  return close(r);
}

/**
 * The rope wants the body inside a wall or floor: the anchor sits on the far side of a slab and the
 * rope is shorter than the closest reachable distance. Policy: collision wins, the rope stays
 * violated (stretch), nothing explodes and nothing jitters.
 */
export function constraintConflict(
  kind: 'wall' | 'floor',
  length: number,
  speed: number,
  angleDeg: number,
): Row {
  const row = emptyRow('constraint-vs-solid', `${kind} L=${String(length)}`, speed, angleDeg);
  // Anchor at the origin; slab 0.3 m thick starting 1 m away; body outside the slab.
  const slab = kind === 'wall' ? box('slab', 1, -50, 0.3, 100) : box('slab', -50, 1, 100, 0.3);
  const start = kind === 'wall' ? vec2(2.5, 0) : vec2(0, 2.5);
  const a = rad(angleDeg);
  const v = vec2(speed * Math.cos(a), speed * Math.sin(a));
  const rig = makeRig([slab], start, v);
  rig.world.attachRope(rig.body, { kind: 'static', point: vec2(0, 0) }, length, {
    catchRetention: 1,
  });
  const e0 = energy(start, v);
  const scale = 0.5 * speed * speed + G * 6 + 1;
  let gain = 0;
  let late = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxV: 0 };
  const steps = 240;
  for (let i = 0; i < steps; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    const p = pos(rig);
    row.stretch = Math.max(row.stretch, dist(p, vec2(0, 0)) - length);
    gain = Math.max(gain, energy(p, vel(rig)) - e0);
    if (i >= steps - 60) {
      late = {
        minX: Math.min(late.minX, p.x),
        maxX: Math.max(late.maxX, p.x),
        minY: Math.min(late.minY, p.y),
        maxY: Math.max(late.maxY, p.y),
        maxV: Math.max(late.maxV, speedOf(vel(rig))),
      };
    }
  }
  row.keep = gain / scale;
  if (gain > 0.1 * scale) flag(row, `energy gain ${fmt(gain / scale)} of scale`);
  const drift = Math.max(late.maxX - late.minX, late.maxY - late.minY);
  const conflicted = length < 1.6; // closest reachable centre is 1.65 m from the anchor
  if (conflicted && drift > 0.05) flag(row, `still moving ${fmt(drift)} m in last second`);
  if (conflicted && late.maxV > 1) flag(row, `speed ${fmt(late.maxV)} m/s in last second`);
  return close(row);
}

/** Near-zero rope lengths: no NaN, no energy blow-up, no stretch. */
export function nearZeroRope(length: number, speed: number, radial: boolean): Row {
  const row = emptyRow(
    'near-zero-rope',
    `L=${String(length)}${radial ? ' radial' : ' tangent'}`,
    speed,
    radial ? 90 : 0,
  );
  const start = radial ? vec2(length, 0) : vec2(0, length);
  const v = radial ? vec2(0, speed) : vec2(speed, 0);
  const { row: r } = swing(row, [], vec2(0, 0), length, start, v, 120, 1, G, length >= 0.8);
  if (r.stretch > 1e-3) flag(r, `rope stretched ${fmt(r.stretch)} m`);
  return r;
}

/** Extreme rope lengths (far beyond the 11 m gameplay maximum). */
export function extremeRope(length: number, speed: number): Row {
  const row = emptyRow('extreme-rope', `L=${String(length)}`, speed, 0);
  const { row: r } = swing(row, [], vec2(0, 0), length, vec2(length, 0), vec2(0, speed), 240);
  if (r.stretch > 1e-3) flag(r, `rope stretched ${fmt(r.stretch)} m`);
  return r;
}

// --- corners, seams, tunnels ---------------------------------------------------------------------

/** Fired at the top-left corner of a block, offset sideways by `offset` m, no gravity. */
export function vertexHit(approachDeg: number, offset: number, speed: number): Row {
  const row = emptyRow('sharp-corner-vertex', `offset=${String(offset)}`, speed, approachDeg);
  const block = box('block', 10, 10, 10, 20);
  const a = rad(approachDeg);
  const dir = vec2(Math.cos(a), Math.sin(a));
  const aimed = vec2(10 + -dir.y * offset, 10 + dir.x * offset);
  const start = vec2(aimed.x - dir.x * 6, aimed.y - dir.y * 6);
  const rig = makeRig([block], start, vec2(dir.x * speed, dir.y * speed), 0);
  let maxSpeed = 0;
  for (let i = 0; i < 120; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    maxSpeed = Math.max(maxSpeed, speedOf(vel(rig)));
  }
  row.keep = speedOf(vel(rig)) / speed;
  if (maxSpeed > speed * 1.001) flag(row, 'gained speed at corner');
  return close(row);
}

/** Running off a platform edge: horizontal speed must survive the convex corner. */
export function edgeRunOff(speed: number): Row {
  const row = emptyRow('sharp-corner-runoff', 'platform edge', speed, 0);
  const rig = makeRig([box('plat', -100, 10, 110, 10)], vec2(0, 10 - R - 1e-4), vec2(speed, 0));
  let minVx = Infinity;
  for (let i = 0; i < 90; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (i >= 2) minVx = Math.min(minVx, vel(rig).x);
  }
  row.keep = minVx / speed;
  if (row.keep < 0.995) flag(row, `lost ${fmt(1 - row.keep)} of vx running off the edge`);
  return close(row);
}

/**
 * Sliding across seams of an abutting tile floor (`step` = height of each next tile above the
 * previous, m). Snagging shows up as lost horizontal speed.
 */
export function seamSlide(stepUp: number, speed: number): Row {
  const row = emptyRow('seam-snag-floor', `seam step ${String(stepUp)}`, speed, 0);
  const tiles: SolidDef[] = [];
  for (let i = 0; i < 100; i++) {
    const y = 10 - stepUp * (i % 2);
    tiles.push(box(`t${String(i)}`, i, y, 1, 4));
  }
  const rig = makeRig(tiles, vec2(0.5, 10 - R - 1e-4), vec2(speed, 0));
  let minVx = Infinity;
  const steps = Math.min(100, Math.floor((90 / speed) * 60));
  for (let i = 0; i < steps; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (i >= 3) minVx = Math.min(minVx, vel(rig).x);
  }
  row.keep = minVx / speed;
  const floor = stepUp === 0 ? 0.999 : 0.9;
  if (row.keep < floor) flag(row, `snagged: kept ${fmt(row.keep)} of vx`);
  return close(row);
}

/** Pressed against a wall built from stacked tiles while falling at speed: vy must survive seams. */
export function seamSlideWall(speed: number): Row {
  const row = emptyRow('seam-snag-wall', 'stacked wall tiles', speed, 90);
  const tiles: SolidDef[] = [];
  for (let i = 0; i < 120; i++) tiles.push(box(`t${String(i)}`, 10, i - 20, 3, 1));
  const rig = makeRig(tiles, vec2(10 - R - 1e-4, -15), vec2(1, speed));
  let minVy = Infinity;
  for (let i = 0; i < 100; i++) {
    rig.world.setBodyVelocity(rig.body, vec2(2, vel(rig).y));
    step(rig);
    if (!observe(row, rig)) break;
    if (i >= 3) minVy = Math.min(minVy, vel(rig).y);
  }
  row.keep = minVy / speed;
  if (row.keep < 0.999) flag(row, `snagged: kept ${fmt(row.keep)} of vy`);
  return close(row);
}

/** Driven diagonally into the inside corner of floor + wall. */
export function concaveCorner(approachDeg: number, speed: number): Row {
  const row = emptyRow('concave-corner', 'floor+wall', speed, approachDeg);
  const solids = [box('floor', -100, 10, 200, 10), box('wall', 20, -100, 10, 110)];
  const a = rad(approachDeg);
  const rig = makeRig(solids, vec2(12, 8), vec2(speed * Math.cos(a), speed * Math.sin(a)));
  for (let i = 0; i < 120; i++) {
    step(rig);
    if (!observe(row, rig)) break;
  }
  const p = pos(rig);
  if (p.x > 20 || p.y > 10) flag(row, 'escaped the corner');
  return close(row);
}

/** Driven into a 30 degree crevice between a floor and a sloped face (wedge). */
export function wedge(speed: number): Row {
  const row = emptyRow('wedge-crevice', '30 deg', speed, 180);
  const floor = box('floor', -100, 10, 200, 10);
  const slope = poly('slope', [
    [15, 10],
    [70, 10 - 55 * Math.tan(rad(30))],
    [70, -60],
  ]);
  const rig = makeRig([floor, slope], vec2(50, 5), vec2(-speed, 0));
  for (let i = 0; i < 180; i++) {
    step(rig);
    if (!observe(row, rig)) break;
  }
  if (pos(rig).x < 15) flag(row, 'passed the wedge tip');
  return close(row);
}

/**
 * A 6 m tunnel of height `gap` entered at `speed`. Blocked widths (gap below the body diameter)
 * must stay blocked; open widths must be passable when entered level.
 */
export function tunnel(gap: number, speed: number, angleDeg: number): Row {
  const row = emptyRow(
    'narrow-tunnel',
    `gap=${String(gap)} (2r=${String(2 * R)})`,
    speed,
    angleDeg,
  );
  const solids = [box('floor', 10, gap / 2, 6, 3), box('ceil', 10, -gap / 2 - 3, 6, 3)];
  const a = rad(angleDeg);
  const rig = makeRig(solids, vec2(0, 0), vec2(speed * Math.cos(a), speed * Math.sin(a)), 0);
  const steps = Math.ceil((24 / (speed * Math.cos(a))) * 60) + 10;
  for (let i = 0; i < steps; i++) {
    step(rig);
    if (!observe(row, rig)) break;
  }
  const passed = pos(rig).x > 16.2;
  const fits = gap >= 2 * R + 2e-3;
  const blocked = gap < 2 * R - 0.01; // within 1 cm of the diameter is a coin toss
  if (blocked && passed) flag(row, 'squeezed through a gap narrower than the body');
  if (fits && angleDeg === 0 && !passed)
    flag(row, `stuck in a passable tunnel at x=${fmt(pos(rig).x)}`);
  return close(row);
}

// --- hazards -------------------------------------------------------------------------------------

/** Fired at a thin hazard strip: a contact must be reported before the body can pass it. */
export function hazardStrike(gap: number, speed: number, angleDeg: number): Row {
  const row = emptyRow('hazard-strike', `gap=${String(gap)}`, speed, angleDeg);
  const strip = box('hz', 10, -400, 0.05, 800, 'hazard');
  const a = rad(angleDeg);
  const rig = makeRig(
    [strip],
    vec2(10 - R - gap, 0),
    vec2(speed * Math.cos(a), speed * Math.sin(a)),
    0,
  );
  let hit = false;
  for (let i = 0; i < 30; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (rig.world.drainContacts().some((c) => c.kind === 'hazard')) hit = true;
    if (pos(rig).x > 10.05 && !hit) flag(row, 'crossed hazard without a contact');
  }
  if (!hit) flag(row, 'no hazard contact reported');
  return close(row);
}

/** A body gliding past a hazard at `gap` from its surface must not be reported as touching. */
export function hazardGraze(gap: number, speed: number): Row {
  const row = emptyRow('hazard-graze', `gap=${String(gap)}`, speed, 90);
  const strip = box('hz', 10, -400, 0.05, 800, 'hazard');
  const rig = makeRig([strip], vec2(10 - R - gap, 0), vec2(0, speed), 0);
  for (let i = 0; i < 30; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (rig.world.drainContacts().some((c) => c.kind === 'hazard'))
      flag(row, 'false hazard contact');
  }
  return close(row);
}

/**
 * Release a swing just before a hazard strip on the arc; the released body must either report the
 * hazard or never reach it.
 */
export function releaseNearHazard(speed: number, releaseX: number): Row {
  const row = emptyRow('release-near-hazard', `release at x>=${String(releaseX)}`, speed, 0);
  const strip = box('hz', 3, -60, 0.05, 120, 'hazard');
  const rig = makeRig([strip], vec2(0, 5), vec2(speed, 0));
  const rope = rig.world.attachRope(rig.body, { kind: 'static', point: vec2(0, 0) }, 5, {
    catchRetention: 1,
  });
  let released = false;
  let hit = false;
  for (let i = 0; i < 90; i++) {
    step(rig);
    if (!observe(row, rig)) break;
    if (!released && pos(rig).x >= releaseX) {
      rig.world.detachRope(rope);
      released = true;
    }
    if (rig.world.drainContacts().some((c) => c.kind === 'hazard')) hit = true;
    if (pos(rig).x > 3.05 && !hit) flag(row, 'crossed hazard without a contact');
  }
  return close(row);
}

// --- through Simulation --------------------------------------------------------------------------

export const SIM_TUNING: SimTuning = {
  gravity: 30,
  physicsSubsteps: 4,
  player: {
    radius: 0.35,
    runSpeed: 7.5,
    groundAccel: 80,
    groundDecel: 100,
    airAccel: 40,
    airMaxSpeed: 7.5,
    jumpSpeed: 12.5,
    jumpCut: 0.45,
    fallGravityScale: 1.6,
    maxFallSpeed: 26,
    coyoteTicks: 6,
    jumpBufferTicks: 7,
  },
  rope: {
    minLength: 0.8,
    maxLength: 11,
    selectRadius: 1.1,
    steerAccel: 6,
    steerEnergyHeight: 0.6,
    catchRetention: 1,
  },
};

function simLevel(spawn: Vec2, solids: SolidDef[], anchors: LevelDef['anchors'] = []): LevelDef {
  return {
    id: 'stress',
    name: 'stress',
    spawn,
    bounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
    killY: 1000,
    solids,
    anchors,
  };
}

function simRig(level: LevelDef): { sim: Simulation; phys: KinematicPhysicsAdapter } {
  const phys = new KinematicPhysicsAdapter();
  return { sim: new Simulation(SIM_TUNING, phys, level), phys };
}

/** Player launched sideways at a thin wall through the full Simulation. */
export function simThinWall(speed: number): Row {
  const row = emptyRow('sim: thin wall', 't=0.05', speed, 0);
  const wall = box('wall', 10, -400, 0.05, 800);
  const { sim, phys } = simRig(simLevel(vec2(0, 0), [wall]));
  phys.setBodyVelocity(0, vec2(speed, 0));
  for (let i = 0; i < 120; i++) {
    sim.step([]);
    const p = sim.snapshot().player.position;
    if (!finite(p)) {
      flag(row, 'non-finite');
      break;
    }
    if (p.x > 10.05) flag(row, 'tunneled through wall');
  }
  return row;
}

/**
 * Player launched down at a thin floor through the full Simulation. The controller clamps the
 * fall speed to maxFallSpeed, so the effective impact speed is min(speed, 26).
 */
export function simThinFloor(speed: number): Row {
  const row = emptyRow('sim: thin floor', 't=0.05', speed, 0);
  const floor = box('floor', -400, 10, 800, 0.05);
  const { sim, phys } = simRig(simLevel(vec2(0, 0), [floor]));
  phys.setBodyVelocity(0, vec2(0, speed));
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    sim.step([]);
    const s = sim.snapshot().player;
    peak = Math.max(peak, s.velocity.y);
    if (s.position.y > 10.05) flag(row, 'tunneled through floor');
  }
  row.keep = peak;
  return row;
}

/** Player launched at a thin hazard strip: it must die, never pass. */
export function simHazard(speed: number): Row {
  const row = emptyRow('sim: hazard strike', 't=0.05', speed, 0);
  const strip = box('hz', 10, -400, 0.05, 800, 'hazard');
  const { sim, phys } = simRig(simLevel(vec2(0, 0), [strip]));
  phys.setBodyVelocity(0, vec2(speed, 0));
  let died = false;
  for (let i = 0; i < 120 && !died; i++) {
    sim.step([]);
    if (sim.snapshot().player.position.x > 10.05) flag(row, 'crossed hazard alive');
    if (sim.drainEvents().some((e) => e.type === 'death' && e.cause === 'hazard')) died = true;
  }
  if (!died) flag(row, 'no hazard death');
  return row;
}

/**
 * Airborne tether at `length` (anchor straight above the player) swung at `speed`, optionally under
 * a ceiling slab, through the full Simulation.
 */
export function simSwing(length: number, speed: number, underside: number | null): Row {
  const row = emptyRow(
    'sim: swing',
    `L=${String(length)}${underside === null ? '' : ` ceiling y=${String(underside)}`}`,
    speed,
    0,
  );
  const solids = underside === null ? [] : [box('ceiling', 1, underside - 1, 40, 1)];
  const start = vec2(0, length);
  const level = simLevel(start, solids, [{ id: 'a', position: vec2(0, 0), radius: 0.4 }]);
  const { sim, phys } = simRig(level);
  phys.setBodyVelocity(0, vec2(speed, 0));
  const segs = solids.length > 0 ? makeRig(solids, start, vec2(0, 0)).segments : [];
  let e0 = NaN;
  let gain = 0;
  for (let i = 0; i < 180; i++) {
    sim.step(i === 0 ? [{ type: 'ropeAim', target: vec2(0, 0) }, { type: 'ropePress' }] : []);
    const snap = sim.snapshot();
    const p = snap.player.position;
    if (!finite(p) || !finite(snap.player.velocity)) {
      flag(row, 'non-finite');
      break;
    }
    if (i === 0 && !snap.rope) {
      flag(row, 'rope did not connect');
      break;
    }
    row.pen = Math.max(row.pen, penetration(p, R, segs));
    if (insideAny(p, solids)) flag(row, 'center inside solid');
    if (snap.rope) {
      row.stretch = Math.max(row.stretch, dist(p, snap.rope.point) - snap.rope.length);
    }
    const e = energy(p, snap.player.velocity);
    if (Number.isNaN(e0)) e0 = e;
    gain = Math.max(gain, e - e0);
  }
  const scale = 0.5 * speed * speed + G * 2 * length + 1;
  row.keep = gain / scale;
  if (gain > 0.1 * scale) flag(row, `energy gain ${fmt(gain / scale)} of scale`);
  if (row.stretch > CEILING_STRETCH) flag(row, `rope stretched ${fmt(row.stretch)} m`);
  return close(row);
}

/** Rope presses at the extremes of the length rule: too close and too far must be rejected. */
export function simRopeLimits(anchorDistance: number): Row {
  const row = emptyRow('sim: rope length limits', `anchor at ${String(anchorDistance)} m`, 0, 0);
  const level = simLevel(
    vec2(0, 0),
    [],
    [{ id: 'a', position: vec2(anchorDistance, 0), radius: 0.4 }],
  );
  const { sim } = simRig(level);
  sim.step([{ type: 'ropeAim', target: vec2(anchorDistance, 0) }, { type: 'ropePress' }]);
  const events = sim.drainEvents();
  const snap = sim.snapshot();
  const valid = anchorDistance >= 0.8 && anchorDistance <= 11;
  if (valid && !snap.rope) flag(row, 'valid rope rejected');
  if (!valid && snap.rope) flag(row, 'out-of-range rope accepted');
  if (!valid && !events.some((e) => e.type === 'ropeInvalid')) flag(row, 'no ropeInvalid event');
  for (let i = 0; i < 60; i++) {
    sim.step([]);
    if (!finite(sim.snapshot().player.position)) flag(row, 'non-finite');
  }
  return row;
}
