import { describe, expect, it, vi } from 'vitest';

import {
  resolveKitVersion,
  selectKit17CornerName,
  selectKit17EdgeName,
  selectKit17Topology,
  loadKit17,
  paintKit17Terrain,
} from '../../src/render/kit/Kit17Terrain';
import { vec2 } from '../../src/core';
import type { LevelDef, SolidDef } from '../../src/sim';

const rectangle = (id: string, x: number, y: number, w: number, h: number): SolidDef => ({
  id,
  kind: 'solid',
  points: [vec2(x, y), vec2(x + w, y), vec2(x + w, y + h), vec2(x, y + h)],
});
const level = (solids: SolidDef[]): LevelDef => ({
  id: 'terrain-fixture',
  name: 'terrain fixture',
  spawn: vec2(1, 1),
  bounds: { minX: -10, minY: -10, maxX: 20, maxY: 20 },
  killY: 21,
  solids,
  anchors: [],
});

describe('kit 0017 terrain selection', () => {
  it('uses kit 0017 unless the compatibility flag selects 0016', () => {
    expect(resolveKitVersion('')).toBe('0017');
    expect(resolveKitVersion('?level=1-1&kit=0016')).toBe('0016');
  });

  it('keeps similarly named query values on the 0017 renderer', () => {
    expect(resolveKitVersion('?kit=00160')).toBe('0017');
    expect(resolveKitVersion('?kit=other')).toBe('0017');
  });

  it('chooses edge pieces from the exposed collision side', () => {
    expect(selectKit17EdgeName('top')).toBe('t02-top-edge-a');
    expect(selectKit17EdgeName('bottom')).toBe('t04-bottom-edge');
    expect(selectKit17EdgeName('left')).toBe('t05-left-edge');
    expect(selectKit17EdgeName('right')).toBe('t06-right-edge');
  });

  it('chooses all eight corner orientations from the solid turn topology', () => {
    expect(selectKit17CornerName('top-left', true)).toBe('t08-outer-tl');
    expect(selectKit17CornerName('top-right', true)).toBe('t09-outer-tr');
    expect(selectKit17CornerName('bottom-left', true)).toBe('t10-outer-bl');
    expect(selectKit17CornerName('bottom-right', true)).toBe('t11-outer-br');
    expect(selectKit17CornerName('top-left', false)).toBe('t12-inner-tl');
    expect(selectKit17CornerName('top-right', false)).toBe('t13-inner-tr');
    expect(selectKit17CornerName('bottom-left', false)).toBe('t14-inner-bl');
    expect(selectKit17CornerName('bottom-right', false)).toBe('t15-inner-br');
  });

  it('classifies recesses from actual polygon edges and does not paint shared contours', () => {
    const notch: SolidDef = {
      id: 'notch',
      kind: 'solid',
      points: [vec2(0, 0), vec2(6, 0), vec2(6, 2), vec2(2, 2), vec2(2, 6), vec2(0, 6)],
    };
    const topology = selectKit17Topology(level([notch]), notch);
    expect(topology.corners.map((corner) => corner.assetName)).toContain('t15-inner-br');

    const base = rectangle('base', 0, 0, 8, 3);
    const adjoining = rectangle('adjoining', 8, 0, 3, 3);
    const joined = selectKit17Topology(level([base, adjoining]), base);
    expect(joined.edges.some(({ edge }) => edge.side === 'right')).toBe(false);
    expect(joined.corners.some(({ vertex }) => vertex.x === 8 && vertex.y === 0)).toBe(false);
  });

  it('selects short ledges, bridges, and wall brackets from measured geometry', () => {
    const platform = rectangle('platform', 0, 0, 2, 0.5);
    const bridge = rectangle('bridge', 0, 0, 12, 1);
    expect(selectKit17Topology(level([platform]), platform).edges[0]?.assetName).toBe(
      't28-isolated-platform',
    );
    expect(selectKit17Topology(level([bridge]), bridge).edges[0]?.assetName).toBe(
      't27-thin-solid-bridge',
    );
    const wallCap = rectangle('wall-cap', 0, 0, 2, 0.5);
    expect(
      selectKit17Topology(level([wallCap, rectangle('support', -1, 0, 1, 3)]), wallCap).edges[0]
        ?.assetName,
    ).toBe('t17-wall-top-cap');
    expect(selectKit17EdgeName('left', { widthPx: 8, heightPx: 320, floating: false })).toBe(
      't16-vertical-wall-strip',
    );
  });

  it('uses all four convex turns on a full isolated block', () => {
    const block = rectangle('block', 2, 2, 4, 3);
    const turns = selectKit17Topology(level([block]), block).corners.map(
      (corner) => corner.assetName,
    );
    expect(turns).toEqual(
      expect.arrayContaining(['t08-outer-tl', 't09-outer-tr', 't10-outer-bl', 't11-outer-br']),
    );
  });

  it('keeps the terrain crest continuous beneath a spike strip', () => {
    const floor = rectangle('floor', 0, 8, 10, 3);
    const spikes = { ...rectangle('floor-spikes', 4, 7.5, 1, 0.5), kind: 'hazard' as const };
    const tops = selectKit17Topology(level([floor, spikes]), floor).edges.filter(
      ({ edge }) => edge.side === 'top',
    );
    expect(tops).toHaveLength(1);
    expect(tops[0]?.edge).toMatchObject({ a: vec2(0, 8), b: vec2(10, 8) });
    const pool = { ...spikes, id: 'pool' };
    expect(
      selectKit17Topology(level([floor, pool]), floor).edges.filter(
        ({ edge }) => edge.side === 'top',
      ),
    ).toHaveLength(2);
  });

  it('preserves corner selection when an authored polygon reverses winding', () => {
    const solid: SolidDef = {
      id: 'recess',
      kind: 'solid',
      points: [vec2(0, 0), vec2(6, 0), vec2(6, 2), vec2(2, 2), vec2(2, 6), vec2(0, 6)],
    };
    const reversed = { ...solid, points: [...solid.points].reverse() };
    const names = (s: SolidDef) =>
      selectKit17Topology(level([s]), s)
        .corners.map((c) => `${String(c.vertex.x)},${String(c.vertex.y)}:${c.assetName}`)
        .sort();
    expect(names(reversed)).toEqual(names(solid));
  });

  it('paints calibrated edge and corner stamps rather than only procedural contact lines', async () => {
    vi.stubGlobal(
      'Image',
      class {
        width = 100;
        height = 100;
        src = '';
        async decode(): Promise<void> {
          return Promise.resolve();
        }
      },
    );
    try {
      await loadKit17();
      const drawImage = vi.fn();
      const context = {
        globalAlpha: 1,
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        clip: vi.fn(),
        transform: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        stroke: vi.fn(),
        drawImage,
      } as unknown as CanvasRenderingContext2D;
      const solid = rectangle('painted', 0, 0, 4, 1);
      paintKit17Terrain(context, level([solid]), solid);
      // Four edges and four corners must actually draw decoded kit artwork.
      expect(drawImage.mock.calls.length).toBeGreaterThanOrEqual(8);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
