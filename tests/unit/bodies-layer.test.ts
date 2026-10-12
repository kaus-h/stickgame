import { afterEach, describe, expect, it, vi } from 'vitest';
import level12 from '../../content/levels/1-2.json';
import tuning from '../../content/tuning/runtime.json';
import { vec2 } from '../../src/core';
import { BODY_ALPHA, BodiesLayer } from '../../src/render/bodies/BodiesLayer';
import { makeFixture } from '../../src/tools/replay-drift/scenario';
import type * as Phaser from 'phaser';

const level = makeFixture(level12, tuning).level;
const death = { tick: 10, at: vec2(8, 5), velocity: vec2(0, 0) };

interface FakeDisplayObject {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  destroyed: boolean;
  visible: boolean;
  scales: number[];
  alphas: number[];
  setScale: (scale: number) => FakeDisplayObject;
  setAlpha: (alpha: number) => FakeDisplayObject;
  setVisible: (visible: boolean) => FakeDisplayObject;
  setCrop: (x: number, y: number, width: number, height: number) => FakeDisplayObject;
  destroy: () => void;
  draw: () => FakeDisplayObject;
  render: () => FakeDisplayObject;
  setOrigin: (originX: number, originY?: number) => FakeDisplayObject;
  setDepth: () => FakeDisplayObject;
  clear: (x: number, y: number, width: number, height: number) => FakeDisplayObject;
}

interface FakeTexture extends FakeDisplayObject {
  texture: {
    add: (
      frame: string,
      source: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => void;
    remove: (frame: string) => void;
    frames: Map<string, { source: number; x: number; y: number; width: number; height: number }>;
  };
}

function fakeGraphics(): Record<string, (...args: number[]) => unknown> {
  const graphics: Record<string, (...args: number[]) => unknown> = {};
  const chain = () => graphics;
  for (const method of [
    'setDepth',
    'setAlpha',
    'setScrollFactor',
    'clear',
    'save',
    'restore',
    'translateCanvas',
    'scaleCanvas',
    'destroy',
    'lineStyle',
    'lineBetween',
    'fillStyle',
    'fillCircle',
    'fillEllipse',
    'beginPath',
    'moveTo',
    'lineTo',
    'closePath',
    'fillPath',
    'strokePath',
  ])
    graphics[method] = vi.fn(chain);
  return graphics;
}

function harness() {
  const graphics: ReturnType<typeof fakeGraphics>[] = [];
  const textures: FakeTexture[] = [];
  const images: FakeDisplayObject[] = [];
  const add = {
    graphics: vi.fn(() => {
      const g = fakeGraphics();
      graphics.push(g);
      return g;
    }),
    renderTexture: vi.fn((x: number, y: number, width: number, height: number) => {
      const rt: FakeTexture = {
        x,
        y,
        width,
        height,
        originX: 0,
        originY: 0,
        destroyed: false,
        visible: true,
        scales: [],
        alphas: [],
        texture: {
          frames: new Map<
            string,
            { source: number; x: number; y: number; width: number; height: number }
          >(),
          add(frame, source, x, y, frameWidth, frameHeight) {
            this.frames.set(frame, { source, x, y, width: frameWidth, height: frameHeight });
          },
          remove(frame) {
            this.frames.delete(frame);
          },
        },
        setScale(scale) {
          this.scales.push(scale);
          return this;
        },
        setAlpha: vi.fn(function (this: FakeTexture, alpha: number) {
          this.alphas.push(alpha);
          return this;
        }),
        setVisible: vi.fn(function (this: FakeTexture, visible: boolean) {
          this.visible = visible;
          return this;
        }),
        setCrop: vi.fn(function (this: FakeTexture) {
          return this;
        }),
        destroy() {
          this.destroyed = true;
        },
        draw: vi.fn(function (this: FakeTexture) {
          return this;
        }),
        render: vi.fn(function (this: FakeTexture) {
          return this;
        }),
        setOrigin: vi.fn(function (this: FakeTexture, originX: number, originY: number = originX) {
          this.originX = originX;
          this.originY = originY;
          return this;
        }),
        setDepth: vi.fn(function (this: FakeTexture) {
          return this;
        }),
        clear: vi.fn(function (this: FakeTexture) {
          return this;
        }),
      };
      textures.push(rt);
      return rt;
    }),
    image: vi.fn((_x: number, _y: number, texture: FakeTexture['texture'], frame: string) => {
      const size = texture.frames.get(frame) ?? { width: 64, height: 64 };
      const image: FakeDisplayObject = {
        x: _x,
        y: _y,
        width: size.width,
        height: size.height,
        originX: 0,
        originY: 0,
        destroyed: false,
        visible: true,
        scales: [],
        alphas: [],
        setScale(scale) {
          this.scales.push(scale);
          return this;
        },
        setAlpha(alpha) {
          this.alphas.push(alpha);
          return this;
        },
        setVisible: vi.fn(function (this: FakeDisplayObject, visible: boolean) {
          this.visible = visible;
          return this;
        }),
        setCrop: vi.fn(function (this: FakeDisplayObject) {
          return this;
        }),
        destroy() {
          this.destroyed = true;
        },
        draw: vi.fn(function (this: FakeDisplayObject) {
          return this;
        }),
        render: vi.fn(function (this: FakeDisplayObject) {
          return this;
        }),
        setOrigin(originX, originY = originX) {
          this.originX = originX;
          this.originY = originY;
          return this;
        },
        setDepth: vi.fn(function (this: FakeDisplayObject) {
          return this;
        }),
        clear: vi.fn(function (this: FakeDisplayObject) {
          return this;
        }),
      };
      images.push(image);
      return image;
    }),
  };
  const scene = {
    add,
    scale: { width: 1280, height: 720 },
    cameras: { main: { worldView: { x: 0 }, zoom: 1 } },
  } as unknown as Phaser.Scene;
  return { scene, graphics, textures, images };
}

const eventListeners = new Map<string, EventListenerOrEventListenerObject>();
const fakeWindow = {
  addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    eventListeners.set(type, listener);
  }),
  removeEventListener: vi.fn((type: string) => eventListeners.delete(type)),
};

