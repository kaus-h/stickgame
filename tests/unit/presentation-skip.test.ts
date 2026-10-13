import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenPresentationSkip } from '../../src/render/living/presentationSkip';

class Key extends Event {
  readonly code = 'Enter';
  constructor(readonly repeat = false) {
    super('keydown', { cancelable: true });
  }
}
afterEach(() => vi.unstubAllGlobals());
describe('completion presentation skip input', () => {
  it('consumes keys and taps before gameplay and unsubscribes after completion', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.stubGlobal('KeyboardEvent', Key);
    let skips = 0,
      gameplay = 0;
    const stop = listenPresentationSkip(() => {
      skips++;
      if (skips === 1) target.addEventListener('keydown', () => gameplay++);
    });
    const key = new Key();
    target.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(skips).toBe(1);
    expect(gameplay).toBe(0);
    const tap = new Event('pointerdown', { cancelable: true });
    target.dispatchEvent(tap);
    expect(tap.defaultPrevented).toBe(true);
    expect(skips).toBe(2);
    stop();
    const held = new Key(true);
    target.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    const release = new Key();
    Object.defineProperty(release, 'type', { value: 'keyup' });
    target.dispatchEvent(release);
    target.dispatchEvent(new Key());
    expect(skips).toBe(2);
    expect(gameplay).toBe(1);
  });
  it('consumes held-key repeats without skipping the next stage', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.stubGlobal('KeyboardEvent', Key);
    let skips = 0,
      gameplay = 0;
    const stop = listenPresentationSkip(() => skips++);
    target.addEventListener('keydown', () => gameplay++);
    const key = new Key(true);
    target.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(skips).toBe(0);
    expect(gameplay).toBe(0);
    stop();
  });
});
