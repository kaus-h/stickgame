import { dcos, dlen, dsin, SIM_DT, vec2 } from '../../core';
import type { PhysicsAdapter, Segment } from '../../physics';

const solid = (ax: number, ay: number, bx: number, by: number): Segment => ({
  a: vec2(ax, ay),
  b: vec2(bx, by),
  kind: 'solid',
});

/**
 * A fixed 20-second scenario mixing free flight, landings, slides, rope attach/release and a
 * moving pivot. Same build + same inputs must give the same digest on every browser (GMR-29).
 */
export function runDriftScenario(world: PhysicsAdapter): { digest: string; state: number[] } {
  world.setGravity(vec2(0, 25));
  world.setGeometry([
    solid(-20, 8, 20, 8),
    solid(6, 8, 12, 3),
    solid(-20, -10, -20, 8),
    solid(20, -10, 20, 8),
  ]);
  const body = world.createBody({ position: vec2(-6, 0), velocity: vec2(9, -6), radius: 0.3 });
  const pivot = world.createKinematicAnchor(vec2(0, -4));
  let rope = -1;
  for (let tick = 0; tick < 1200; tick++) {
    const t = tick * SIM_DT;
    world.moveKinematicAnchor(pivot, vec2(dsin(t) * 3, -4), vec2(dcos(t) * 3, 0));
    if (tick % 240 === 30) {
      const p = world.bodyState(body).position;
      const a = world.anchorPosition(pivot);
      rope = world.attachRope(
        body,
        { kind: 'kinematic', anchor: pivot, offset: vec2(0, 0) },
        dlen(p.x - a.x, p.y - a.y),
      );
    }
    if (tick % 240 === 150 && rope >= 0) {
      world.detachRope(rope);
      rope = -1;
    }
    world.step(SIM_DT, 4);
  }
  const s = world.bodyState(body);
  const state = [s.position.x, s.position.y, s.velocity.x, s.velocity.y];
  return { digest: state.map((v) => v.toString()).join('|'), state };
}