function createLayer(reducedMotion = false) {
  const { scene, graphics, textures, images } = harness();
  const layer = new BodiesLayer(
    scene,
    level,
    30,
    true,
    () => reducedMotion,
    () => 1,
  );
  return { layer, graphics, textures, images };
}

function makeLongLevel(distanceMeters: number) {
  return {
    ...level,
    bounds: { ...level.bounds, minX: 0, maxX: distanceMeters },
    exit: {
      min: vec2(distanceMeters - 1, 0),
      max: vec2(distanceMeters, 10),
    },
  };
}

function inverseSmoothstep(value: number): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const eased = mid * mid * (3 - 2 * mid);
    if (eased < value) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

afterEach(() => {
  eventListeners.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BodiesLayer render lifecycle (GMR-104)', () => {
  it('pops baked bodies in and out when B visibility changes', () => {
    const { layer, images, textures } = createLayer();
    vi.stubGlobal('window', fakeWindow);
    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    const image = images[0];
    expect(image).toBeDefined();
    expect(image?.alphas.at(-1)).toBe(BODY_ALPHA);

    layer.setVisible(true);
    layer.update(0.06);
    expect(image?.scales.at(-1)).toBeGreaterThan(1);
    layer.update(0.06);
    expect(textures).toHaveLength(2);
    expect(textures[1]?.visible).toBe(true);
    expect(textures[1]?.alphas.at(-1)).toBe(BODY_ALPHA);

    layer.setVisible(false);
    layer.update(0.06);
    expect(image?.scales.at(-1)).toBeLessThan(1);
    layer.update(0.06);
    expect(image?.scales.at(-1)).toBe(0);
    expect(layer.visible).toBe(false);
    layer.destroy();
  });

  it('composites 60 settled bodies at the same place into one stable render texture', () => {
    const { layer, textures } = createLayer();
    for (let i = 0; i < 60; i++) layer.onDeath(death);
    layer.pile.freezeAll();
    layer.update(0);
    expect(textures).toHaveLength(1);
    expect(textures[0]?.width).toBeGreaterThan(0);

    for (let frame = 0; frame < 120; frame++) layer.update(1 / 60);
    expect(textures).toHaveLength(1);
    layer.destroy();
  });

  it('C clears bodies after its short scribble', () => {
    const { layer, graphics } = createLayer();
    layer.onDeath(death);
    layer.clear();
    expect(layer.stats().clearing).toBe(true);
    layer.update(0);
    expect(layer.stats().count).toBe(1);
    layer.update(0.12);
    expect(layer.stats().count).toBe(1);
    expect(graphics[2]?.clear).toHaveBeenCalled();
    layer.update(0.14);

    expect(layer.stats().count).toBe(0);
    expect(layer.stats().clearing).toBe(false);
    layer.destroy();
  });

  it('finishes the visible eraser sweep within its route-scaled duration and allows pointer skip', () => {
    vi.stubGlobal('window', fakeWindow);
    const { layer, images, textures } = createLayer();
    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    layer.setVisible(true);
    layer.update(0.06);
    const image = images[0];
    expect(textures[0]?.texture.frames.size).toBe(1);
    const done = vi.fn();
    layer.erase(done);

    const duration = layer.sweepPresentation().duration as number;
    let elapsed = 0;
    while (layer.sweeping && elapsed <= duration + 1 / 60) {
      layer.update(1 / 60);
      elapsed += 1 / 60;
    }
    expect(layer.sweeping).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(duration);
    expect(elapsed).toBeLessThanOrEqual(duration + 1 / 60);
    expect(done).toHaveBeenCalledOnce();
    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
      capture: true,
    });
    expect(image?.setCrop).toHaveBeenCalled();
    expect(textures[0]?.texture.frames.size).toBe(0);
    expect(textures[0]?.destroyed).toBe(true);

    // A second sweep is skipped by the registered global input handler.
    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    const skipped = vi.fn();
    layer.erase(skipped);
    const listener = eventListeners.get('pointerdown');
    vi.stubGlobal('KeyboardEvent', class extends Event {});
    if (typeof listener === 'function') listener(new Event('pointerdown'));
    else listener?.handleEvent(new Event('pointerdown'));
    expect(layer.sweeping).toBe(false);
    expect(skipped).toHaveBeenCalledOnce();
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true },
    );
    layer.destroy();
  });

  it('reports a smooth world-space sweep from the level start to its exit', () => {
    vi.stubGlobal('window', fakeWindow);
    const { scene } = harness();
    const longLevel = makeLongLevel(150);
    const layer = new BodiesLayer(
      scene,
      longLevel,
      30,
      true,
      () => false,
      () => 1,
    );
    layer.onDeath(death);
    layer.pile.freezeAll();
    const follow = vi.fn();
    const done = vi.fn();

    layer.erase(done, follow);

    expect(follow).toHaveBeenCalledTimes(1);
    expect(follow).toHaveBeenLastCalledWith(0);
    expect(layer.sweepPresentation()).toEqual({ worldX: 0, erased: [], duration: 3 });

    layer.update(1.5);
    expect(follow).toHaveBeenLastCalledWith((150 * 64) / 2);
    expect(layer.sweepPresentation()).toEqual({
      worldX: (150 * 64) / 2,
      erased: [0],
      duration: 3,
    });

    layer.update(1.5);
    expect(follow).toHaveBeenLastCalledWith(150 * 64);
    expect(done).toHaveBeenCalledOnce();
    expect(layer.sweepPresentation()).toEqual({ worldX: null, erased: [], duration: null });
    layer.destroy();
  });

  it('uses a 2.8–3.6 second sweep across 140–180 metre routes', () => {
    vi.stubGlobal('window', fakeWindow);
    for (const distance of [140, 180]) {
      const { scene } = harness();
      const layer = new BodiesLayer(
        scene,
        makeLongLevel(distance),
        30,
        true,
        () => false,
        () => 1,
      );
      layer.onDeath(death);
      layer.pile.freezeAll();
      layer.erase(vi.fn());
      const duration = layer.sweepPresentation().duration;
      expect(duration).toBeGreaterThanOrEqual(2.5);
      expect(duration).toBeLessThanOrEqual(4);
      expect(duration).toBeCloseTo(distance / 50, 9);
      layer.destroy();
    }
  });

  it('skips to the end of the world-space sweep on a key and clears listeners', () => {
    vi.stubGlobal('window', fakeWindow);
    class TestKeyboardEvent extends Event {
      readonly repeat = false;
    }
    vi.stubGlobal('KeyboardEvent', TestKeyboardEvent);
    const { scene } = harness();
    const longLevel = makeLongLevel(150);
    const layer = new BodiesLayer(
      scene,
      longLevel,
      30,
      true,
      () => false,
      () => 1,
    );
    layer.onDeath(death);
    layer.pile.freezeAll();
    const follow = vi.fn();
    const done = vi.fn();
    layer.erase(done, follow);

    const listener = eventListeners.get('keydown');
    if (typeof listener === 'function') listener(new TestKeyboardEvent('keydown'));
    else listener?.handleEvent(new TestKeyboardEvent('keydown'));

    expect(follow).toHaveBeenLastCalledWith(150 * 64);
    expect(layer.sweeping).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), {
      capture: true,
    });
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true },
    );
    layer.destroy();
  });

  it('keeps a hidden body hidden while the moving edge partially crops it', () => {
    vi.stubGlobal('window', fakeWindow);
    const { layer, images } = createLayer();
    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    const image = images[0];
    if (!image) throw new Error('hidden body was not baked');
    expect(image.visible).toBe(false);

    const done = vi.fn();
    layer.erase(done);
    expect(layer.visible).toBe(false);
    expect(layer.sweeping).toBe(true);
    expect(done).not.toHaveBeenCalled();

    const duration = layer.sweepPresentation().duration as number;
    const imageLeft = image.x - image.width * image.originX;
    const middleX = imageLeft + image.width / 2;
    const startX = level.bounds.minX * 64;
    const endX = (level.exit?.max.x ?? level.bounds.maxX) * 64;
    const easedProgress = (middleX - startX) / (endX - startX);
    layer.update(duration * inverseSmoothstep(easedProgress));

    const crops = vi.mocked(image.setCrop).mock.calls;
    const latestCrop = crops.at(-1);
    expect(latestCrop).toBeDefined();
    expect(latestCrop?.[0]).toBeGreaterThan(0);
    expect(latestCrop?.[0]).toBeLessThan(image.width);
    expect(latestCrop?.[2]).toBeGreaterThan(0);
    expect(image.visible).toBe(false);

    const remaining = duration * (1 - inverseSmoothstep(easedProgress));
    layer.update(remaining + 1 / 60);
    expect(layer.sweeping).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    layer.destroy();
  });

  it('finishes after one slow frame without catching up frozen body simulation', () => {
    vi.stubGlobal('window', fakeWindow);
    const { layer } = createLayer();
    const body = layer.pile.spawn(death);
    const done = vi.fn();

    layer.erase(done);
    const duration = layer.sweepPresentation().duration as number;
    layer.update(duration + 0.1);

    expect(layer.sweeping).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    expect(body.rag.age).toBe(0);
    expect(layer.stats().count).toBe(0);
    layer.destroy();
  });

  it('uses a short reduced-motion fade and destroy removes listeners and baked textures', () => {
    vi.stubGlobal('window', fakeWindow);
    const { layer, textures, images } = createLayer(true);
    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    const image = images[0];
    const done = vi.fn();
    const follow = vi.fn();
    layer.erase(done, follow);
    expect(layer.sweepPresentation()).toEqual({ worldX: null, erased: [], duration: 0.2 });
    expect(follow).not.toHaveBeenCalled();
    layer.update(0.19);
    expect(layer.sweeping).toBe(true);
    layer.update(0.02);
    expect(image?.alphas.at(-1)).toBeCloseTo(BODY_ALPHA * 0.05);
    expect(layer.sweeping).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    expect(follow).not.toHaveBeenCalled();

    layer.onDeath(death);
    layer.pile.freezeAll();
    layer.setVisible(false);
    layer.update(0.12);
    const remainingImage = images.at(-1);
    const remainingTexture = textures.at(-1);
    layer.erase(vi.fn());
    layer.destroy();
    expect(remainingImage?.destroyed).toBe(true);
    expect(remainingTexture?.destroyed).toBe(true);
    expect(image?.destroyed).toBe(true);
    expect(textures[0]?.destroyed).toBe(true);
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), {
      capture: true,
    });
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true },
    );
  });
});
