import type { LevelDef, SolidDef } from '../../sim';
import { metersToPixels as m } from '../../core';
import runtime from '../../../assets/art/kit-0017/runtime.json';
import { classifyTerrainEdges, type TerrainEdge, type TerrainEdgeSide } from './terrainEdges';
import { kit17AssetUrl } from './Kit17Assets';

export type KitVersion = '0016' | '0017';

/** Preserve the previous terrain art behind an explicit URL flag while 0017 is the default. */
export function resolveKitVersion(search: string): KitVersion {
  return new URLSearchParams(search).get('kit') === '0016' ? '0016' : '0017';
}

type CornerOrientation = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type Kit17Metadata = {
  role?: string;
  semantic?: string;
  orientation?: string;
  shapeRole?: string;
  interiorCropRatio?: number;
  cornerTopology?: 'convex' | 'concave';
  cornerOrientation?: CornerOrientation;
  datum?: {
    points?: readonly (readonly [number, number])[];
    segments?: readonly (readonly (readonly [number, number])[])[];
  };
  hazardDatum1x?: { type: string; points: readonly (readonly [number, number])[] };
};
type Kit17Asset = {
  name: string;
  metadata: Kit17Metadata;
};
const assets = runtime.objects as Kit17Asset[];
let images: Map<string, HTMLImageElement> | null = null;
let pending: Promise<void> | null = null;

/** Decode each terrain and water slice once, before a level scene is constructed. */
export function loadKit17(): Promise<void> {
  pending ??= Promise.all(
    assets
      .filter((asset) => !/^t(3[4-9]|4[0-2])-/.test(asset.name))
      .map(async (asset) => {
        const url = kit17AssetUrl(asset.name);
        const image = new Image();
        image.src = url;
        await image.decode();
        return [asset.name, image] as const;
      }),
  ).then((entries) => {
    images = new Map(entries);
  });
  return pending;
}

export interface Kit17Geometry {
  widthPx: number;
  heightPx: number;
  floating: boolean;
}

function byRole(role: string, orientation?: string, shapeRole?: string): Kit17Asset | undefined {
  const candidates = assets.filter((asset) => asset.metadata.role === role);
  return candidates.find(
    (asset) =>
      (!orientation || asset.metadata.orientation === orientation) &&
      (!shapeRole || asset.metadata.shapeRole === shapeRole),
  );
}

function semantic(role: string, orientation?: string): Kit17Asset | undefined {
  return assets.find(
    (asset) =>
      asset.metadata.semantic === role &&
      (!orientation || asset.metadata.orientation === orientation),
  );
}

/** Select stamps by edge side and the measured silhouette of the authored solid. */
export function selectKit17EdgeName(
  side: TerrainEdgeSide,
  geometry: Kit17Geometry = { widthPx: m(4), heightPx: m(1), floating: false },
  variation = 0,
): string | undefined {
  if (side === 'top' || side === 'slope') {
    const ratio = geometry.heightPx > 0 ? geometry.widthPx / geometry.heightPx : 0;
    const shapeRole =
      geometry.widthPx <= m(2.5)
        ? geometry.floating
          ? 'short-island'
          : 'wall-top-cap'
        : ratio >= 4.5
          ? 'bridge'
          : geometry.widthPx >= m(7)
            ? 'layered'
            : 'standard';
    const topCandidates = assets.filter(
      (candidate) =>
        candidate.metadata.semantic === 'top-edge' && candidate.metadata.orientation === 'top',
    );
    return (
      semantic(shapeRole, 'top')?.name ??
      (shapeRole === 'layered' ? semantic('ceiling-span', 'top')?.name : undefined) ??
      (shapeRole === 'standard'
        ? topCandidates[variation % Math.max(1, topCandidates.length)]?.name
        : undefined) ??
      byRole('ledge', undefined, shapeRole)?.name ??
      byRole('ledge')?.name
    );
  }
  if (side === 'bottom')
    return (
      semantic(
        geometry.widthPx <= m(2.5) && !geometry.floating
          ? 'wall-bottom-cap'
          : geometry.widthPx >= m(7)
            ? 'ceiling-span'
            : 'bottom-edge',
        'bottom',
      )?.name ??
      byRole('underside', 'bottom', geometry.widthPx >= m(7) ? 'layered' : undefined)?.name ??
      byRole('underside', 'bottom')?.name ??
      byRole('underside')?.name
    );
  if (geometry.widthPx <= m(1.25) && geometry.heightPx >= m(3))
    return semantic('wall-strip', 'vertical')?.name ?? byRole('wall-strip', 'vertical')?.name;
  return byRole('wall-strip', side)?.name;
}

