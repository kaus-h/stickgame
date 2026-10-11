import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef, SolidDef } from '../../sim';
import manifest from '../../../assets/art/kit-0016/manifest.json';
import ledgeUrl from '../../../assets/art/kit-0016/1x/ledge-top.png';
import spikesUrl from '../../../assets/art/kit-0016/1x/spikes.png';
import poolUrl from '../../../assets/art/kit-0016/1x/ink-pool.png';
import ringUrl from '../../../assets/art/kit-0016/1x/anchor-ring.png';
import doorUrl from '../../../assets/art/kit-0016/1x/exit-door.png';
import { classifyTerrainEdges, type TerrainEdge } from './terrainEdges';
import { BorderMass } from './BorderMass';
import { loadKit17, paintKit17Terrain, resolveKitVersion } from './Kit17Terrain';
import { loadKit17Background } from './Kit17Background';
import { loadKit17Pool, paintKit17Pool } from './Kit17Pool';

const urls = {
  ledge: ledgeUrl,
  spikes: spikesUrl,
  pool: poolUrl,
  ring: ringUrl,
  door: doorUrl,
};
type Part = 'ledge' | 'left' | 'right' | 'ceiling' | 'spikes' | 'pool' | 'ring' | 'door';
type Images = Record<keyof typeof urls, HTMLImageElement>;
const names: Record<Part, string> = {
  ledge: 'ledge-top',
  left: 'platform-left',
  right: 'platform-right',
  ceiling: 'ceiling',
  spikes: 'spikes',
  pool: 'ink-pool',
  ring: 'anchor-ring',
  door: 'exit-door',
};
interface Spec {
  sourceBox: { x: number; y: number; width: number; height: number };
  size1x: number[];
  metadata?: {
    collisionTopYSheetPx?: number;
    undersideBottomYSheetPx?: number;
    collisionEdgeXSheetPx?: number[];
    centerSheetPx?: number[];
    outerRadiusSheetPx?: number;
    openingBoundsSheetPx?: { x: number; y: number; width: number; height: number };
    hazardBoundsSheetPx?: { x: number; y: number; width: number; height: number };
  };
}
function assetSpec(part: Part): Spec {
  const spec = manifest.objects.find((object) => object.name === names[part]);
  if (!spec) throw new Error(`Missing kit calibration: ${names[part]}`);
  return spec;
}
const specs: Record<Part, Spec> = {
  ledge: assetSpec('ledge'),
  left: assetSpec('left'),
  right: assetSpec('right'),
  ceiling: assetSpec('ceiling'),
  spikes: assetSpec('spikes'),
  pool: assetSpec('pool'),
  ring: assetSpec('ring'),
  door: assetSpec('door'),
};
let images: Images | null = null;
let pending: Promise<void> | null = null;
let kit17Pending: Promise<void> | null = null;
let skirt: HTMLCanvasElement | null = null;

/** Decode once at initial boot, using browser images rather than the omitted Phaser Loader. */
export function loadLevelKit(): Promise<void> {
  pending ??= Promise.all(
    Object.entries(urls).map(async ([part, url]) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [part, image] as const;
    }),
  ).then((entries) => {
    images = Object.fromEntries(entries) as Images;
    // Stretch the hatch lengths, not a closed terrain outline. One shared feathered stamp
    // is prepared at boot and reused while baking every scene's static tiles.
    // The middle of the source has no vertical end-cap strokes to repeat as tile seams.
    const a = kitGuide('ledge', 220, 145),
      z = kitGuide('ledge', 1080, 145);
    skirt = document.createElement('canvas');
    skirt.width = Math.ceil(z.x - a.x);
    skirt.height = Math.ceil(m(1.65));
    const c = skirt.getContext('2d');
    if (!c) throw new Error('Level skirt requires Canvas 2D');
    c.drawImage(
      images.ledge,
      a.x,
      a.y,
      z.x - a.x,
      images.ledge.height - a.y,
      0,
      0,
      skirt.width,
      skirt.height,
    );
    c.globalCompositeOperation = 'destination-in';
    const fade = c.createLinearGradient(0, 0, 0, skirt.height);
    fade.addColorStop(0, '#000');
    fade.addColorStop(0.15, '#000');
    fade.addColorStop(0.55, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fade;
    c.fillRect(0, 0, skirt.width, skirt.height);
  });
  const kitId = resolveKitVersion(typeof window === 'undefined' ? '' : window.location.search);
  kit17Pending ??=
    kitId === '0017'
      ? Promise.all([loadKit17(), loadKit17Pool(), loadKit17Background()]).then(() => undefined)
      : Promise.resolve();
  return Promise.all([pending, kit17Pending]).then(() => undefined);
}

