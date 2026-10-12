import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import authoringManifest from '../../assets/art/kit-0017/manifest.json';
import runtimeManifest from '../../assets/art/kit-0017/runtime.json';

const root = new URL('../../', import.meta.url);
const assetPath = (relative: string): string => fileURLToPath(new URL(relative, root));
const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Buffer } } };
};
const png = (relative: string) => PNG.sync.read(readFileSync(assetPath(relative)));
const objects = authoringManifest.objects;
const runtimeObjects = runtimeManifest.objects;

function coordinatePairs(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.length === 2 && value.every((part) => typeof part === 'number')) return [value];
  return value.flatMap(coordinatePairs);
}

describe('kit 0017 mechanical slices', () => {
  it('keeps every declared 1x image nonblank, transparent, and dimensionally calibrated', () => {
    expect(objects).toHaveLength(36);
    expect(
      readdirSync(assetPath('assets/art/kit-0017/1x')).filter((name) => name.endsWith('.png')),
    ).toHaveLength(objects.length);

    for (const object of objects) {
      const image = png(`assets/art/kit-0017/1x/${object.name}.png`);
      expect([image.width, image.height], object.name).toEqual(object.size1x);
      let visible = 0;
      let transparent = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if ((image.data[i + 3] ?? 0) > 0) visible++;
        else transparent++;
      }
      expect(visible, `${object.name} visible ink`).toBeGreaterThan(0);
      expect(transparent, `${object.name} removed paper`).toBeGreaterThan(0);

      const source = png(`assets/art/kit-0017/source/${object.source}`);
      expect(object.sourceBox.x + object.sourceBox.width).toBeLessThanOrEqual(source.width);
      expect(object.sourceBox.y + object.sourceBox.height).toBeLessThanOrEqual(source.height);
      expect(object.source).not.toContain('/source/');
    }
  });

  it('keeps only the canonical pool family red and declares all corner orientations', () => {
    const waterPieces = new Set([
      't34-pool-surface-span',
      't35-pool-left-wall-join',
      't36-pool-right-wall-join',
      't37-pool-inner-left-corner',
      't38-pool-inner-right-corner',
      't39-pool-depth-fill',
    ]);
    for (const object of objects) {
      const image = png(`assets/art/kit-0017/1x/${object.name}.png`);
      let red = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (
          (image.data[i + 3] ?? 0) > 0 &&
          (image.data[i] ?? 0) > (image.data[i + 1] ?? 0) * 1.5 &&
          (image.data[i] ?? 0) > (image.data[i + 2] ?? 0) * 1.5
        )
          red++;
      }
      expect(red > 0, `${object.name} red ink`).toBe(waterPieces.has(object.name));
    }

    const corners = objects.filter((object) => object.metadata.cornerTopology);
    expect(corners.filter((object) => object.name.match(/^t(0[89]|1[0-5])-/))).toHaveLength(8);
    for (const corner of corners) {
      expect(['convex', 'concave']).toContain(corner.metadata.cornerTopology);
      expect(['top-left', 'top-right', 'bottom-left', 'bottom-right']).toContain(
        corner.metadata.cornerOrientation,
      );
    }
    expect(objects.filter((object) => object.metadata.renderRole === 'wall-bracket')).toHaveLength(
      2,
    );
  });

  it('keeps authored contact guides inside their 1x image bounds', () => {
    for (const object of objects) {
      const guide = object.metadata.contactDatum1x;
      if (!guide) continue;
      const [width, height] = object.size1x as [number, number];
      for (const [x, y] of coordinatePairs(guide)) {
        expect(x, `${object.name} x guide`).toBeGreaterThanOrEqual(0);
        expect(x, `${object.name} x guide`).toBeLessThanOrEqual(width - 1);
        expect(y, `${object.name} y guide`).toBeGreaterThanOrEqual(0);
        expect(y, `${object.name} y guide`).toBeLessThanOrEqual(height - 1);
      }
    }
  });

  it('keeps source crop details out of the renderer manifest and records provenance', () => {
    const terrainObjects = objects.filter((object) =>
      /^t(0[1-9]|1[0-9]|2[0-3]|2[5-8])-/.test(object.name),
    );
    expect(runtimeObjects).toHaveLength(27);
    expect(runtimeObjects.map((object) => object.name).sort()).toEqual(
      terrainObjects.map((object) => object.name).sort(),
    );
    for (const object of runtimeObjects) {
      expect(object).not.toHaveProperty('size1x');
      expect(object).not.toHaveProperty('source');
      expect(object).not.toHaveProperty('sourceBox');
      expect(object).not.toHaveProperty('sourcePxPerMeter');
      expect(object).not.toHaveProperty('sizeMeters');
      const metadata = object.metadata as {
        datum?: { type?: unknown; points?: unknown; segments?: unknown };
      };
      const original = terrainObjects.find((asset) => asset.name === object.name);
      const guide = original?.metadata.contactDatum1x;
      if (guide) {
        // Every authored contact guide must reach the painter, not merely survive slicing.
        const coordinates = Object.fromEntries(
          Object.entries(guide).filter(([key]) => key !== 'type'),
        );
        expect(metadata.datum, `${object.name} runtime contact calibration`).toEqual(coordinates);
      }
      expect(metadata).not.toHaveProperty('renderRole');
      expect(metadata).not.toHaveProperty('semanticRole');
      if (metadata.datum) {
        expect(metadata.datum).not.toHaveProperty('type');
        expect(metadata.datum.points || metadata.datum.segments).toBeTruthy();
      }
    }

    const rows = readFileSync(assetPath('assets/provenance.csv'), 'utf8').split(/\r?\n/);
    const paths = new Set(rows.map((row) => row.split(',')[0]));
    for (const object of objects)
      expect(paths).toContain(`assets/art/kit-0017/1x/${object.name}.png`);
    expect(paths).toContain('assets/art/kit-0017/source/kit-0017-sheet-a.png');
    expect(paths).toContain('assets/art/kit-0017/source/kit-0017-sheet-b.png');
  });
});