/** The manifest maps all eight authored turn orientations to their canonical T-piece. */
export function selectKit17CornerName(
  orientation: CornerOrientation,
  convex: boolean,
): string | undefined {
  return assets.find(
    (asset) =>
      (asset.metadata.role === (convex ? 'convex-corner' : 'concave-corner') ||
        asset.metadata.cornerTopology === (convex ? 'convex' : 'concave')) &&
      asset.metadata.cornerTopology === (convex ? 'convex' : 'concave') &&
      asset.metadata.cornerOrientation === orientation,
  )?.name;
}

export interface Kit17EdgeSelection {
  readonly edge: TerrainEdge;
  readonly assetName: string;
}
export interface Kit17CornerSelection {
  readonly vertex: { readonly x: number; readonly y: number };
  readonly assetName: string;
}
export interface Kit17TopologySelection {
  readonly edges: readonly Kit17EdgeSelection[];
  readonly corners: readonly Kit17CornerSelection[];
  readonly brackets: readonly Kit17CornerSelection[];
  readonly floating: boolean;
  readonly bridge: boolean;
}

const vertexKey = (point: { x: number; y: number }): string =>
  `${String(Math.round(point.x * 1e7))},${String(Math.round(point.y * 1e7))}`;

function cornerFromEdges(
  vertex: { x: number; y: number },
  first: TerrainEdge,
  second: TerrainEdge,
  polygonDirection: number,
): { orientation: CornerOrientation; convex: boolean } | null {
  const away = (edge: TerrainEdge): { x: number; y: number } =>
    vertexKey(edge.a) === vertexKey(vertex)
      ? { x: edge.b.x - vertex.x, y: edge.b.y - vertex.y }
      : { x: edge.a.x - vertex.x, y: edge.a.y - vertex.y };
  const a = away(first);
  const b = away(second);
  const aSide = first.side;
  const bSide = second.side;
  const horizontal = [aSide, bSide].find((side) => side === 'top' || side === 'bottom');
  const vertical = [aSide, bSide].find((side) => side === 'left' || side === 'right');
  if (!horizontal || !vertical) return null;
  const incomingEdge = [first, second].find((edge) => vertexKey(edge.b) === vertexKey(vertex));
  const outgoingEdge = [first, second].find((edge) => vertexKey(edge.a) === vertexKey(vertex));
  if (!incomingEdge || !outgoingEdge) return null;
  const incoming = { x: vertex.x - incomingEdge.a.x, y: vertex.y - incomingEdge.a.y };
  const outgoing = { x: outgoingEdge.b.x - vertex.x, y: outgoingEdge.b.y - vertex.y };
  const convex = (incoming.x * outgoing.y - incoming.y * outgoing.x) * polygonDirection > 0;
  if (convex) {
    return {
      orientation: `${horizontal}-${vertical}` as CornerOrientation,
      convex,
    };
  }
  // At a recess, the two rays point into the missing quadrant of the solid.
  const x = a.x !== 0 ? a.x : b.x;
  const y = a.y !== 0 ? a.y : b.y;
  return {
    orientation: `${y < 0 ? 'top' : 'bottom'}-${x < 0 ? 'left' : 'right'}` as CornerOrientation,
    convex,
  };
}