/** Sheet guides transformed through the crop padding and the actual rounded output dimensions. */
export function kitGuide(part: Part, x: number, y: number): { x: number; y: number } {
  const spec = specs[part];
  return {
    x: ((x - spec.sourceBox.x + 2) * (spec.size1x[0] ?? 1)) / (spec.sourceBox.width + 4),
    y: ((y - spec.sourceBox.y + 2) * (spec.size1x[1] ?? 1)) / (spec.sourceBox.height + 4),
  };
}

/** Match the existing death-label vocabulary, so an ink pool never acquires a teeth silhouette. */
export function kitHazardKind(id: string): 'spikes' | 'pool' {
  return /thorn|spike|teeth/i.test(id) ? 'spikes' : 'pool';
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const bounds = (solid: SolidDef): Box => {
  const xs = solid.points.map((p) => m(p.x)),
    ys = solid.points.map((p) => m(p.y));
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};
const outline = (c: CanvasRenderingContext2D, solid: SolidDef): void => {
  c.beginPath();
  solid.points.forEach((p, i) => {
    if (i === 0) c.moveTo(m(p.x), m(p.y));
    else c.lineTo(m(p.x), m(p.y));
  });
  c.closePath();
};

/** Static collision-aligned ink is baked into world tiles; only moving rings are live images. */
export class LevelKit {
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly keys: string[] = [];
  private readonly art = images;
  private surfacePixels = 0;
  private readonly kitId: '0016' | '0017';
  private readonly usedParts = new Set<string>();
  private readonly allExposedEdges: TerrainEdge[] = [];
  private readonly edges = new Map<SolidDef, TerrainEdge[]>();
  private readonly corners: { vertex: TerrainEdge['a']; edges: TerrainEdge[] }[] = [];
  private readonly border: BorderMass;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelDef,
  ) {
    if (!this.art) throw new Error('Level kit must be decoded before scene creation');
    this.kitId = resolveKitVersion(typeof window === 'undefined' ? '' : window.location.search);
    this.border = new BorderMass(scene, level);
    const updateBorder = (): void => {
      this.border.update();
    };
    scene.events.on('prerender', updateBorder);
    scene.events.once('shutdown', () => {
      scene.events.off('prerender', updateBorder);
    });
    for (const solid of level.solids.filter((s) => s.kind === 'solid'))
      this.edges.set(solid, classifyTerrainEdges(level, solid));
    for (const edge of [...this.edges.values()].flat())
      if (edge.contact === 'exposed') this.allExposedEdges.push(edge);
    const endpoints = new Map<string, { vertex: TerrainEdge['a']; edges: TerrainEdge[] }>();
    for (const edge of [...this.edges.values()].flat().filter((e) => e.contact === 'exposed')) {
      for (const vertex of [edge.a, edge.b]) {
        const key = `${String(Math.round(vertex.x * 1e7))},${String(Math.round(vertex.y * 1e7))}`;
        const group = endpoints.get(key) ?? { vertex, edges: [] };
        group.edges.push(edge);
        endpoints.set(key, group);
      }
    }
    this.corners.push(...[...endpoints.values()].filter((group) => group.edges.length === 2));
    const ringKey = 'kit-0016-ring';
    if (!scene.textures.exists(ringKey)) scene.textures.addImage(ringKey, this.art.ring);
    const center = specs.ring.metadata?.centerSheetPx ?? [1001, 812];
    const guide = kitGuide('ring', center[0] ?? 1001, center[1] ?? 812);
    const radius =
      kitGuide(
        'ring',
        (center[0] ?? 1001) + (specs.ring.metadata?.outerRadiusSheetPx ?? 56),
        center[1] ?? 812,
      ).x - guide.x;
    for (const anchor of level.anchors) {
      const scale = m(anchor.radius) / radius;
      this.rings.push(
        scene.add
          .image(m(anchor.position.x), m(anchor.position.y), ringKey)
          .setOrigin(guide.x / this.art.ring.width, guide.y / this.art.ring.height)
          .setDisplaySize(this.art.ring.width * scale, this.art.ring.height * scale)
          .setDepth(1),
      );
    }
    this.bake();
    scene.events.once('shutdown', () => {
      // Canvas textures are not owned by the display-list images. Release each scene's tiles.
      for (const key of this.keys) if (scene.textures.exists(key)) scene.textures.remove(key);
    });
  }

  moveAnchor(index: number, x: number, y: number): void {
    this.rings[index]?.setPosition(x, y);
  }

  stats(): { tiles: number; surfacePixels: number; kitId: '0016' | '0017'; usedParts: string[] } {
    const border = this.border.stats();
    return {
      tiles: this.keys.length + border.tiles,
      surfacePixels: this.surfacePixels + border.surfacePixels,
      kitId: this.kitId,
      usedParts: [...this.usedParts].sort(),
    };
  }

  private bake(): void {
    const b = this.level.bounds;
    const tile = 1024,
      x0 = Math.floor(m(b.minX - 2)),
      y0 = Math.floor(m(b.minY - 2));
    let index = 0;
    for (let y = y0; y < m(b.maxY + 2); y += tile) {
      for (let x = x0; x < m(b.maxX + 2); x += tile) {
        const visible = this.level.solids.filter((solid) => {
          const box = bounds(solid);
          // One metre covers the kit's cosmetic foliage and antialiased boundary pixels.
          return (
            box.x - m(1) < x + tile &&
            box.x + box.w + m(1) > x &&
            box.y - m(1) < y + tile &&
            box.y + box.h + m(1) > y
          );
        });
        const exit = this.level.exit;
        const nearExit =
          exit &&
          m(exit.min.x - 8) < x + tile &&
          m(exit.max.x + 8) > x &&
          m(exit.min.y - 8) < y + tile &&
          m(exit.max.y + 8) > y;
        // Empty negative space stays the shared paper quad, not a transparent GPU allocation.
        if (visible.length === 0 && !nearExit) continue;
        const key = `kit-0016-tile-${String(index++)}`;
        const texture = this.scene.textures.createCanvas(
          key,
          Math.ceil(Math.min(tile, m(b.maxX + 2) - x)),
          Math.ceil(Math.min(tile, m(b.maxY + 2) - y)),
        );
        if (!texture) continue;
        this.keys.push(key);
        this.surfacePixels += texture.width * texture.height;
        const c = texture.getContext();
        c.translate(-x, -y);
        const solids = visible.filter((s) => s.kind === 'solid');
        // Connected rock mass and its world-locked hatch remain the base layer in both kits.
        // Kit 0017 stamps add the calibrated surface language over it; they do not replace it.
        this.paintMass(
          c,
          solids.filter((s) => !this.floating(s)),
          {
            x,
            y,
            w: texture.width,
            h: texture.height,
          },
          this.kitId === '0017' ? 0.7 : 1,
        );
        if (this.kitId === '0017') {
          for (const solid of solids) {
            paintKit17Terrain(
              c,
              this.level,
              solid,
              this.usedParts,
              this.edges.get(solid),
              this.allExposedEdges,
            );
            this.paintCeilingDrips(c, solid, this.edges.get(solid) ?? []);
          }
        } else {
          for (const solid of solids) this.paintSolid(c, solid);
          this.paintCorners(c);
        }
        for (const solid of visible.filter((s) => s.kind === 'hazard')) this.paintHazard(c, solid);
        this.paintExit(c);
        texture.refresh();
        this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(-49);
      }
    }
  }

  /** Calibrated grass above the crest at native scale; the last repeat is cropped. */
  private foliage(c: CanvasRenderingContext2D, length: number): void {
    const image = this.art?.ledge;
    if (!image) return;
    const a = kitGuide('ledge', 55, 145),
      z = kitGuide('ledge', 1226, 145);
    const width = z.x - a.x;
    for (let x = 0; x < length; x += width) {
      const w = Math.min(width, length - x);
      c.drawImage(image, a.x, 0, w, a.y, x, -a.y, w, a.y);
    }
  }
  /** Long source hatches hang from the collision crest and disappear into the paper. */
  private hatchSkirt(
    c: CanvasRenderingContext2D,
    length: number,
    depth = m(1.65),
    featherEnds = false,
  ): void {
    if (!skirt) return;
    const alpha = c.globalAlpha;
    const feather = featherEnds ? Math.min(m(0.28), length / 2) : 0;
    for (let x = 0; x < length;) {
      const sourceX = x % skirt.width;
      let width = Math.min(skirt.width - sourceX, length - x);
      if (feather > 0) {
        // Only the two short end bands need extra samples; the interior keeps native stamps.
        if (x < feather) width = Math.min(width, 2, feather - x);
        else if (x >= length - feather) width = Math.min(width, 2);
        else width = Math.min(width, length - feather - x);
        const center = x + width / 2;
        const fade = Math.min(1, Math.min(center, length - center) / feather);
        c.globalAlpha = alpha * fade * fade * (3 - 2 * fade);
      }
      c.drawImage(skirt, sourceX, 0, width, skirt.height, x, 0, width, depth);
      x += width;
    }
    c.globalAlpha = alpha;
  }

  private floating(solid: SolidDef): boolean {
    return (this.edges.get(solid) ?? []).every((edge) => edge.contact === 'exposed');
  }

  /** One world-locked hatch field continues across joined polygons and the page borders. */
  private paintMass(c: CanvasRenderingContext2D, solids: SolidDef[], tile: Box, alpha = 1): void {
    if (solids.length === 0) return;
    c.save();
    c.beginPath();
    c.rect(tile.x, tile.y, tile.w, tile.h);
    c.clip();
    c.beginPath();
    for (const solid of solids) {
      solid.points.forEach((p, i) => {
        if (i === 0) c.moveTo(m(p.x), m(p.y));
        else c.lineTo(m(p.x), m(p.y));
      });
      c.closePath();
    }
    c.clip();
    c.strokeStyle = '#16161a';
    c.lineWidth = 0.85;
    const left = Math.floor(tile.x / 12) * 12 - 12;
    const right = tile.x + tile.w + 12;
    const top = tile.y - 12;
    const bottom = tile.y + tile.h + 12;
    for (let pass = 0; pass < 2; pass++) {
      const slope = pass === 0 ? -1.55 : 0.68;
      const spacing = pass === 0 ? 8 : 22;
      c.globalAlpha = alpha * (pass === 0 ? 0.78 : 0.46);
      const offsets = [
        top - slope * left,
        top - slope * right,
        bottom - slope * left,
        bottom - slope * right,
      ];
      for (
        let offset = Math.floor(Math.min(...offsets) / spacing) * spacing;
        offset <= Math.max(...offsets);
        offset += spacing
      ) {
        c.lineWidth = 0.65 + (Math.sin(offset * 0.31) + 1) * 0.2;
        c.beginPath();
        for (let x = left; x <= right; x += 12) {
          const y =
            slope * x +
            offset +
            Math.sin(offset * 0.13) * 2.4 +
            Math.sin(x * 0.057 + offset * 0.21) * 1.8 +
            Math.sin(x * 0.19 - offset * 0.07) * 0.6;
          if (x === left) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
  }

  private paintSolid(c: CanvasRenderingContext2D, solid: SolidDef): void {
    const floating = this.floating(solid);
    const edges = this.edges.get(solid) ?? [];
    const ceiling =
      edges.some((edge) => edge.side === 'top' && edge.contact === 'bounds') ||
      /ceiling|roof|hang/i.test(solid.id);
    for (const edge of edges) {
      if (edge.contact !== 'exposed') continue;
      const dx = m(edge.b.x - edge.a.x),
        dy = m(edge.b.y - edge.a.y);
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const top = edge.side === 'top' || (edge.side === 'slope' && dx > 0);
      c.save();
      c.translate(m(edge.a.x), m(edge.a.y));
      c.rotate(Math.atan2(dy, dx));
      if (top && !ceiling) this.foliage(c, length);
      c.restore();
      c.save();
      outline(c, solid);
      c.clip();
      c.translate(m(edge.a.x), m(edge.a.y));
      c.rotate(Math.atan2(dy, dx));
      if (floating && top) this.hatchSkirt(c, length, m(1.65), true);
      // Thin doubled ink follows only the exposed boundary. Contact intervals are omitted,
      // including partial T joins, so outer and inner corners belong to a single mass.
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = '#16161a';
        c.lineWidth = pass === 0 && top ? 1.8 : pass === 0 ? 1.3 : 0.7;
        for (let t = 0; t < length; t += 8) {
          const end = Math.min(t + 8, length);
          const side = edge.side === 'left' || edge.side === 'right';
          const down = dy > 0;
          const along = down ? t : length - t;
          c.globalAlpha =
            floating && side
              ? 0.75 * Math.max(0, 1 - along / m(1.65)) * Math.max(0, 1 - along / m(1.65))
              : pass === 0
                ? 0.92
                : 0.55;
          // Full solids keep a thin visible underside (07B); the fading infill stays paper.
          c.beginPath();
          c.moveTo(t, 0.7 + pass * 1.8 + Math.sin(t * 0.13));
          c.lineTo(end, 0.7 + pass * 1.8 + Math.sin(end * 0.13));
          c.stroke();
        }
      }
      c.restore();
    }
    this.paintCeilingDrips(c, solid, edges);
  }

  private paintCeilingDrips(
    c: CanvasRenderingContext2D,
    solid: SolidDef,
    edges: readonly TerrainEdge[],
  ): void {
    const ceiling =
      edges.some((edge) => edge.side === 'top' && edge.contact === 'bounds') ||
      /ceiling|roof|hang/i.test(solid.id);
    if (!ceiling) return;
    for (const edge of edges) {
      if (edge.contact !== 'exposed' || edge.side !== 'bottom') continue;
      const dx = m(edge.b.x - edge.a.x);
      const dy = m(edge.b.y - edge.a.y);
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      // Preserve GMR-111's sparse 3–9 px underside marks in both terrain kits.
      c.save();
      c.translate(m(edge.a.x), m(edge.a.y));
      c.rotate(Math.atan2(dy, dx));
      c.strokeStyle = '#16161a';
      c.lineWidth = 0.9;
      c.globalAlpha = 0.75;
      for (let t = 18; t < length - 12; t += 43) {
        c.beginPath();
        c.moveTo(t, 0);
        c.lineTo(t + Math.sin(t) * 1.1, -3 - (Math.sin(t * 0.3) + 1) * 3);
        c.stroke();
      }
      c.restore();
    }
  }

  /** Join the two offset contour strokes across convex and concave exposed corner turns. */
  private paintCorners(c: CanvasRenderingContext2D): void {
    c.save();
    c.beginPath();
    for (const solid of this.level.solids.filter((s) => s.kind === 'solid')) {
      solid.points.forEach((point, index) => {
        if (index === 0) c.moveTo(m(point.x), m(point.y));
        else c.lineTo(m(point.x), m(point.y));
      });
      c.closePath();
    }
    c.clip();
    c.strokeStyle = '#16161a';
    for (const { vertex, edges } of this.corners) {
      const directions = edges.map((edge) => {
        const dx = edge.b.x - edge.a.x,
          dy = edge.b.y - edge.a.y;
        const length = Math.hypot(dx, dy);
        const fromStart = Math.hypot(vertex.x - edge.a.x, vertex.y - edge.a.y) < 1e-6;
        return {
          x: (dx / length) * (fromStart ? 1 : -1),
          y: (dy / length) * (fromStart ? 1 : -1),
          nx: -dy / length,
          ny: dx / length,
        };
      });
      const a = directions[0],
        b = directions[1];
      if (!a || !b || Math.abs(a.x * b.y - a.y * b.x) < 0.01) continue;
      for (const offset of [0.7, 2.5]) {
        c.globalAlpha = offset < 1 ? 0.88 : 0.5;
        c.lineWidth = offset < 1 ? 1.2 : 0.7;
        c.beginPath();
        c.moveTo(m(vertex.x) + a.x * 5 + a.nx * offset, m(vertex.y) + a.y * 5 + a.ny * offset);
        c.lineTo(m(vertex.x) + (a.nx + b.nx) * offset, m(vertex.y) + (a.ny + b.ny) * offset);
        c.lineTo(m(vertex.x) + b.x * 5 + b.nx * offset, m(vertex.y) + b.y * 5 + b.ny * offset);
        c.stroke();
      }
    }
    c.restore();
  }
  private paintHazard(c: CanvasRenderingContext2D, solid: SolidDef): void {
    if (this.kitId === '0017' && kitHazardKind(solid.id) === 'pool') {
      paintKit17Pool(c, this.level, solid, this.usedParts);
      return;
    }
    const box = bounds(solid),
      pool = this.art?.pool,
      spikes = this.art?.spikes;
    if (!pool || !spikes) return;
    c.save();
    outline(c, solid);
    c.clip();
    if (kitHazardKind(solid.id) === 'pool') {
      // Use the entire scribbled ink height, including its ragged top and paper gaps.
      // Exclude the two black cliff banks; never fill the rect or repeat narrow row strips.
      const a = kitGuide('pool', 125, 788),
        z = kitGuide('pool', 793, 882);
      const repeat = m(7),
        depth = Math.min(box.h, m(1.8));
      for (let x = 0, index = 0; x < box.w; x += repeat, index++) {
        // Adjacent mirrored repeats share the same source edge, including its ragged top.
        // Draw full stamps and let the collision clip trim the final partial repeat.
        const mirrored = index % 2 === 1;
        c.save();
        c.translate(box.x + x + (mirrored ? repeat : 0), box.y);
        if (mirrored) c.scale(-1, 1);
        c.drawImage(pool, a.x, a.y, z.x - a.x, z.y - a.y, 0, 0, repeat, depth);
        c.restore();
      }
    } else {
      const raw = specs.spikes.metadata?.hazardBoundsSheetPx;
      if (raw) {
        const a = kitGuide('spikes', raw.x, raw.y),
          z = kitGuide('spikes', raw.x + raw.width, raw.y + raw.height);
        const vertical = box.w < box.h * 0.4 && box.w < m(1);
        const down = /hang|ceiling|overhang/i.test(solid.id);
        const length = vertical ? box.h : box.w,
          depth = vertical ? box.w : box.h;
        const repeat = m(2.5); // five source teeth, roughly half a metre each
        c.save();
        if (vertical) {
          c.translate(box.x, box.y + box.h);
          c.rotate(-Math.PI / 2);
        } else {
          c.translate(box.x, down ? box.y + box.h : box.y);
          if (down) c.scale(1, -1);
        }
        for (let x = 0; x < length; x += repeat) {
          const w = Math.min(repeat, length - x);
          c.drawImage(spikes, a.x, a.y, ((z.x - a.x) * w) / repeat, z.y - a.y, x, 0, w, depth);
        }
        c.restore();
      }
    }
    c.restore();
  }
  private paintExit(c: CanvasRenderingContext2D): void {
    const exit = this.level.exit,
      image = this.art?.door,
      opening = specs.door.metadata?.openingBoundsSheetPx;
    if (!exit || !image || !opening) return;
    const a = kitGuide('door', opening.x, opening.y),
      z = kitGuide('door', opening.x + opening.width, opening.y + opening.height);
    const side = 'entry' in exit ? exit.entry.side : 'left';
    const vertical = side === 'top' || side === 'bottom';
    const length = m(vertical ? exit.max.x - exit.min.x : exit.max.y - exit.min.y);
    // Keep the hut recognizable, then expose the complete authored entry with its original marks.
    const scale = length / (z.y - a.y);
    c.save();
    const x = m(
      vertical ? (exit.min.x + exit.max.x) / 2 : side === 'left' ? exit.min.x : exit.max.x,
    );
    const y = m(
      vertical ? (side === 'top' ? exit.min.y : exit.max.y) : (exit.min.y + exit.max.y) / 2,
    );
    c.translate(x, y);
    if (vertical) c.rotate(side === 'top' ? Math.PI / 2 : -Math.PI / 2);
    else if (side === 'right') c.scale(-1, 1);
    c.drawImage(
      image,
      -a.x * scale,
      (-(a.y + z.y) / 2) * scale,
      image.width * scale,
      image.height * scale,
    );
    c.restore();
  }
}
