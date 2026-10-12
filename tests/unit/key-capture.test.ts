import { describe, expect, it } from 'vitest';
import { captureNextKey } from '../../src/app/web/ui/keyCapture';

/** Node has EventTarget but no KeyboardEvent; this carries the fields the helper reads. */
function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type, { cancelable: true }), { code, repeat });
}

/** A window stand-in with a gameplay listener registered after the capture (bubble order). */
function setup() {
  const target = new EventTarget();
  const captured: string[] = [];
  const reached: string[] = [];
  const cancel = captureNextKey(target, (code) => captured.push(code));
  for (const type of ['keydown', 'keyup'])
    target.addEventListener(type, (e) => reached.push(`${type} ${(e as KeyboardEvent).code}`));
  return { target, captured, reached, cancel };
}

describe('key capture for remapping (GMR-50)', () => {
  it('swallows the captured keydown, its repeats and its paired keyup', () => {
    const { target, captured, reached } = setup();
    target.dispatchEvent(key('keydown', 'Space'));
    target.dispatchEvent(key('keydown', 'Space', true));
    target.dispatchEvent(key('keyup', 'Space'));
    expect(captured).toEqual(['Space']);
    expect(reached).toEqual([]); // no jumpPress, no jumpRelease
    // Released: the next Space is gameplay again.
    target.dispatchEvent(key('keydown', 'Space'));
    target.dispatchEvent(key('keyup', 'Space'));
    expect(captured).toEqual(['Space']);
    expect(reached).toEqual(['keydown Space', 'keyup Space']);
  });

  it('lets Tab through for focus navigation and lets other keys release normally', () => {
    const { target, captured, reached } = setup();
    target.dispatchEvent(key('keydown', 'Tab'));
    target.dispatchEvent(key('keyup', 'Tab'));
    target.dispatchEvent(key('keydown', 'KeyK'));
    target.dispatchEvent(key('keyup', 'KeyD')); // a key held from before the capture
    target.dispatchEvent(key('keyup', 'KeyK'));
    expect(captured).toEqual(['KeyK']);
    expect(reached).toEqual(['keydown Tab', 'keyup Tab', 'keyup KeyD']);
  });

  it('cancel removes every listener', () => {
    const { target, captured, reached, cancel } = setup();
    cancel();
    target.dispatchEvent(key('keydown', 'KeyJ'));
    expect(captured).toEqual([]);
    expect(reached).toEqual(['keydown KeyJ']);
  });
});
