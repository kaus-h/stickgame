import { describe, expect, it } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import labCollision from '../../content/levels/lab-collision.json';
import labMoving from '../../content/levels/lab-moving.json';
import { compileLevel, LevelError, migrateLevel, parseLevel, validateLevelSchema } from './level';

const authored = () => ({
  ...lab01,
  version: 2,
  section: 'section-1',
  telemetry: { levelId: 'chapter-1.level-1' },
  chambers: [
    {
      id: 'room-1',
      region: { min: [0, 0], max: [11, 8] },
      problem: 'Carry momentum',
      challengeFamily: 'swing',
    },
  ],
  checkpoints: [{ id: 'cp-1', position: [3, 7.65] }],
  cameraHints: [{ id: 'camera-1', region: { min: [0, 0], max: [11, 8] }, focus: [5, 4] }],
  tunnels: [{ id: 'tunnel-1', region: { min: [1, 1], max: [2, 3] } }],
  anchors: [{ id: 'shot-1', position: [7, 2], requiredFrom: [3, 7.65] }],
  solids: [
    {
      id: 'floor',
      kind: 'hazard',
      rect: { x: 0, y: 8, w: 11, h: 1 },
      visualPoints: [
        [1, 8],
        [2, 8],
        [1.5, 8.5],
      ],
    },
  ],
});

describe('versioned level schema and compiler', () => {
  it('migrates every shipped v1 lab without changing geometry, spawn or stable IDs', () => {
    for (const source of [lab01, labCollision, labMoving]) {
      const before = structuredClone(source);
      const migrated = migrateLevel(source);
      expect(migrated.version).toBe(2);
      expect(migrated.telemetry).toEqual({ levelId: source.id });
      expect(migrated.solids).toEqual(source.solids);
      expect(migrated.anchors).toEqual(source.anchors);
      expect(migrated.spawn).toEqual(source.spawn);
      expect(source).toEqual(before);
      expect(parseLevel(source)).toEqual(compileLevel(migrated));
      // Migration owns its own nested data, so editing its output cannot edit the source.
      expect(migrated.solids).not.toBe(source.solids);
    }
  });

  it('migration is idempotent and fills absent legacy anchors', () => {
    const withoutAnchors: Record<string, unknown> = { ...lab01 };
    delete withoutAnchors.anchors;
    expect(migrateLevel(withoutAnchors).anchors).toEqual([]);
    expect(migrateLevel(migrateLevel(authored()))).toEqual(migrateLevel(authored()));
  });

  it('compiles optional authoring metadata without adding gameplay behavior', () => {
    const level = compileLevel(authored());
    expect(level.telemetry?.levelId).toBe('chapter-1.level-1');
    expect(level.section).toBe('section-1');
    expect(level.chambers?.[0]?.region.max).toEqual({ x: 11, y: 8 });
    expect(level.checkpoints?.[0]?.position).toEqual({ x: 3, y: 7.65 });
    expect(level.cameraHints?.[0]?.focus).toEqual({ x: 5, y: 4 });
    expect(level.tunnels?.[0]?.region.min).toEqual({ x: 1, y: 1 });
    expect(level.anchors[0]?.requiredFrom).toEqual({ x: 3, y: 7.65 });
    expect(level.solids[0]?.visualPoints?.[2]).toEqual({ x: 1.5, y: 8.5 });
  });

  it('JSON Schema rejects unknown gameplay features and provides exact nested paths', () => {
    expect(() => {
      validateLevelSchema({ ...lab01, enemies: [] });
    }).toThrow('level.enemies');
    expect(() => parseLevel({ ...authored(), triggers: [] })).toThrow('level.triggers');
    expect(() => parseLevel({ ...lab01, version: 3 })).toThrow('level.version');
    expect(() =>
      parseLevel({ ...authored(), anchors: [{ id: 'a', position: [1, 2], radius: 0 }] }),
    ).toThrow('level.anchors[0].radius');
    expect(() => parseLevel({ ...authored(), checkpoints: [{ id: 'cp' }] })).toThrow(
      'level.checkpoints[0].position',
    );
    expect(() => parseLevel({ ...authored(), exit: null })).toThrow('level.exit');
    expect(() => parseLevel({ ...authored(), spawn: [Number.NaN, 0] })).toThrow(LevelError);
  });

  it('standalone string validation preserves Unicode nonempty-name semantics', () => {
    expect(parseLevel({ ...lab01, name: '🪢' }).name).toBe('🪢');
    expect(() => parseLevel({ ...lab01, name: '' })).toThrow('level.name');
  });

  it('rejects ambiguous collision and duplicate stable IDs across entity kinds', () => {
    expect(() =>
      parseLevel({
        ...authored(),
        solids: [
          {
            id: 's',
            points: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
            rect: { x: 0, y: 0, w: 1, h: 1 },
          },
        ],
      }),
    ).toThrow('level.solids[0]');
    expect(() =>
      parseLevel({ ...authored(), checkpoints: [{ id: 'shot-1', position: [3, 7.65] }] }),
    ).toThrow('duplicate id "shot-1"');
    expect(() =>
      parseLevel({
        ...authored(),
        tunnels: [{ id: 'bad-region', region: { min: [2, 2], max: [1, 1] } }],
      }),
    ).toThrow('level.tunnels[0].region');
  });
});
