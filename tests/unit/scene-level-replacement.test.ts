import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import lab01 from '../../content/levels/lab-01.json';
import { parseLevel } from '../../src/content';
import type { FrameSource } from '../../src/render/frame';

vi.mock('phaser', () => ({
  Scene: class {
    readonly events = new EventEmitter();
    readonly scale = Object.assign(new EventEmitter(), { width: 800, height: 600 });
    readonly input = { keyboard: new EventEmitter() };
    readonly children = { list: [] };
    readonly cameras = { main: this.fluent(), add: () => this.fluent() };
    readonly add = {
      graphics: () => this.fluent(),
      text: () => this.fluent(),
      tileSprite: () => this.fluent(),
      image: () => this.fluent(),
    };
    readonly scene = {
      restart: () => {
        this.events.emit('shutdown');
        (this as unknown as { create(): void }).create();
      },
    };
    private fluent(): unknown {
      const object = new Proxy({}, { get: () => () => object });
      return object;
    }
  },
}));

import { GameScene } from '../../src/render/scenes/GameScene';

describe('GameScene level replacement lifecycle', () => {
  it('rebuilds page art without accumulating resize, keyboard or simulation subscriptions', () => {
    const level = parseLevel(lab01);
    let subscribers = 0;
    const onEvents = () => {
      subscribers++;
      return () => {
        subscribers--;
      };
    };
    const scene = new GameScene({ level, source: {} as FrameSource, onEvents, debug: true });
    const draw = vi
      .spyOn(scene as unknown as { drawStaticPage(): void }, 'drawStaticPage')
      .mockImplementation(() => {});
    scene.create();
    for (let i = 0; i < 10; i++) {
      scene.replaceLevel({ ...level, name: `Revision ${String(i)}` });
      expect(subscribers).toBe(1);
      expect(scene.scale.listenerCount('resize')).toBe(1);
      expect(scene.input.keyboard?.listenerCount('keydown-BACKTICK')).toBe(1);
    }
    expect(draw).toHaveBeenCalledTimes(11);
    scene.events.emit('shutdown');
    expect(subscribers).toBe(0);
    expect(scene.scale.listenerCount('resize')).toBe(0);
    expect(scene.input.keyboard?.listenerCount('keydown-BACKTICK')).toBe(0);
  });
});