/** Select exposed edge and turn assets directly from GMR-111 geometry classification. */
export function selectKit17Topology(level: LevelDef, solid: SolidDef): Kit17TopologySelection {
  const allEdges = classifyTerrainEdges(level, solid);
  return selectKit17TopologyFromEdges(solid, allEdges);
}

/** Allows LevelKit to pass its cached edges and the scene-wide exposed endpoint set. */
export function selectKit17TopologyFromEdges(
  solid: SolidDef,
  allEdges: readonly TerrainEdge[],
  globalExposedEdges: readonly TerrainEdge[] = allEdges.filter(
    (edge) => edge.contact === 'exposed',
  ),
): Kit17TopologySelection {
  const exposed = allEdges.filter((edge) => edge.contact === 'exposed');
  const widthPx = m(
    Math.max(...solid.points.map((point) => point.x)) -
      Math.min(...solid.points.map((point) => point.x)),
  );
  const heightPx = m(
    Math.max(...solid.points.map((point) => point.y)) -
      Math.min(...solid.points.map((point) => point.y)),
  );
  const floating = exposed.length === allEdges.length;
  const geometry = { widthPx, heightPx, floating };
  const edges = exposed.flatMap((edge) => {
    const variation = Math.floor((Math.abs(edge.a.x) + Math.abs(edge.a.y)) * 64) % 2;
    let assetName = selectKit17EdgeName(edge.side, geometry, variation);
    if (
      widthPx > m(2.5) &&
      (edge.side === 'top' || edge.side === 'slope') &&
      m(Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y)) <= m(2.5)
    ) {
      const endpointSet = new Set([vertexKey(edge.a), vertexKey(edge.b)]);
      const wallSide = exposed.find(
        (candidate) =>
          (candidate.side === 'left' || candidate.side === 'right') &&
          (endpointSet.has(vertexKey(candidate.a)) || endpointSet.has(vertexKey(candidate.b))),
      )?.side;
      if (wallSide) assetName = semantic('ledge-end', wallSide)?.name ?? assetName;
    }
    return assetName ? [{ edge, assetName }] : [];
  });
  const endpoints = new Map<string, { vertex: TerrainEdge['a']; edges: TerrainEdge[] }>();
  const localEndpoints = new Set<string>();
  for (const edge of exposed) {
    localEndpoints.add(vertexKey(edge.a));
    localEndpoints.add(vertexKey(edge.b));
  }
  for (const edge of globalExposedEdges) {
    for (const vertex of [edge.a, edge.b]) {
      if (!localEndpoints.has(vertexKey(vertex))) continue;
      const group = endpoints.get(vertexKey(vertex)) ?? { vertex, edges: [] };
      group.edges.push(edge);
      endpoints.set(vertexKey(vertex), group);
    }
  }
  const corners: Kit17CornerSelection[] = [];
  const brackets: Kit17CornerSelection[] = [];
  for (const { vertex, edges: meeting } of endpoints.values()) {
    const key = vertexKey(vertex);
    const localMeeting = exposed.filter(
      (edge) => vertexKey(edge.a) === key || vertexKey(edge.b) === key,
    );
    const touchesLocalContact = allEdges.some(
      (edge) =>
        edge.contact !== 'exposed' && (vertexKey(edge.a) === key || vertexKey(edge.b) === key),
    );
    const vertical = localMeeting.find((edge) => edge.side === 'left' || edge.side === 'right');
    if (touchesLocalContact && vertical && localMeeting.some((edge) => edge.side === 'top')) {
      const bracket =
        semantic('wall-bracket', vertical.side) ?? byRole('wall-bracket', vertical.side);
      if (bracket) brackets.push({ vertex, assetName: bracket.name });
    }
    if (meeting.length !== 2 || localMeeting.length !== 2) continue;
    const [first, second] = localMeeting;
    if (!first || !second) continue;
    const turn = cornerFromEdges(vertex, first, second, winding(solid));
    if (!turn) continue;
    const ceilingJoin =
      turn.convex && touchesLocalContact && meeting.some((edge) => edge.side === 'bottom')
        ? assets.find(
            (candidate) =>
              candidate.metadata.role === 'ceiling-join' &&
              candidate.metadata.cornerOrientation === turn.orientation,
          )?.name
        : undefined;
    const assetName = ceilingJoin ?? selectKit17CornerName(turn.orientation, turn.convex);
    if (assetName) corners.push({ vertex, assetName });
  }
  return {
    edges,
    corners,
    brackets,
    floating,
    bridge: floating && heightPx > 0 && widthPx / heightPx >= 4.5,
  };
}

