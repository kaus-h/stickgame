import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import labCollision from '../../content/levels/lab-collision.json';
import labMoving from '../../content/levels/lab-moving.json';
import { validateLevelAuthoring } from '../../src/content/validate-level';

function fixture(): Record<string, unknown> {
  return {
    version: 2,
    id: 'test',
    name: 'Test',
    spawn: [2, 7.65],
    bounds: { minX: 0, minY: -8, maxX: 30, maxY: 12 },
    killY: 13,
    solids: [{ id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } }],
    anchors: [{ id: 'anchor', position: [7, 2], requiredFrom: [2, 7.65] }],
    exit: { min: [25, 5], max: [28, 8] },
  };
}
const errors = (json: unknown): string[] =>
  validateLevelAuthoring(json)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.path}: ${issue.message}`);

describe('level authoring validation', () => {
  it('accepts a floor-supported v2 level and all existing v1 labs without hard errors', () => {
    expect(errors(fixture())).toEqual([]);
    for (const level of [lab01, labCollision, labMoving]) expect(errors(level)).toEqual([]);
    expect(
      validateLevelAuthoring(labCollision).some(
        (issue) => issue.path === 'level.spawn' && issue.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('reports schema and moving anchor envelope errors with source paths', () => {
    const level = fixture();
    level.anchors = [{ id: 'bad', position: [5, 2], path: { to: [25, 2], period: 1 } }];
    expect(errors(level).join()).toContain('level.anchors[0].path');
    level.version = 9;
    expect(errors(level).join()).toContain('version');
  });

  it('requires a nonoverlapping spawn resting on a safe floor in v2', () => {
    const level = fixture();
    level.spawn = [2, 7];
    expect(errors(level).join()).toContain('spawn must rest');
    level.spawn = [2, 8.2];
    expect(errors(level).join()).toContain('overlaps collision');
    level.spawn = [31, 7.65];
    expect(errors(level).join()).toContain('inside level bounds');
  });

  it('checks required anchor reach, vertical visibility and line of sight', () => {
    const level = fixture();
    level.anchors = [{ id: 'anchor', position: [20, 0], requiredFrom: [2, 7.65] }];
    expect(errors(level).join()).toContain('rope range');
    expect(errors(level).join()).toContain('7 m above');
    level.anchors = [{ id: 'anchor', position: [7, 2], requiredFrom: [2, 7.65] }];
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      { id: 'wall', rect: { x: 4, y: 0, w: 1, h: 8 } },
    ];
    expect(errors(level).join()).toContain('blocked line of sight');
  });

  it('checks both endpoints of required moving anchors', () => {
    const level = fixture();
    level.anchors = [
      { id: 'anchor', position: [7, 2], requiredFrom: [2, 7.65], path: { to: [17, 2], period: 6 } },
    ];
    expect(errors(level).join()).toContain('rope range');
  });

  it('blocks collinear shots and samples moving-path interior occlusion', () => {
    const level = fixture();
    level.anchors = [{ id: 'anchor', position: [7, 7.65], requiredFrom: [2, 7.65] }];
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      { id: 'grazed-wall', rect: { x: 4, y: 6.65, w: 1, h: 1 } },
    ];
    expect(errors(level).join()).toContain('blocked line of sight');
    level.anchors = [
      { id: 'anchor', position: [4, 2], requiredFrom: [2, 7.65], path: { to: [10, 2], period: 6 } },
    ];
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      { id: 'middle-occluder', rect: { x: 5, y: 3, w: 0.2, h: 2 } },
    ];
    expect(errors(level).filter((error) => error.includes('blocked line of sight'))).toHaveLength(
      1,
    );
  });

  it('enforces required-anchor camera margin and structural errors for legacy data too', () => {
    const level = fixture();
    level.anchors = [{ id: 'anchor', position: [0.5, 2], requiredFrom: [2, 7.65] }];
    expect(errors(level).join()).toContain('camera bounds clearance');
    level.version = 1;
    level.anchors = [];
    level.spawn = [-1, 7.65];
    level.exit = { min: [31, 5], max: [32, 6] };
    expect(errors(level).join()).toContain('spawn must be inside');
    expect(errors(level).join()).toContain('exit must remain inside');
  });

  it('rejects declared tunnels below physical clearance or overlapping collision', () => {
    const level = fixture();
    level.tunnels = [{ id: 'tunnel', region: { min: [1, 6], max: [5, 6.7] } }];
    expect(errors(level).join()).toContain('0.72 m');
    level.tunnels = [{ id: 'tunnel', region: { min: [1, 6], max: [5, 6.75] } }];
    expect(errors(level).join()).toContain('0.8 m clear');
    level.tunnels = [{ id: 'tunnel', region: { min: [1, 6], max: [5, 6.8] } }];
    expect(errors(level)).toEqual([]);
    level.tunnels = [{ id: 'tunnel', region: { min: [1, 7], max: [5, 9] } }];
    expect(errors(level).join()).toContain('intersects collision');
  });

  it('keeps decorative teeth contained by their owning hazard', () => {
    const level = fixture();
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      {
        id: 'teeth',
        kind: 'hazard',
        rect: { x: 10, y: 7, w: 2, h: 1 },
        visualPoints: [
          [10, 8],
          [11, 6],
          [12, 8],
        ],
      },
    ];
    expect(errors(level).join()).toContain('visualPoints[1]');
  });

  it('rejects a tunnel-spanning bar whose vertices lie exactly on the region boundary', () => {
    const level = fixture();
    level.anchors = [];
    level.tunnels = [{ id: 'tunnel', region: { min: [1, 5], max: [5, 7] } }];
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      { id: 'bar', rect: { x: 1, y: 5.1, w: 4, h: 0.2 } },
    ];
    expect(errors(level).join()).toContain('intersects collision');
  });

  it('rejects tooth edges across a concave notch even when every vertex is contained', () => {
    const level = fixture();
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      {
        id: 'concave-hazard',
        kind: 'hazard',
        points: [
          [12, 1],
          [13, 1],
          [13, 4],
          [15, 4],
          [15, 1],
          [16, 1],
          [16, 5],
          [12, 5],
        ],
        visualPoints: [
          [12.5, 2],
          [15.5, 2],
          [14, 4.5],
        ],
      },
    ];
    expect(errors(level).join()).toContain('including concave boundaries');
    expect(errors(level).some((error) => error.includes('visualPoints[0]'))).toBe(false);
  });

  it('rejects an exit outside bounds and an exit entirely filled by collision', () => {
    const level = fixture();
    level.exit = { min: [31, 5], max: [32, 6] };
    expect(errors(level).join()).toContain('inside level bounds');
    level.exit = { min: [25, 9], max: [28, 11] };
    expect(errors(level).join()).toContain('bounding feasibility fails');
  });

  it('rejects thin production walls and invalid polygon geometry', () => {
    const level = fixture();
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      { id: 'thin', rect: { x: 12, y: 0, w: 0.06, h: 5 } },
      {
        id: 'bowtie',
        points: [
          [20, 1],
          [22, 3],
          [20, 3],
          [22, 1],
        ],
      },
    ];
    expect(errors(level).join()).toContain('0.1 m thick');
    expect(errors(level).join()).toContain('self-intersect');
  });

  it('applies minimum thickness equally to rects, point boxes and rotated point boxes', () => {
    const level = fixture();
    level.anchors = [];
    level.solids = [
      { id: 'floor', rect: { x: 0, y: 8, w: 30, h: 4 } },
      {
        id: 'thin-points',
        points: [
          [12, 0],
          [12.06, 0],
          [12.06, 5],
          [12, 5],
        ],
      },
      {
        id: 'thin-rotated',
        points: [
          [15, 0],
          [15.03, 0.03],
          [18.03, -2.97],
          [18, -3],
        ],
      },
    ];
    expect(errors(level).filter((error) => error.includes('0.1 m thick'))).toHaveLength(2);
  });
});
