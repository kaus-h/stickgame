import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import chapterOneOne from '../../content/levels/1-1.json';
import chapterOneTwo from '../../content/levels/1-2.json';
import chapterOneThree from '../../content/levels/1-3.json';
import manifest from '../../assets/art/kit-0016/manifest.json';
import { metersToPixels } from '../../src/core';
import { parseLevel } from '../../src/content';
import { causeText } from '../../src/render/feedback/causeText';

vi.mock('phaser', () => ({}));

import { kitGuide, kitHazardKind } from '../../src/render/kit/LevelKit';

const root = new URL('../../', import.meta.url);
interface DecodedPng {
  width: number;
  height: number;
  data: Buffer;
}
const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => DecodedPng } };
};
interface KitObject {
  name: string;
  sourceBox: { x: number; y: number; width: number; height: number };
  sourcePxPerMeter: number;
  size1x: number[];
  metadata?: {
    collisionTopYSheetPx?: number;
    undersideBottomYSheetPx?: number;
    collisionEdgeXSheetPx?: number[];
    centerSheetPx?: number[];
    outerRadiusSheetPx?: number;
    baseYSheetPx?: number;
    hazardTopYSheetPx?: number;
    hazardBoundsSheetPx?: { x: number; y: number; width: number; height: number };
  };
}
const kitObjects = manifest.objects as KitObject[];
const assetPath = (path: string): string => fileURLToPath(new URL(path, root));
const png = (path: string): DecodedPng => PNG.sync.read(readFileSync(assetPath(path)));
const valueAt = (values: readonly number[], index: number): number => {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing calibration value at index ${String(index)}`);
  return value;
};
const sheetPxToOutput = (part: string, x: number, y: number): { x: number; y: number } => {
  const object = kitObjects.find((entry) => entry.name === part);
  if (!object) throw new Error(`Missing ${part} in kit manifest`);
  return {
    x: ((x - object.sourceBox.x + 2) * valueAt(object.size1x, 0)) / (object.sourceBox.width + 4),
    y: ((y - object.sourceBox.y + 2) * valueAt(object.size1x, 1)) / (object.sourceBox.height + 4),
  };
};

describe('level art kit calibration and asset pipeline (GMR-107)', () => {
  it('records two-pixel crop padding and rounded 1x dimensions for every slice', () => {
    const files = kitObjects.map((object) => {
      const image = png(`assets/art/kit-0016/1x/${object.name}.png`);
      const scale = 64 / object.sourcePxPerMeter;

      expect([image.width, image.height], object.name).toEqual(object.size1x);
      expect(image.width, `${object.name} width`).toBe(
        Math.round((object.sourceBox.width + 4) * scale),
      );
      expect(image.height, `${object.name} height`).toBe(
        Math.round((object.sourceBox.height + 4) * scale),
      );
      return readFileSync(assetPath(`assets/art/kit-0016/1x/${object.name}.png`)).byteLength;
    });

    expect(manifest.objects).toHaveLength(14);
    expect(files.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(100 * 1024);
  });

  it('maps ledge collision guides and both end caps through the actual rounded output size', () => {
    const ledge = kitObjects.find((object) => object.name === 'ledge-top');
    const left = kitObjects.find((object) => object.name === 'platform-left');
    const right = kitObjects.find((object) => object.name === 'platform-right');
    if (!ledge || !left || !right) throw new Error('Missing ledge or end-cap calibration');

    for (const object of [ledge, left, right]) {
      const metadata = object.metadata;
      if (!metadata) throw new Error(`Missing collision guides for ${object.name}`);
      const edges = metadata.collisionEdgeXSheetPx;
      const top = metadata.collisionTopYSheetPx;
      if (!edges || top === undefined)
        throw new Error(`Missing collision guides for ${object.name}`);
      const edgeA = valueAt(edges, 0);
      const edgeB = valueAt(edges, 1);
      expect(
        kitGuide(
          object.name === 'platform-left'
            ? 'left'
            : object.name === 'platform-right'
              ? 'right'
              : 'ledge',
          edgeA,
          top,
        ),
      ).toEqual(sheetPxToOutput(object.name, edgeA, top));
      expect(
        kitGuide(
          object.name === 'platform-left'
            ? 'left'
            : object.name === 'platform-right'
              ? 'right'
              : 'ledge',
          edgeB,
          top,
        ).x,
      ).toBeCloseTo(sheetPxToOutput(object.name, edgeB, top).x, 10);
    }

    const ledgeMetadata = ledge.metadata;
    if (!ledgeMetadata) throw new Error('Missing ledge collision metadata');
    const ledgeEdges = ledgeMetadata.collisionEdgeXSheetPx;
    const ledgeTop = ledgeMetadata.collisionTopYSheetPx;
    if (!ledgeEdges || ledgeTop === undefined) throw new Error('Missing ledge collision guides');
    const repeatWidth =
      kitGuide('ledge', valueAt(ledgeEdges, 1), ledgeTop).x -
      kitGuide('ledge', valueAt(ledgeEdges, 0), ledgeTop).x;
    const image = png('assets/art/kit-0016/1x/ledge-top.png');
    expect(repeatWidth).toBeLessThan(image.width);
    expect(repeatWidth).toBeGreaterThan(image.width - 8);
  });

  it('centers the anchor ring and scales its outer guide to the authored impact radius', () => {
    const ring = kitObjects.find((object) => object.name === 'anchor-ring');
    if (!ring?.metadata) throw new Error('Missing anchor-ring metadata');
    const centerSheet = ring.metadata.centerSheetPx;
    const outerRadius = ring.metadata.outerRadiusSheetPx;
    if (!centerSheet || outerRadius === undefined)
      throw new Error('Missing anchor-ring center or radius guide');
    const centerX = valueAt(centerSheet, 0);
    const centerY = valueAt(centerSheet, 1);
    const center = kitGuide('ring', centerX, centerY);
    const outer = kitGuide('ring', centerX + outerRadius, centerY);
    const naturalRadius = outer.x - center.x;
    const authoredRadiusMeters = 0.4;
    const scale = metersToPixels(authoredRadiusMeters) / naturalRadius;
    const displayedOuterRadius = naturalRadius * scale;

    expect(center).toEqual(sheetPxToOutput('anchor-ring', centerX, centerY));
    expect(displayedOuterRadius).toBe(metersToPixels(authoredRadiusMeters));
  });

  it('keeps alpha on all slices and red warning ink only on hazard assets', () => {
    const redShare = new Map<string, number>();
    for (const object of kitObjects) {
      const image = png(`assets/art/kit-0016/1x/${object.name}.png`);
      let transparent = 0;
      let opaque = 0;
      let red = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] === 0) transparent++;
        const alpha = image.data[i + 3] ?? 0;
        const redChannel = image.data[i] ?? 0;
        const greenChannel = image.data[i + 1] ?? 0;
        const blueChannel = image.data[i + 2] ?? 0;
        if (alpha > 0) {
          opaque++;
          if (redChannel > greenChannel * 1.35 && redChannel > blueChannel * 1.35) red++;
        }
      }
      expect(transparent, `${object.name} transparent paper`).toBeGreaterThan(0);
      redShare.set(object.name, red / opaque);
    }

    expect(redShare.get('spikes')).toBeGreaterThan(0.4);
    expect(redShare.get('ink-pool')).toBeGreaterThan(0.8);
    for (const [name, share] of redShare) {
      if (name !== 'spikes' && name !== 'ink-pool') expect(share, name).toBeLessThan(0.02);
    }
  });

  it('aligns hazard guides to their base and top edges and preserves the c6 traversal clearance', () => {
    const spikes = kitObjects.find((object) => object.name === 'spikes');
    const pool = kitObjects.find((object) => object.name === 'ink-pool');
    if (!spikes?.metadata || !pool?.metadata) throw new Error('Missing hazard orientation guides');
    const spikeHazardBounds = spikes.metadata.hazardBoundsSheetPx;
    const spikeBaseY = spikes.metadata.baseYSheetPx;
    const poolTop = pool.metadata.hazardTopYSheetPx;
    if (!spikeHazardBounds || spikeBaseY === undefined || poolTop === undefined)
      throw new Error('Missing hazard orientation guides');
    expect(kitGuide('spikes', spikeHazardBounds.x, spikeBaseY).y).toBeLessThan(
      png('assets/art/kit-0016/1x/spikes.png').height,
    );
    expect(kitGuide('pool', pool.sourceBox.x, poolTop).y).toBeGreaterThan(0);

    const level = parseLevel(chapterOneOne);
    const ceiling = level.solids.find((solid) => solid.id === 'c6-ceiling');
    const hazard = level.solids.find((solid) => solid.id === 'c6-pool');
    if (!ceiling || !hazard) throw new Error('Missing c6 collision fixtures');
    const ceilingBottom = Math.max(...ceiling.points.map((point) => point.y));
    const hazardTop = Math.min(...hazard.points.map((point) => point.y));
    // GMR-114 climax pass: the pool rose 1 m so a long rope on a6a dips into the ink.
    expect(hazardTop - ceilingBottom).toBeCloseTo(8.4, 9);
    expect(metersToPixels(hazardTop - ceilingBottom)).toBeCloseTo(537.6, 6);
  });

  it('classifies every authored chapter 1 hazard like the existing death-cause label', () => {
    const levels = [chapterOneOne, chapterOneTwo, chapterOneThree];
    const covered: string[] = [];

    for (const rawLevel of levels) {
      const level = parseLevel(rawLevel);
      const hazards = level.solids.filter((solid) => solid.kind === 'hazard');
      expect(hazards.length, `${level.id} hazard fixtures`).toBeGreaterThan(0);

      for (const hazard of hazards) {
        const deathLabel = causeText('hazard', hazard.id);
        const expected = deathLabel === 'spikes!' ? 'spikes' : 'pool';
        expect(kitHazardKind(hazard.id), `${level.id}/${hazard.id} (${deathLabel})`).toBe(expected);
        covered.push(expected);
      }
    }

    expect(covered).toContain('pool');
    expect(covered).toContain('spikes');
  });

  it('maps the ceiling underside guide to the rendered bottom edge, not its collision top', () => {
    const ceiling = kitObjects.find((object) => object.name === 'ceiling');
    if (!ceiling?.metadata) throw new Error('Missing ceiling underside calibration');
    const underside = ceiling.metadata.undersideBottomYSheetPx;
    const collisionTop = ceiling.metadata.collisionTopYSheetPx;
    if (underside === undefined || collisionTop === undefined)
      throw new Error('Missing ceiling underside or collision-top guide');

    const image = png('assets/art/kit-0016/1x/ceiling.png');
    const undersideOutput = kitGuide('ceiling', ceiling.sourceBox.x, underside).y;
    const collisionTopOutput = kitGuide('ceiling', ceiling.sourceBox.x, collisionTop).y;

    expect(undersideOutput).toBeCloseTo(
      sheetPxToOutput('ceiling', ceiling.sourceBox.x, underside).y,
      10,
    );
    expect(image.height - undersideOutput).toBeLessThan(3);
    expect(undersideOutput - collisionTopOutput).toBeGreaterThan(20);
  });

  it('records provenance for each generated slice and its source sheet', () => {
    const rows = readFileSync(assetPath('assets/provenance.csv'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('assets/art/kit-0016/1x/'));

    expect(rows).toHaveLength(kitObjects.length);
    for (const row of rows) {
      expect(row).toContain('assets/sheets/0016-level-kit-thin.png');
      expect(row).toContain(',0016,2026-10-09,');
      expect(row).toContain('owner art review pending');
    }
  });
});
