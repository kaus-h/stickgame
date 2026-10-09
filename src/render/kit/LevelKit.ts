import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef, SolidDef } from '../../sim';
import manifest from '../../../assets/art/kit-0016/manifest.json';
import ledgeUrl from '../../../assets/art/kit-0016/1x/ledge-top.png';
import leftUrl from '../../../assets/art/kit-0016/1x/platform-left.png';
import rightUrl from '../../../assets/art/kit-0016/1x/platform-right.png';
import ceilingUrl from '../../../assets/art/kit-0016/1x/ceiling.png';
import spikesUrl from '../../../assets/art/kit-0016/1x/spikes.png';
import poolUrl from '../../../assets/art/kit-0016/1x/ink-pool.png';
import ringUrl from '../../../assets/art/kit-0016/1x/anchor-ring.png';
import doorUrl from '../../../assets/art/kit-0016/1x/exit-door.png';

const urls = {
  ledge: ledgeUrl,
  left: leftUrl,
  right: rightUrl,
  ceiling: ceilingUrl,
  spikes: spikesUrl,
  pool: poolUrl,
  ring: ringUrl,
  door: doorUrl,
};
type Part = keyof typeof urls;
type Images = Record<Part, HTMLImageElement>;
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
  });
  return pending;
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelDef,
  ) {
    if (!this.art) throw new Error('Level kit must be decoded before scene creation');
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

  stats(): { tiles: number; surfacePixels: number } {
    return { tiles: this.keys.length, surfacePixels: this.surfacePixels };
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
        for (const solid of visible.filter((s) => s.kind === 'solid')) this.paintSolid(c, solid);
        for (const solid of visible.filter((s) => s.kind === 'hazard')) this.paintHazard(c, solid);
        this.paintExit(c);
        texture.refresh();
        this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(-49);
      }
    }
  }

  /** Repeat at native 64 px/m; crop the last repeat instead of stretching pen strokes. */
  private strip(
    c: CanvasRenderingContext2D,
    part: 'ledge' | 'ceiling',
    length: number,
    above: boolean,
  ): void {
    const image = this.art?.[part];
    if (!image) return;
    const spec = specs[part],
      edges = spec.metadata?.collisionEdgeXSheetPx ?? [
        spec.sourceBox.x,
        spec.sourceBox.x + spec.sourceBox.width,
      ];
    const surfaceY =
      part === 'ceiling'
        ? spec.metadata?.undersideBottomYSheetPx
        : spec.metadata?.collisionTopYSheetPx;
    const a = kitGuide(part, edges[0] ?? 0, surfaceY ?? spec.sourceBox.y),
      z = kitGuide(part, edges[1] ?? 0, surfaceY ?? spec.sourceBox.y);
    const width = z.x - a.x;
    const underside = part === 'ceiling';
    const sy = above || underside ? 0 : a.y,
      height = above || underside ? a.y : image.height - a.y;
    c.save();
    if (underside) c.scale(1, -1);
    for (let x = 0; x < length; x += width) {
      const w = Math.min(width, length - x);
      c.drawImage(image, a.x, sy, w, height, x, above || underside ? -a.y : 0, w, height);
    }
    c.restore();
  }

  private paintSolid(c: CanvasRenderingContext2D, solid: SolidDef): void {
    const box = bounds(solid);
    // Foliage is light cosmetic ink above a walkable crest, never a replacement collision edge.
    solid.points.forEach((p, i) => {
      const q = solid.points[(i + 1) % solid.points.length];
      if (!q) return;
      const dx = m(q.x - p.x),
        dy = m(q.y - p.y),
        length = Math.hypot(dx, dy);
      if (dx <= 0 || -dx / length > -0.7 || p.y <= this.level.bounds.minY) return;
      c.save();
      c.translate(m(p.x), m(p.y));
      c.rotate(Math.atan2(dy, dx));
      this.strip(c, 'ledge', length, true);
      c.restore();
    });
    c.save();
    outline(c, solid);
    c.clip();
    solid.points.forEach((p, i) => {
      const q = solid.points[(i + 1) % solid.points.length];
      if (!q) return;
      const dx = m(q.x - p.x),
        dy = m(q.y - p.y),
        length = Math.hypot(dx, dy);
      c.save();
      c.translate(m(p.x), m(p.y));
      c.rotate(Math.atan2(dy, dx));
      this.strip(c, dx > 0 ? 'ledge' : 'ceiling', length, false);
      c.restore();
    });
    // The source's two broken skirts finish a rectangular ledge without widening its ends.
    if (solid.points.length === 4)
      for (const part of ['left', 'right'] as const) {
        const image = this.art?.[part];
        if (!image) continue;
        const spec = specs[part],
          edge = spec.metadata?.collisionEdgeXSheetPx;
        const guide = kitGuide(
          part,
          edge?.[part === 'left' ? 0 : 1] ?? spec.sourceBox.x,
          spec.metadata?.collisionTopYSheetPx ?? spec.sourceBox.y,
        );
        c.drawImage(image, (part === 'left' ? box.x : box.x + box.w) - guide.x, box.y - guide.y);
      }
    c.restore();
    outline(c, solid);
    c.lineWidth = 1.1;
    c.strokeStyle = '#16161a';
    c.stroke();
  }

  private paintHazard(c: CanvasRenderingContext2D, solid: SolidDef): void {
    const box = bounds(solid),
      pool = this.art?.pool,
      spikes = this.art?.spikes;
    if (!pool || !spikes) return;
    c.save();
    outline(c, solid);
    c.clip();
    // Ink from the approved pool fills the actual lethal area, with no red outside collision.
    c.globalAlpha = 0.85;
    for (let y = box.y; y < box.y + box.h; y += 18)
      for (let x = box.x; x < box.x + box.w; x += pool.width - 70) {
        const w = Math.min(pool.width - 70, box.x + box.w - x),
          h = Math.min(18, box.y + box.h - y);
        c.drawImage(pool, 35, 10, w, h, x, y, w, h);
      }
    c.globalAlpha = 1;
    if (kitHazardKind(solid.id) === 'spikes') {
      const raw = specs.spikes.metadata?.hazardBoundsSheetPx;
      if (raw) {
        const a = kitGuide('spikes', raw.x, raw.y),
          z = kitGuide('spikes', raw.x + raw.width, raw.y + raw.height);
        const vertical = box.w < box.h * 0.4 && box.w < m(1);
        const down = /hang|ceiling|overhang/i.test(solid.id);
        const length = vertical ? box.h : box.w,
          depth = Math.min(vertical ? box.w : box.h, m(1));
        c.save();
        if (vertical) {
          c.translate(box.x, box.y + box.h);
          c.rotate(-Math.PI / 2);
        } else {
          c.translate(box.x, down ? box.y + box.h : box.y);
          if (down) c.scale(1, -1);
        }
        for (let x = 0; x < length; x += z.x - a.x) {
          const w = Math.min(z.x - a.x, length - x);
          c.drawImage(spikes, a.x, a.y, w, z.y - a.y, x, 0, w, depth);
        }
        c.restore();
      }
    }
    outline(c, solid);
    c.lineWidth = 1.1;
    c.strokeStyle = '#c5302a';
    c.stroke();
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
