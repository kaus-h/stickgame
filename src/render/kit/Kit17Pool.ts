import type { LevelDef, SolidDef } from '../../sim';
import { metersToPixels as m } from '../../core';
import { kit17AssetUrl } from './Kit17Assets';

type PoolName =
  | 't34-pool-surface-span'
  | 't35-pool-left-wall-join'
  | 't36-pool-right-wall-join'
  | 't37-pool-inner-left-corner'
  | 't38-pool-inner-right-corner'
  | 't39-pool-depth-fill';
type PoolAsset = { name: PoolName };
type Selection = {
  surface: PoolAsset;
  depth: PoolAsset;
  left?: PoolAsset;
  right?: PoolAsset;
  leftCorner?: PoolAsset;
  rightCorner?: PoolAsset;
};
type Prepared = { canvas: HTMLCanvasElement; redY: number; bankWidth: number };
const names: readonly PoolName[] = [
  't34-pool-surface-span',
  't35-pool-left-wall-join',
  't36-pool-right-wall-join',
  't37-pool-inner-left-corner',
  't38-pool-inner-right-corner',
  't39-pool-depth-fill',
];
const assets: PoolAsset[] = names.map((name) => ({ name }));
let prepared: Map<PoolName, Prepared> | null = null;
let pending: Promise<void> | null = null;
const EPS = 1e-5;

/** Decode and preprocess only pool pieces. Red meniscus is retained; sheet-B stone is stripped. */
export function loadKit17Pool(): Promise<void> {
  pending ??= Promise.all(
    assets.map(async (asset) => {
      const url = kit17AssetUrl(asset.name);
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D context unavailable for kit 0017 pool');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let redY = canvas.height,
        lastRedY = -1,
        minX = canvas.width,
        maxX = -1;
      const redByRow = new Uint16Array(canvas.height);
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const red =
            (pixels.data[i + 3] ?? 0) > 0 &&
            (pixels.data[i] ?? 0) > (pixels.data[i + 1] ?? 0) * 1.5 &&
            (pixels.data[i] ?? 0) > (pixels.data[i + 2] ?? 0) * 1.5;
          if (red) {
            redByRow[y] = (redByRow[y] ?? 0) + 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
          if (
            (asset.name !== 't39-pool-depth-fill' && !red) ||
            (asset.name === 't39-pool-depth-fill' && red)
          )
            pixels.data[i + 3] = 0;
        }
      const coverageThreshold = Math.max(2, Math.floor(canvas.width * 0.2));
      for (let y = 0; y < redByRow.length; y++)
        if ((redByRow[y] ?? 0) >= coverageThreshold) {
          if (redY === canvas.height) redY = y;
          lastRedY = y;
        }
      if (redY === canvas.height) redY = redByRow.findIndex((count) => count > 0);
      if (redY < 0) redY = 0;
      ctx.putImageData(pixels, 0, 0);
      let output = canvas;
      if (asset.name === 't39-pool-depth-fill') {
        const cropY = Math.min(canvas.height - 1, Math.max(redY, lastRedY) + 8);
        const cropped = document.createElement('canvas');
        cropped.width = canvas.width;
        cropped.height = Math.max(1, canvas.height - cropY);
        cropped
          .getContext('2d')
          ?.drawImage(
            canvas,
            0,
            cropY,
            canvas.width,
            cropped.height,
            0,
            0,
            canvas.width,
            cropped.height,
          );
        output = cropped;
      }
      // bankWidth records the source bank's bounding extent for calibration/debug; rendered joins are red-only.
      const bankWidth = maxX >= minX ? Math.min(minX, canvas.width - 1 - maxX) : 0;
      return [asset.name, { canvas: output, redY, bankWidth }] as const;
    }),
  ).then((entries) => {
    prepared = new Map(entries);
  });
  return pending;
}

function asset(name: PoolName): PoolAsset {
  const value = assets.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`Missing kit 0017 runtime pool metadata: ${name}`);
  return value;
}
function bounds(solid: SolidDef) {
  return {
    minX: Math.min(...solid.points.map((p) => p.x)),
    maxX: Math.max(...solid.points.map((p) => p.x)),
    minY: Math.min(...solid.points.map((p) => p.y)),
    maxY: Math.max(...solid.points.map((p) => p.y)),
  };
}
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}
function wallNeighbor(hazard: SolidDef, candidate: SolidDef, side: 'left' | 'right'): boolean {
  if (candidate.kind !== 'solid') return false;
  const h = bounds(hazard),
    b = bounds(candidate);
  const edgeX = side === 'left' ? h.minX : h.maxX;
  if (side === 'left' ? b.maxX > edgeX + EPS : b.minX < edgeX - EPS) return false;
  return candidate.points.some((a, i) => {
    const next = candidate.points[(i + 1) % candidate.points.length];
    return (
      !!next &&
      near(a.x, edgeX) &&
      near(next.x, edgeX) &&
      Math.min(h.maxY, Math.max(a.y, next.y)) - Math.max(h.minY, Math.min(a.y, next.y)) > EPS
    );
  });
}
function topCornerNeighbor(hazard: SolidDef, candidate: SolidDef, side: 'left' | 'right'): boolean {
  if (candidate.kind !== 'solid' || !wallNeighbor(hazard, candidate, side)) return false;
  const h = bounds(hazard);
  const x = side === 'left' ? h.minX : h.maxX;
  return candidate.points.some((a, i) => {
    const next = candidate.points[(i + 1) % candidate.points.length];
    return (
      !!next &&
      near(a.x, x) &&
      near(next.x, x) &&
      Math.max(a.y, next.y) > h.minY + EPS &&
      Math.min(a.y, next.y) < h.maxY - EPS
    );
  });
}

