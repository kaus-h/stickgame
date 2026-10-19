/**
 * JSON.parse reviver for level files: gives every polygon solid (`points`, no `rect`) the `rect`
 * of its bounding box. Specs that locate a floor by its walkable top keep working when terrain is
 * authored as organic polygons, whose tops stay on the box's top edge.
 */
export function withRects(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const v = value as { points?: unknown; rect?: unknown };
  if (v.rect !== undefined || !Array.isArray(v.points)) return value;
  const pts = v.points as [number, number][];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { ...v, rect: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } };
}
