import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core';
import type { LevelDef, SolidDef } from '../../src/sim';
import { classifyTerrainEdges } from '../../src/render/kit/terrainEdges';

const rectangle = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: SolidDef['kind'] = 'solid',
): SolidDef => ({
  id,
  kind,
  // Clockwise in the game's screen-coordinate system.
  points: [vec2(x, y), vec2(x + width, y), vec2(x + width, y + height), vec2(x, y + height)],
});

const makeLevel = (
  solids: readonly SolidDef[],
  bounds = { minX: -10, minY: -10, maxX: 20, maxY: 20 },
): LevelDef => ({
  id: 'edge-test',
  name: 'edge test',
  spawn: vec2(1, 1),
  bounds,
  killY: bounds.maxY + 1,
  solids,
  anchors: [],
});

const segmentsOn = (edges: ReturnType<typeof classifyTerrainEdges>, side: string) =>
  edges.filter((edge) => edge.side === side);

describe('terrain edge classification', () => {
  it('marks the shared edge of adjacent rectangles as solid contact', () => {
    const left = rectangle('left', 0, 0, 4, 4);
    const right = rectangle('right', 4, 0, 3, 4);
    const shared = classifyTerrainEdges(makeLevel([left, right]), left).filter(
      (edge) => edge.side === 'right',
    );

    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ a: vec2(4, 0), b: vec2(4, 4), contact: 'solid' });
  });

  it('splits a partial T-join at both contact endpoints', () => {
    const base = rectangle('base', 0, 0, 4, 4);
    const tee = rectangle('tee', 4, 1, 2, 2);
    const rightEdge = segmentsOn(classifyTerrainEdges(makeLevel([base, tee]), base), 'right');

    expect(rightEdge.map(({ a, b, contact }) => [a.y, b.y, contact])).toEqual([
      [0, 1, 'exposed'],
      [1, 3, 'solid'],
      [3, 4, 'exposed'],
    ]);
  });

  it('marks the portion of an overlapped edge covered from its outside as internal', () => {
    const base = rectangle('base', 0, 0, 4, 4);
    const overlap = rectangle('overlap', 3, 1, 2, 2);
    const rightEdge = segmentsOn(classifyTerrainEdges(makeLevel([base, overlap]), base), 'right');

    expect(rightEdge.map(({ a, b, contact }) => [a.y, b.y, contact])).toEqual([
      [0, 1, 'exposed'],
      [1, 3, 'solid'],
      [3, 4, 'exposed'],
    ]);
  });

  it('keeps short same-side coincident edges exposed to the outside', () => {
    const first = rectangle('small-a', 0, 0, 0.4, 0.2);
    const copy = rectangle('small-b', 0, 0, 0.4, 0.2);

    expect(
      classifyTerrainEdges(makeLevel([first, copy]), first).map((edge) => edge.contact),
    ).toEqual(['exposed', 'exposed', 'exposed', 'exposed']);
  });

  it('hides a contained polygon boundary and does not mutate inputs', () => {
    const outer = rectangle('outer', 0, 0, 8, 8);
    const inner = rectangle('inner', 2, 2, 2, 2);
    const level = makeLevel([outer, inner]);
    const before = JSON.stringify(level);

    expect(classifyTerrainEdges(level, inner).every((edge) => edge.contact === 'solid')).toBe(true);
    expect(JSON.stringify(level)).toBe(before);
  });

  it('gives hazard contact priority over overlapping solid contact', () => {
    const base = rectangle('base', 0, 0, 4, 4);
    const cover = rectangle('cover', 1, -2, 2, 3);
    const hazard = rectangle('hazard-cover', 1, -2, 2, 3, 'hazard');
    const top = segmentsOn(classifyTerrainEdges(makeLevel([base, cover, hazard]), base), 'top');

    expect(top.map((edge) => edge.contact)).toEqual(['exposed', 'hazard', 'exposed']);
  });

  it('classifies every edge on the level boundary as bounds contact', () => {
    const box = rectangle('bounds-box', 0, 0, 4, 4);
    const level = makeLevel([box], { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    const edges = classifyTerrainEdges(level, box);

    expect(edges.map((edge) => edge.side)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(edges.every((edge) => edge.contact === 'bounds')).toBe(true);
  });

  it('keeps floating-platform edges exposed and labels ceiling underside correctly', () => {
    const platform = rectangle('platform', 2, 3, 4, 1);
    const edges = classifyTerrainEdges(makeLevel([platform]), platform);
    expect(edges.map((edge) => [edge.side, edge.contact])).toEqual([
      ['top', 'exposed'],
      ['right', 'exposed'],
      ['bottom', 'exposed'],
      ['left', 'exposed'],
    ]);

    const ceiling = rectangle('ceiling', 2, -5, 4, 1);
    const underside = segmentsOn(classifyTerrainEdges(makeLevel([ceiling]), ceiling), 'bottom');
    expect(underside).toHaveLength(1);
    expect(underside[0]).toMatchObject({ a: vec2(6, -4), b: vec2(2, -4), contact: 'exposed' });
  });

  it('labels diagonal roof edges as slopes', () => {
    const roof: SolidDef = {
      id: 'roof',
      kind: 'solid',
      points: [vec2(0, 2), vec2(2, 0), vec2(4, 2)],
    };
    const edges = classifyTerrainEdges(makeLevel([roof]), roof);

    expect(edges.map((edge) => edge.side)).toEqual(['slope', 'slope', 'bottom']);
  });

  it('returns stable authored-order segments for repeated calls', () => {
    const base = rectangle('base', 0, 0, 4, 4);
    const tee = rectangle('tee', 4, 1, 2, 2);
    const level = makeLevel([base, tee]);
    const before = JSON.stringify(level);

    expect(classifyTerrainEdges(level, base)).toEqual(classifyTerrainEdges(level, base));
    expect(JSON.stringify(level)).toBe(before);
  });
});