/** Pure adjacent-bank selection for geometry tests and renderer use. */
export function selectKit17PoolParts(level: LevelDef, hazard: SolidDef): Selection {
  const leftBank = level.solids.some(
    (candidate) => candidate.id !== hazard.id && wallNeighbor(hazard, candidate, 'left'),
  );
  const rightBank = level.solids.some(
    (candidate) => candidate.id !== hazard.id && wallNeighbor(hazard, candidate, 'right'),
  );
  const leftCorner = level.solids.some(
    (candidate) => candidate.id !== hazard.id && topCornerNeighbor(hazard, candidate, 'left'),
  );
  const rightCorner = level.solids.some(
    (candidate) => candidate.id !== hazard.id && topCornerNeighbor(hazard, candidate, 'right'),
  );
  return {
    surface: asset('t34-pool-surface-span'),
    depth: asset('t39-pool-depth-fill'),
    ...(leftBank ? { left: asset('t35-pool-left-wall-join') } : {}),
    ...(rightBank ? { right: asset('t36-pool-right-wall-join') } : {}),
    ...(leftCorner ? { leftCorner: asset('t37-pool-inner-left-corner') } : {}),
    ...(rightCorner ? { rightCorner: asset('t38-pool-inner-right-corner') } : {}),
  };
}

function polygonPath(c: CanvasRenderingContext2D, solid: SolidDef): void {
  c.beginPath();
  solid.points.forEach((p, i) => {
    if (i) c.lineTo(m(p.x), m(p.y));
    else c.moveTo(m(p.x), m(p.y));
  });
  c.closePath();
}
function drawDepth(
  c: CanvasRenderingContext2D,
  part: Prepared,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const tileW = part.canvas.width;
  if (!tileW || height <= 0) return;
  let column = 0;
  for (let px = x; px < x + width; px += tileW, column++) {
    const destW = Math.min(tileW, x + width - px);
    if (column % 2 === 0)
      c.drawImage(part.canvas, 0, 0, destW, part.canvas.height, px, y, destW, height);
    else {
      c.save();
      c.translate(px * 2 + destW, 0);
      c.scale(-1, 1);
      c.drawImage(part.canvas, 0, 0, destW, part.canvas.height, px, y, destW, height);
      c.restore();
    }
  }
}

/** Paint water visuals strictly inside the authored hazard polygon; no physics is added. */
export function paintKit17Pool(
  c: CanvasRenderingContext2D,
  level: LevelDef,
  solid: SolidDef,
  usedParts: Set<string>,
): void {
  if (solid.kind !== 'hazard' || !prepared) return;
  const selected = selectKit17PoolParts(level, solid),
    b = bounds(solid);
  c.save();
  polygonPath(c, solid);
  c.clip();
  const depth = prepared.get(selected.depth.name),
    surface = prepared.get(selected.surface.name);
  if (!depth || !surface) {
    c.restore();
    return;
  }
  const x = m(b.minX),
    y = m(b.minY),
    width = m(b.maxX - b.minX),
    height = m(b.maxY - b.minY);
  const depthInset = Math.min(8, height);
  drawDepth(c, depth, x, y + depthInset, width, height - depthInset);
  usedParts.add(selected.depth.name);
  // Tile the red-only span on the hazard's upper collision boundary, using its measured redline.
  const redline = surface.redY;
  let surfaceColumn = 0;
  for (let px = x; px < x + width; px += surface.canvas.width, surfaceColumn++) {
    const sourceWidth = Math.min(surface.canvas.width, x + width - px);
    if (surfaceColumn % 2 === 1) {
      c.save();
      c.translate(px * 2 + sourceWidth, 0);
      c.scale(-1, 1);
      c.drawImage(
        surface.canvas,
        0,
        0,
        sourceWidth,
        surface.canvas.height,
        px,
        y - redline,
        sourceWidth,
        surface.canvas.height,
      );
      c.restore();
    } else
      c.drawImage(
        surface.canvas,
        0,
        0,
        sourceWidth,
        surface.canvas.height,
        px,
        y - redline,
        sourceWidth,
        surface.canvas.height,
      );
  }
  usedParts.add(selected.surface.name);
  for (const [side, name] of [
    ['left', selected.left?.name],
    ['right', selected.right?.name],
  ] as const) {
    if (!name) continue;
    const part = prepared.get(name);
    if (!part) continue;
    const px = side === 'left' ? x : x + width - part.canvas.width;
    c.drawImage(part.canvas, px, y - part.redY);
    usedParts.add(name);
  }
  for (const [side, name] of [
    ['left', selected.leftCorner?.name],
    ['right', selected.rightCorner?.name],
  ] as const) {
    if (!name) continue;
    const part = prepared.get(name);
    if (!part) continue;
    const px = side === 'left' ? x : x + width - part.canvas.width;
    c.drawImage(part.canvas, px, y - part.redY);
    usedParts.add(name);
  }
  c.restore();
}
