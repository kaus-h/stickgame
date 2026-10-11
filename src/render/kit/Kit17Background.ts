import * as Phaser from 'phaser';
import farUrl from '../../../assets/art/kit-0017/1x/t40-background-distant-mesa.png?no-inline';
import middleUrl from '../../../assets/art/kit-0017/1x/t41-background-arches.png?no-inline';
import nearUrl from '../../../assets/art/kit-0017/1x/t42-background-rock-spires.png?no-inline';

const layerSpecs = [
  {
    id: 'T40',
    key: 'kit-0017-bg-far',
    url: farUrl,
    rate: 0.08,
    alpha: 0.12,
    depth: -99,
    bandY: 0.4,
  },
  {
    id: 'T41',
    key: 'kit-0017-bg-middle',
    url: middleUrl,
    rate: 0.16,
    alpha: 0.16,
    depth: -98,
    bandY: 0.58,
  },
  {
    id: 'T42',
    key: 'kit-0017-bg-near',
    url: nearUrl,
    rate: 0.28,
    alpha: 0.2,
    depth: -97,
    bandY: 0.76,
  },
] as const;

type LayerSpec = (typeof layerSpecs)[number];
type LayerImage = HTMLCanvasElement;
type LayerImages = Record<LayerSpec['id'], LayerImage>;
type LayerObject = {
  readonly spec: LayerSpec;
  readonly image: LayerImage;
  readonly tile: Phaser.GameObjects.TileSprite;
  readonly displayTextureKey: string | null;
};

let images: LayerImages | null = null;
let pending: Promise<void> | null = null;

/** Screen-space scenery drift; reduced motion keeps the last phase instead of following the camera. */
export function kit17ParallaxOffset(
  viewLeft: number,
  zoom: number,
  rate: number,
  reducedMotion: boolean,
  frozenOffset: number,
): number {
  return reducedMotion ? frozenOffset : viewLeft * zoom * rate;
}

/** The layer canvas remains the visible screen width, independent of world zoom. */
export function kit17LayerSurfacePixels(
  viewportWidth: number,
  imageWidth: number,
  imageHeight: number,
): number {
  return viewportWidth * (viewportWidth / imageWidth) * imageHeight;
}

/** Decode the three authored strips once; LevelKit's boot loader calls this with its own art. */
export function loadKit17Background(): Promise<void> {
  pending ??= Promise.all(
    layerSpecs.map(async (spec) => {
      const image = new Image();
      image.src = spec.url;
      await image.decode();
      return [spec.id, featherStripEdges(image)] as const;
    }),
  ).then((entries) => {
    images = Object.fromEntries(entries) as LayerImages;
  });
  return pending;
}

/** Fade the nonmatching strip edges in the cached runtime copy, leaving the source PNG untouched. */
function featherStripEdges(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kit 17 background requires Canvas 2D');
  context.drawImage(source, 0, 0);
  const feather = Math.min(16, Math.floor(source.width / 4));
  const alpha = context.createLinearGradient(0, 0, source.width, 0);
  alpha.addColorStop(0, 'rgba(0,0,0,0)');
  alpha.addColorStop(feather / source.width, 'rgba(0,0,0,1)');
  alpha.addColorStop(1 - feather / source.width, 'rgba(0,0,0,1)');
  alpha.addColorStop(1, 'rgba(0,0,0,0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = alpha;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Screen-bounded scenery behind the terrain, with camera motion applied as a texture offset. */
export class Kit17Background {
  private readonly layers: LayerObject[];
  private destroyed = false;
  private offsets = new Map<LayerSpec['id'], number>();

  constructor(private readonly scene: Phaser.Scene) {
    const loadedImages = images;
    if (!loadedImages) throw new Error('Kit 17 background must be loaded before the scene starts');
    this.layers = layerSpecs.map((spec) => {
      const image = loadedImages[spec.id];
      if (!scene.textures.exists(spec.key)) scene.textures.addCanvas(spec.key, image);
      const tile = scene.add
        .tileSprite(0, 0, 1, 1, spec.key)
        .setOrigin(0, 0)
        .setAlpha(spec.alpha)
        .setDepth(spec.depth)
        .setScrollFactor(1)
        .setName(`kit-0017-background-${spec.id}`);
      const displayTextureKey =
        (tile as unknown as { displayTexture: Phaser.Textures.Texture | null }).displayTexture
          ?.key ?? null;
      return { spec, image, tile, displayTextureKey };
    });
    scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  /** Keep only the visible viewport in the display list, including during zoom and resize. */
  update(camera: Phaser.Cameras.Scene2D.Camera, reducedMotion: boolean): void {
    const zoom = Math.max(0.0001, camera.zoom);
    const width = camera.width;
    const height = camera.height;
    const viewLeft = camera.midPoint.x - width / (2 * zoom);
    const viewTop = camera.midPoint.y - height / (2 * zoom);
    for (const layer of this.layers) {
      const { spec, image, tile } = layer;
      const scaleX = width / image.width;
      const stripHeight = Math.max(1, Math.round(image.height * scaleX));
      const x = viewLeft;
      const y = viewTop + (height / zoom - stripHeight / zoom) * spec.bandY;
      // Anchor the tile at the visible world corner. Its size stays proportional to the camera,
      // while its backing surface remains viewport-sized, including in overview zoom.
      if (tile.x !== x || tile.y !== y) tile.setPosition(x, y);
      if (tile.width !== width || tile.height !== stripHeight) tile.setSize(width, stripHeight);
      if (tile.scaleX !== 1 / zoom || tile.scaleY !== 1 / zoom) tile.setScale(1 / zoom);
      if (tile.tileScaleX !== scaleX || tile.tileScaleY !== scaleX)
        tile.setTileScale(scaleX, scaleX);
      const offsetX = kit17ParallaxOffset(
        viewLeft,
        zoom,
        spec.rate,
        reducedMotion,
        this.offsets.get(spec.id) ?? 0,
      );
      this.offsets.set(spec.id, offsetX);
      // Tile positions are texture-space coordinates. Convert the intended screen-space drift
      // back through the current stretch scale, then wrap to keep values numerically small.
      const tileX = positiveModulo(offsetX / scaleX, image.width);
      if (tile.tilePositionX !== tileX || tile.tilePositionY !== 0) tile.setTilePosition(tileX, 0);
    }
  }

  presentation(): {
    readonly active: boolean;
    readonly layers: readonly {
      readonly id: string;
      readonly rate: number;
      readonly offsetX: number;
    }[];
    readonly textures: number;
    readonly surfacePixels: number;
  } {
    return {
      active: !this.destroyed,
      layers: layerSpecs.map((spec) => ({
        id: spec.id,
        rate: spec.rate,
        offsetX: this.offsets.get(spec.id) ?? 0,
      })),
      textures: this.layers.length,
      surfacePixels: this.layers.reduce((total, layer) => {
        const canvas = (layer.tile as unknown as { canvas?: HTMLCanvasElement }).canvas;
        return (
          total +
          (canvas && canvas.width === layer.tile.width && canvas.height === layer.tile.height
            ? canvas.width * canvas.height
            : layer.tile.width * layer.tile.height)
        );
      }, 0),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const { tile, spec, displayTextureKey } of this.layers) {
      tile.destroy();
      if (displayTextureKey && this.scene.textures.exists(displayTextureKey))
        this.scene.textures.remove(displayTextureKey);
      if (this.scene.textures.exists(spec.key)) this.scene.textures.remove(spec.key);
    }
    this.offsets.clear();
  }
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