function image(name: string): HTMLImageElement {
  const found = images?.get(name);
  if (!found) throw new Error(`Kit 0017 image was not loaded: ${name}`);
  return found;
}

function asset(name: string): Kit17Asset {
  const found = assets.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing kit 0017 runtime calibration: ${name}`);
  return found;
}

function pathSolid(c: CanvasRenderingContext2D, solid: SolidDef): void {
  c.beginPath();
  solid.points.forEach((point, index) => {
    if (index === 0) c.moveTo(m(point.x), m(point.y));
    else c.lineTo(m(point.x), m(point.y));
  });
  c.closePath();
}

function winding(solid: SolidDef): number {
  let area = 0;
  for (let i = 0; i < solid.points.length; i++) {
    const a = solid.points[i];
    const b = solid.points[(i + 1) % solid.points.length];
    if (a && b) area += a.x * b.y - a.y * b.x;
  }
  return area < 0 ? -1 : 1;
}

function drawEdgeAsset(
  c: CanvasRenderingContext2D,
  edge: TerrainEdge,
  solid: SolidDef,
  name: string,
): void {
  const sprite = image(name);
  const meta = asset(name).metadata;
  const datum = meta.datum;
  if (!datum?.points || datum.points.length < 2) return;
  const p0 = datum.points[0];
  const p1 = datum.points[1];
  if (!p0 || !p1) return;
  const horizontal = Math.abs(p1[1] - p0[1]) <= Math.abs(p1[0] - p0[0]);
  const dx = m(edge.b.x - edge.a.x);
  const dy = m(edge.b.y - edge.a.y);
  const length = Math.hypot(dx, dy);
  if (length <= 0) return;
  const tx = dx / length;
  const ty = dy / length;
  const direction = winding(solid);
  const ix = -ty * direction;
  const iy = tx * direction;
  const datumX = (p0[0] + p1[0]) / 2;
  const datumY = (p0[1] + p1[1]) / 2;
  const sourceLength = horizontal ? sprite.width : sprite.height;
  const margin = Math.min(8, Math.floor(sourceLength * 0.12));
  const usable = Math.max(1, sourceLength - margin * 2);
  const originX = m(edge.a.x);
  const originY = m(edge.a.y);
  c.save();
  if (horizontal) {
    const normalSign = meta.role === 'underside' ? -1 : 1;
    c.transform(
      tx,
      ty,
      ix * normalSign,
      iy * normalSign,
      originX - ix * normalSign * datumY,
      originY - iy * normalSign * datumY,
    );
    for (let offset = 0; offset < length; offset += usable) {
      const segment = Math.min(usable, length - offset);
      c.drawImage(sprite, margin, 0, segment, sprite.height, offset, 0, segment, sprite.height);
    }
  } else {
    const normalSign = meta.orientation === 'right' ? -1 : 1;
    c.transform(
      ix * normalSign,
      iy * normalSign,
      tx,
      ty,
      originX - ix * normalSign * datumX,
      originY - iy * normalSign * datumX,
    );
    for (let offset = 0; offset < length; offset += usable) {
      const segment = Math.min(usable, length - offset);
      c.drawImage(sprite, 0, margin, sprite.width, segment, 0, offset, sprite.width, segment);
    }
  }
  c.restore();
}

function drawCornerAsset(c: CanvasRenderingContext2D, selection: Kit17CornerSelection): void {
  const sprite = image(selection.assetName);
  const meta = asset(selection.assetName).metadata;
  const segments = meta.datum?.segments;
  let datum = meta.datum?.points?.[0];
  if (segments?.length && segments.length >= 2) {
    const first = segments[0] ?? [];
    const second = segments[1] ?? [];
    datum = first.find((point) =>
      second.some((other) => point[0] === other[0] && point[1] === other[1]),
    );
  }
  datum ??= segments?.[0]?.[0];
  if (!datum) return;
  const x = m(selection.vertex.x);
  const y = m(selection.vertex.y);
  c.save();
  c.drawImage(sprite, x - datum[0], y - datum[1]);
  c.restore();
}

/** Bake calibrated 0017 terrain stamps into the existing static world canvas tile. */
export function paintKit17Terrain(
  c: CanvasRenderingContext2D,
  level: LevelDef,
  solid: SolidDef,
  usedParts?: Set<string>,
  classifiedEdges?: readonly TerrainEdge[],
  globalExposedEdges?: readonly TerrainEdge[],
): Kit17TopologySelection {
  const selected = selectKit17TopologyFromEdges(
    solid,
    classifiedEdges ?? classifyTerrainEdges(level, solid),
    globalExposedEdges,
  );
  c.save();
  pathSolid(c, solid);
  c.clip();
  c.globalAlpha *= 0.7; // 30% lighter hatching/ink than the approved sheet A source.
  for (const selection of selected.edges) {
    drawEdgeAsset(c, selection.edge, solid, selection.assetName);
    usedParts?.add(selection.assetName);
  }
  for (const selection of [...selected.corners, ...selected.brackets]) {
    drawCornerAsset(c, selection);
    usedParts?.add(selection.assetName);
  }
  const concave = selected.corners.some(
    (corner) => asset(corner.assetName).metadata.cornerTopology === 'concave',
  );
  const interior =
    (concave ? semantic('interior-seam') : semantic('infill')) ?? byRole('interior-texture');
  if (interior) {
    const sprite = image(interior.name);
    const crop = Math.max(0.3, Math.min(0.4, interior.metadata.interiorCropRatio ?? 0.3));
    const sourceX = Math.round(sprite.width * crop);
    const sourceY = Math.round(sprite.height * crop);
    const sourceWidth = Math.max(1, sprite.width - sourceX * 2);
    const sourceHeight = Math.max(1, sprite.height - sourceY * 2);
    const centerX = m(solid.points.reduce((sum, point) => sum + point.x, 0) / solid.points.length);
    const centerY = m(solid.points.reduce((sum, point) => sum + point.y, 0) / solid.points.length);
    c.drawImage(
      sprite,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      centerX - sourceWidth / 2,
      centerY - sourceHeight / 2,
      sourceWidth,
      sourceHeight,
    );
    usedParts?.add(interior.name);
  }
  // A thin collision datum closes any crop gap without extending a foothold beyond authored geometry.
  c.strokeStyle = '#16161a';
  for (const { edge } of selected.edges) {
    const dx = edge.b.x - edge.a.x,
      dy = edge.b.y - edge.a.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const direction = winding(solid);
    const nx = (-dy / length) * direction,
      ny = (dx / length) * direction;
    for (const offset of [0.5, 2.2]) {
      c.lineWidth = offset < 1 ? 1.6 : 0.7;
      c.globalAlpha = offset < 1 ? 0.9 : 0.55;
      c.beginPath();
      c.moveTo(m(edge.a.x) + nx * offset, m(edge.a.y) + ny * offset);
      c.lineTo(m(edge.b.x) + nx * offset, m(edge.b.y) + ny * offset);
      c.stroke();
    }
  }
  c.restore();
  return selected;
}
