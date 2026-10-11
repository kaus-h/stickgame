import * as Phaser from 'phaser';
import { metersToPixels as m } from '../../core';
import type { LevelDef, SolidDef } from '../../sim';
import manifest from '../../../assets/art/kit-0016/manifest.json';
import ledgeUrl from '../../../assets/art/kit-0016/1x/ledge-top.png';
import spikesUrl from '../../../assets/art/kit-0016/1x/spikes.png';
import poolUrl from '../../../assets/art/kit-0016/1x/ink-pool.png';
import ringUrl from '../../../assets/art/kit-0016/1x/anchor-ring.png';
import doorUrl from '../../../assets/art/kit-0016/1x/exit-door.png';

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

  private paintSolid(c: CanvasRenderingContext2D, solid: SolidDef): void {
    const box = bounds(solid);
    const wall = box.h > m(4) && box.h > box.w * 3;
    const ceiling = Math.min(...solid.points.map((p) => p.y)) <= this.level.bounds.minY;
    // Cosmetic foliage sits above walkable tops. There is deliberately no bottom outline.
    for (let i = 0; i < solid.points.length; i++) {
      const p = solid.points[i],
        q = solid.points[(i + 1) % solid.points.length];
      if (!p || !q) continue;
      const dx = m(q.x - p.x),
        dy = m(q.y - p.y),
        length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const top = dx > 0 && dx / length >= 0.7 && !ceiling;
      const underside = dx < 0 && -dx / length >= 0.7 && ceiling;
      const side = Math.abs(dy) / length > 0.7;
      if (!top && !underside && !side) continue;
      c.save();
      c.translate(m(p.x), m(p.y));
      c.rotate(Math.atan2(dy, dx));
      if (top) this.foliage(c, length);
      c.restore();
      c.save();
      outline(c, solid);
      c.clip();
      c.translate(m(p.x), m(p.y));
      c.rotate(Math.atan2(dy, dx));
      if (top || underside || (side && wall)) {
        // Clockwise collision has its interior to the right of every edge. On walls this
        // is the same feathered skirt rotated, without repeated flowers down the margin.
        this.hatchSkirt(
          c,
          length,
          side ? Math.min(m(1.65), box.w * 0.45) : m(1.65),
          top || underside,
        );
        c.strokeStyle = '#16161a';
        c.lineWidth = top ? 2 : 1.1;
        c.beginPath();
        c.moveTo(0, 0.5);
        c.lineTo(length, 0.5);
        c.stroke();
      }
      if (side && !wall) {
        // Two loose contour trails from the top corner; neither reaches the bottom.
        const depth = Math.min(length, m(1.65));
        const down = dy > 0;
        for (let pass = 0; pass < 2; pass++) {
          for (let t = 0; t < depth; t += 8) {
            const start = down ? t : length - t;
            const end = down ? Math.min(t + 8, depth) : length - Math.min(t + 8, depth);
            c.globalAlpha = 0.75 * (1 - t / depth) * (1 - t / depth);
            c.lineWidth = pass === 0 ? 1.2 : 0.7;
            c.strokeStyle = '#16161a';
            c.beginPath();
            c.moveTo(start, 1 + pass * 2 + Math.sin(t * 0.13));
            c.lineTo(end, 1 + pass * 2 + Math.sin((t + 8) * 0.13));
            c.stroke();
          }
        }
      }
      c.restore();
    }
  }

  private paintHazard(c: CanvasRenderingContext2D, solid: SolidDef): void {
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
