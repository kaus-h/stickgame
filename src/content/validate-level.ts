import type { Vec2 } from '../core';
import type { LevelDef, SolidDef } from '../sim';
import runtimeTuning from '../../content/tuning/runtime.json';
import { parseLevel } from './level';

export interface LevelValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
}

const RADIUS = 0.35;
const EPS = 1e-6;
interface Edge {
  a: Vec2;
  b: Vec2;
}
const edges = (points: readonly Vec2[]): Edge[] =>
  points.map((a, i) => ({ a, b: points[(i + 1) % points.length] as Vec2 }));
const cross = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function edgeDistance(p: Vec2, { a, b }: Edge): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Boundary counts as inside: decorative teeth may exactly touch their collision outline. */
function inside(p: Vec2, points: readonly Vec2[]): boolean {
  if (edges(points).some((edge) => edgeDistance(p, edge) < EPS)) return true;
  let result = false;
  for (const { a, b } of edges(points)) {
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

function crosses(a: Vec2, b: Vec2, edge: Edge): boolean {
  return (
    cross(a, b, edge.a) * cross(a, b, edge.b) < -EPS &&
    cross(edge.a, edge.b, a) * cross(edge.a, edge.b, b) < -EPS
  );
}

/** Closed intersection includes tangent corners and collinear wall edges: both block a shot. */
function intersects(a: Vec2, b: Vec2, edge: Edge): boolean {
  return (
    crosses(a, b, edge) ||
    edgeDistance(a, edge) < EPS ||
    edgeDistance(b, edge) < EPS ||
    edgeDistance(edge.a, { a, b }) < EPS ||
    edgeDistance(edge.b, { a, b }) < EPS
  );
}

function bodyBlocked(p: Vec2, solids: readonly SolidDef[]): boolean {
  return solids.some(
    (solid) =>
      inside(p, solid.points) ||
      edges(solid.points).some((edge) => edgeDistance(p, edge) < RADIUS - EPS),
  );
}

/** Minimum support-line width; representation-independent, including rotated walls/planks. */
function polygonWidth(points: readonly Vec2[]): number {
  let width = Infinity;
  for (const edge of edges(points)) {
    const length = distance(edge.a, edge.b);
    if (length < EPS) continue;
    const projections = points.map((p) => cross(edge.a, edge.b, p) / length);
    width = Math.min(width, Math.max(...projections) - Math.min(...projections));
  }
  return width;
}

function inBounds(p: Vec2, level: LevelDef): boolean {
  return (
    p.x >= level.bounds.minX &&
    p.x <= level.bounds.maxX &&
    p.y >= level.bounds.minY &&
    p.y <= level.bounds.maxY
  );
}

function point(raw: unknown): Vec2 | undefined {
  if (Array.isArray(raw) && typeof raw[0] === 'number' && typeof raw[1] === 'number') {
    return { x: raw[0], y: raw[1] };
  }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'x' in raw &&
    'y' in raw &&
    typeof raw.x === 'number' &&
    typeof raw.y === 'number'
  )
    return { x: raw.x, y: raw.y };
  return undefined;
}

function records(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

/**
 * Authoring checks, separate from schema/compilation. v1 keeps its original gameplay geometry:
 * legacy guideline violations are warnings; v2 failures are errors. Untagged close geometry is
 * advisory because a geometric gap may deliberately be an impassable crevice, not a passage.
 * Exit checks establish geometric feasibility only, never prove a traversable gameplay route.
 */
export function validateLevelAuthoring(
  json: unknown,
  selectRadius = runtimeTuning.sim.rope.selectRadius,
): LevelValidationIssue[] {
  const issues: LevelValidationIssue[] = [];
  let level: LevelDef;
  try {
    level = parseLevel(json);
  } catch (error) {
    return [
      {
        severity: 'error',
        path: 'level',
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  const raw = json as Record<string, unknown>;
  const legacy = raw.version === 1;
  const issue = (path: string, message: string, advisory = false, structural = false): void => {
    if (issues.some((existing) => existing.path === path && existing.message === message)) return;
    issues.push({
      severity: advisory || (legacy && !structural) ? 'warning' : 'error',
      path,
      message,
    });
  };
  if (level.bounds.minX >= level.bounds.maxX || level.bounds.minY >= level.bounds.maxY) {
    issues.push({
      severity: 'error',
      path: 'level.bounds',
      message: 'min bounds must precede max bounds',
    });
  }
  if (!inBounds(level.spawn, level))
    issue('level.spawn', 'spawn must be inside level bounds', false, true);
  if (bodyBlocked(level.spawn, level.solids))
    issue('level.spawn', 'player circle overlaps collision at spawn', false, true);
  const resting = level.solids.some(
    (solid) =>
      solid.kind === 'solid' &&
      edges(solid.points).some(
        ({ a, b }) =>
          Math.abs(a.y - b.y) < EPS &&
          level.spawn.x >= Math.min(a.x, b.x) &&
          level.spawn.x <= Math.max(a.x, b.x) &&
          Math.abs(a.y - level.spawn.y - RADIUS) < 0.002,
      ),
  );
  if (!resting) issue('level.spawn', 'spawn must rest on a safe floor with player radius 0.35 m');
  if (level.spawn.y + RADIUS >= level.killY)
    issue('level.killY', 'kill plane intersects spawn', false, true);

  for (const [index, target] of (level.targets ?? []).entries()) {
    const path = `level.targets[${String(index)}]`;
    const to = target.path?.to ?? target.position;
    const min = {
      x: Math.min(target.position.x, to.x) - target.radius,
      y: Math.min(target.position.y, to.y) - target.radius,
    };
    const max = {
      x: Math.max(target.position.x, to.x) + target.radius,
      y: Math.max(target.position.y, to.y) + target.radius,
    };
    if (!inBounds(min, level) || !inBounds(max, level))
      issue(`${path}.path`, 'entire target body and path must remain inside bounds', false, true);
    if (max.y >= level.killY)
      issue(path, 'target body and path must remain above the kill plane', false, true);
  }

  for (const [index, enemy] of (level.enemies ?? []).entries()) {
    const path = `level.enemies[${String(index)}]`;
    const to = enemy.path?.to ?? enemy.position;
    const left = Math.min(enemy.position.x, to.x) - enemy.size.x / 2;
    const right = Math.max(enemy.position.x, to.x) + enemy.size.x / 2;
    const top = enemy.position.y - enemy.size.y / 2;
    const bottom = enemy.position.y + enemy.size.y / 2;
    if (!inBounds({ x: left, y: top }, level) || !inBounds({ x: right, y: bottom }, level))
      issue(`${path}.path`, 'entire patroller body and path must remain inside bounds');
    if (bottom >= level.killY) issue(path, 'patroller body must remain above the kill plane');
    const supports = level.solids
      .filter((solid) => solid.kind === 'solid')
      .flatMap((solid) =>
        edges(solid.points)
          .filter(({ a, b }) => Math.abs(a.y - b.y) < EPS && Math.abs(a.y - bottom) < EPS)
          .map(({ a, b }) => ({ left: Math.min(a.x, b.x), right: Math.max(a.x, b.x) })),
      )
      .sort((a, b) => a.left - b.left);
    let supportedTo = left;
    for (const support of supports) {
      if (support.left > supportedTo + EPS) break;
      supportedTo = Math.max(supportedTo, support.right);
    }
    if (supportedTo < right - EPS)
      issue(
        `${path}.path`,
        'entire patrol footprint needs continuous safe horizontal floor support',
      );
    // Horizontal paths sweep a rectangle. Reject interior collision exactly, including narrow
    // obstacles between sample positions; floor/ceiling tangency itself is not overlap.
    const sweptCorners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
    const interior = (p: Vec2): boolean =>
      p.x > left + EPS && p.x < right - EPS && p.y > top + EPS && p.y < bottom - EPS;
    if (
      level.solids.some(
        (solid) =>
          solid.points.some(interior) ||
          sweptCorners.some(
            (p) =>
              inside(p, solid.points) &&
              !edges(solid.points).some((edge) => edgeDistance(p, edge) < EPS),
          ) ||
          edges(sweptCorners).some(({ a, b }) =>
            edges(solid.points).some((edge) => crosses(a, b, edge)),
          ) ||
          inside({ x: (left + right) / 2, y: (top + bottom) / 2 }, solid.points),
      )
    )
      issue(path, 'patroller swept body overlaps authored collision');
    // Spawn is checked against the phase-zero spawn position of every authored patrol path.
    // For safety use the full footprint: a reset must never start on an approaching enemy.
    const nearest = {
      x: Math.max(left, Math.min(right, level.spawn.x)),
      y: Math.max(top, Math.min(bottom, level.spawn.y)),
    };
    if (distance(level.spawn, nearest) < RADIUS + EPS)
      issue('level.spawn', `player circle overlaps patrol footprint of ${enemy.id}`);
    if (
      level.solids.some(
        (solid) =>
          solid.kind === 'hazard' &&
          edges(solid.points).some(
            ({ a, b }) =>
              Math.abs(a.y - bottom) < EPS &&
              Math.abs(b.y - bottom) < EPS &&
              Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right),
          ),
      )
    )
      issue(`${path}.path`, 'patrol floor must be safe rather than hazard collision');
  }

  const rawSolids = records(raw.solids);
  level.solids.forEach((solid, i) => {
    const path = `level.solids[${String(i)}]`;
    const polygonEdges = edges(solid.points);
    const area = polygonEdges.reduce((sum, { a, b }) => sum + a.x * b.y - b.x * a.y, 0);
    if (Math.abs(area) < EPS || polygonEdges.some(({ a, b }) => distance(a, b) < EPS)) {
      issues.push({
        severity: 'error',
        path: `${path}.points`,
        message: 'collision polygon must have nonzero area and no zero-length edges',
      });
    }
    if (
      polygonEdges.some((edge, j) =>
        polygonEdges.slice(j + 1).some((other) => crosses(edge.a, edge.b, other)),
      )
    ) {
      issues.push({
        severity: 'error',
        path: `${path}.points`,
        message: 'collision polygon must not self-intersect',
      });
    }
    if (solid.kind === 'solid' && polygonWidth(solid.points) < 0.1 - EPS) {
      issue(
        `${path}.${rawSolids[i]?.rect ? 'rect' : 'points'}`,
        'author walls/floors at least 0.1 m thick (0.25 m recommended for readable walls)',
      );
    }
    const visual = Array.isArray(rawSolids[i]?.visualPoints)
      ? (rawSolids[i].visualPoints as unknown[])
          .map(point)
          .filter((p): p is Vec2 => p !== undefined)
      : [];
    visual.forEach((p, j) => {
      if (!inside(p, solid.points))
        issue(
          `${path}.visualPoints[${String(j)}]`,
          'decorative hazard teeth must stay inside their own collision polygon',
        );
    });
    if (
      visual.length >= 3 &&
      edges(visual).some(
        ({ a, b }) =>
          polygonEdges.some((edge) => crosses(a, b, edge)) ||
          !inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, solid.points),
      )
    ) {
      issue(
        `${path}.visualPoints`,
        'decorative hazard edges must stay inside collision, including concave boundaries',
      );
    }
  });

  // Only parallel opposing edges with a body-width overlap constitute a plausible passage.
  for (let i = 0; i < level.solids.length; i++) {
    const first = level.solids[i] as SolidDef;
    for (let j = i + 1; j < level.solids.length; j++) {
      const second = level.solids[j] as SolidDef;
      let narrowest = Infinity;
      for (const a of edges(first.points))
        for (const b of edges(second.points)) {
          const length = distance(a.a, a.b);
          if (length < EPS || Math.abs(cross(a.a, a.b, b.b) - cross(a.a, a.b, b.a)) > EPS) continue;
          const project = (p: Vec2): number =>
            ((p.x - a.a.x) * (a.b.x - a.a.x) + (p.y - a.a.y) * (a.b.y - a.a.y)) / length;
          const overlapMin = Math.max(0, Math.min(project(b.a), project(b.b)));
          const overlapMax = Math.min(length, Math.max(project(b.a), project(b.b)));
          const overlap = overlapMax - overlapMin;
          const gap = Math.abs(cross(a.a, a.b, b.a)) / length;
          if (overlap < 0.7 || gap < EPS || gap >= 0.8 - EPS) continue;
          const along = (overlapMin + overlapMax) / 2;
          const signedGap = cross(a.a, a.b, b.a) / length;
          const dx = (a.b.x - a.a.x) / length;
          const dy = (a.b.y - a.a.y) / length;
          const mid = {
            x: a.a.x + along * dx - (signedGap * dy) / 2,
            y: a.a.y + along * dy + (signedGap * dx) / 2,
          };
          if (!level.solids.some((solid) => inside(mid, solid.points)))
            narrowest = Math.min(narrowest, gap);
        }
      if (Number.isFinite(narrowest))
        issue(
          `level.solids[${String(j)}]`,
          `gap to ${first.id} is ${narrowest.toFixed(3)} m; intended passages need >=0.72 m physical clearance, >=0.8 m recommended; tag intended tunnels`,
          true,
        );
    }
  }

  const rawAnchors = records(raw.anchors);
  for (let i = 0; i < level.anchors.length; i++) {
    const first = level.anchors[i];
    if (!first) continue;
    for (let j = i + 1; j < level.anchors.length; j++) {
      const second = level.anchors[j];
      if (!second) continue;
      const separation = distance(first.position, second.position);
      const combinedRadius = first.radius + second.radius + 2 * selectRadius;
      if (separation < combinedRadius - EPS)
        issue(
          `level.anchors[${String(j)}].position`,
          `PC snap zone overlaps ${first.id}: centres are ${separation.toFixed(3)} m apart; radius + rope.selectRadius (${selectRadius.toFixed(3)} m) needs >=${combinedRadius.toFixed(3)} m separation; review targeting ambiguity`,
          true,
        );
    }
  }
  level.anchors.forEach((anchor, i) => {
    const takeoff = point(rawAnchors[i]?.requiredFrom);
    if (!takeoff) return;
    const path = `level.anchors[${String(i)}].requiredFrom`;
    if (!inBounds(takeoff, level) || bodyBlocked(takeoff, level.solids))
      issue(path, 'required take-off point must be inside bounds and clear of collision');
    // Endpoints bound linear path reach/height. Interior samples screen moving occlusion too.
    const motion = anchor.path;
    const positions = motion
      ? Array.from({ length: 17 }, (_, sample) => ({
          x: anchor.position.x + ((motion.to.x - anchor.position.x) * sample) / 16,
          y: anchor.position.y + ((motion.to.y - anchor.position.y) * sample) / 16,
        }))
      : [anchor.position];
    for (const position of positions) {
      const range = distance(takeoff, position);
      if (range - anchor.radius > 11 + EPS || range + anchor.radius < 0.8 - EPS)
        issue(
          path,
          'required anchor impact must be within 0.8–11 m rope range throughout its path',
        );
      else if (range > 11 + EPS || range < 0.8 - EPS)
        issue(
          path,
          'required anchor centre is outside 0.8–11 m rope range despite legacy disc-edge reach; migrate requiredFrom for centre attachment',
          true,
        );
      if (takeoff.y - position.y > 7 + EPS)
        issue(path, 'required anchor exceeds 7 m above take-off; reframe the route');
      if (!inBounds(position, level))
        issue(path, 'required anchor path endpoint must remain inside camera bounds');
      if (
        position.x < level.bounds.minX + 1 ||
        position.x > level.bounds.maxX - 1 ||
        position.y < level.bounds.minY + 1 ||
        position.y > level.bounds.maxY - 1
      ) {
        issue(
          path,
          'required anchor needs 1 m camera bounds clearance on every side to avoid clamped-camera visibility loss',
        );
      }
      const scale = range > EPS ? Math.max(0, range - anchor.radius) / range : 0;
      const legacyImpact = {
        x: takeoff.x + (position.x - takeoff.x) * scale,
        y: takeoff.y + (position.y - takeoff.y) * scale,
      };
      const blocked = (impact: Vec2): boolean =>
        level.solids.some(
          (solid) =>
            inside(impact, solid.points) ||
            edges(solid.points).some((edge) => intersects(takeoff, impact, edge)),
        );
      if (blocked(legacyImpact)) {
        issue(path, 'required anchor has blocked line of sight from take-off');
      } else if (blocked(position)) {
        issue(
          path,
          'required anchor centre has blocked line of sight despite legacy disc-edge visibility; migrate requiredFrom for centre attachment',
          true,
        );
      }
    }
  });

  records(raw.tunnels).forEach((tunnel, i) => {
    const region = tunnel.region as Record<string, unknown>;
    const min = point(region.min);
    const max = point(region.max);
    if (!min || !max) return;
    const path = `level.tunnels[${String(i)}].region`;
    const width = Math.min(max.x - min.x, max.y - min.y);
    if (width < 0.72 - EPS) issue(path, 'intended tunnel needs at least 0.72 m clear width');
    else if (width < 0.8 - EPS)
      issue(
        path,
        'intended tunnel needs at least 0.8 m clear width per collision policy; add 0.1 m headroom for running',
      );
    if (!inBounds(min, level) || !inBounds(max, level))
      issue(path, 'tunnel region must remain inside bounds');
    const corners = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
    const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
    const inInterior = (p: Vec2): boolean =>
      p.x > min.x + EPS && p.x < max.x - EPS && p.y > min.y + EPS && p.y < max.y - EPS;
    if (
      level.solids.some(
        (solid) =>
          inside(center, solid.points) ||
          solid.points.some(inInterior) ||
          edges(solid.points).some(({ a, b }) =>
            inInterior({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
          ) ||
          edges(corners).some(({ a, b }) =>
            edges(solid.points).some((edge) => crosses(a, b, edge)),
          ),
      )
    ) {
      issue(path, 'declared clear tunnel interior intersects collision');
    }
  });

  for (const key of ['chambers', 'cameraHints', 'tunnels']) {
    records(raw[key]).forEach((item, i) => {
      const region = item.region as Record<string, unknown>;
      const min = point(region.min);
      const max = point(region.max);
      if (!min || !max) return;
      const path = `level.${key}[${String(i)}].region`;
      if (min.x >= max.x || min.y >= max.y) issue(path, 'region min must precede max', false, true);
      if (!inBounds(min, level) || !inBounds(max, level))
        issue(path, 'region must remain inside bounds', false, true);
      const focus = point(item.focus);
      if (focus && !inBounds(focus, level))
        issue(
          `level.${key}[${String(i)}].focus`,
          'camera focus must remain inside bounds',
          false,
          true,
        );
    });
  }
  records(raw.checkpoints).forEach((checkpoint, i) => {
    const position = point(checkpoint.position);
    if (position && (!inBounds(position, level) || bodyBlocked(position, level.solids))) {
      issue(
        `level.checkpoints[${String(i)}].position`,
        'checkpoint must be inside bounds and clear of collision',
        false,
        true,
      );
    }
  });

  if (level.exit) {
    const { min, max } = level.exit;
    if (min.x >= max.x || min.y >= max.y)
      issue('level.exit', 'exit min must precede max', false, true);
    else {
      if (!inBounds(min, level) || !inBounds(max, level))
        issue('level.exit', 'exit must remain inside level bounds', false, true);
      if (min.y >= level.killY) issue('level.exit', 'exit lies below kill plane', false, true);
      // A bounded 9×9 scan is a feasibility screen, not a route solver.
      let clear = false;
      for (let x = 0; x <= 8; x++)
        for (let y = 0; y <= 8; y++) {
          const p = { x: min.x + ((max.x - min.x) * x) / 8, y: min.y + ((max.y - min.y) * y) / 8 };
          if (p.y + RADIUS < level.killY && !bodyBlocked(p, level.solids)) clear = true;
        }
      if (!clear)
        issue(
          'level.exit',
          'exit has no sampled collision-clear player position; bounding feasibility fails',
        );
      if ('entry' in level.exit) {
        const { entry } = level.exit;
        const horizontal = entry.side === 'top' || entry.side === 'bottom';
        const aperture = horizontal ? max.x - min.x : max.y - min.y;
        if (aperture < 0.8 - EPS)
          issue('level.exit.entry', 'exit opening needs at least 0.8 m clear aperture');
        const low = Math.max(entry.alignment.min, RADIUS / aperture);
        const high = Math.min(entry.alignment.max, 1 - RADIUS / aperture);
        if (low > high + EPS)
          issue(
            'level.exit.entry.alignment',
            'alignment window cannot fit the player circle inside opening',
          );
        else {
          // Check a short swept circle across the mouth, including between sampled centers.
          // This establishes ingress feasibility, not a gameplay route or speed proof.
          const normal = {
            x: entry.side === 'left' ? 1 : entry.side === 'right' ? -1 : 0,
            y: entry.side === 'top' ? 1 : entry.side === 'bottom' ? -1 : 0,
          };
          let ingress = false;
          for (let sample = 0; sample <= 128; sample++) {
            const alignment = low + ((high - low) * sample) / 128;
            const center = {
              x: horizontal ? min.x + alignment * aperture : entry.side === 'left' ? min.x : max.x,
              y: horizontal ? (entry.side === 'top' ? min.y : max.y) : min.y + alignment * aperture,
            };
            const a = { x: center.x - normal.x * RADIUS, y: center.y - normal.y * RADIUS };
            const b = { x: center.x + normal.x * RADIUS, y: center.y + normal.y * RADIUS };
            if (
              inBounds(a, level) &&
              inBounds(b, level) &&
              center.y + RADIUS < level.killY &&
              !bodyBlocked(a, level.solids) &&
              !bodyBlocked(b, level.solids) &&
              !level.solids.some((solid) =>
                edges(solid.points).some(
                  (edge) =>
                    intersects(a, b, edge) ||
                    edgeDistance(edge.a, { a, b }) < RADIUS - EPS ||
                    edgeDistance(edge.b, { a, b }) < RADIUS - EPS,
                ),
              )
            )
              ingress = true;
          }
          if (!ingress)
            issue(
              'level.exit.entry',
              'authored alignment has no sampled collision-clear ingress across opening',
            );
        }
        if (
          level.spawn.x >= min.x &&
          level.spawn.x <= max.x &&
          level.spawn.y >= min.y &&
          level.spawn.y <= max.y
        )
          issue('level.spawn', 'spawn must start outside the authored exit compartment');
      }
    }
  }
  return issues;
}
