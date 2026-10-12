import { describe, expect, it } from 'vitest';
import { vec2, type Intent } from '../../src/core';
import { DesktopInputMapper } from '../../src/input/DesktopInputMapper';
import {
  assignKey,
  DEFAULT_DESKTOP_BINDINGS,
  RESERVED,
  resolveBindings,
} from '../../src/input/bindings';

describe('keyboard remapping (GMR-50)', () => {
  it('merges overrides without changing default keys, including the unassigned rope action', () => {
    const merged = resolveBindings({ left: ['KeyJ'], rope: ['KeyF'] });
    expect(merged).toMatchObject({
      left: ['KeyJ'],
      right: ['KeyD', 'ArrowRight'],
      jump: ['Space', 'KeyW', 'ArrowUp'],
      rope: ['KeyF'],
      pause: ['Escape', 'KeyP'],
    });
    expect(resolveBindings()).toEqual(DEFAULT_DESKTOP_BINDINGS);
    expect(resolveBindings().rope).toEqual([]);
  });

  it('assigns only the new key and removes it from every other action', () => {
    const changed = assignKey(resolveBindings(), 'rope', 'KeyA');
    expect(changed.rope).toEqual(['KeyA']);
    expect(changed.left).toEqual(['ArrowLeft']);
    expect(assignKey(changed, 'right', 'KeyA').rope).toEqual([]);
    expect(assignKey(changed, 'right', 'KeyA').right).toEqual(['KeyA']);
    const all = Object.values(changed)
      .flat()
      .filter((code) => code !== 'Escape');
    expect(new Set(all).size).toBe(all.length);
  });

  it('explicit overrides steal default keys and never duplicate intents', () => {
    const merged = resolveBindings({ rope: ['Space'] });
    expect(merged.rope).toEqual(['Space']);
    expect(merged.jump).toEqual(['KeyW', 'ArrowUp']);
    const conflict = resolveBindings({ left: ['KeyQ'], right: ['KeyQ'] });
    expect(conflict.left).toEqual(['KeyQ']);
    expect(conflict.right).toEqual([]);
  });

  it('keeps Escape exclusively reserved for Pause; Tab cannot be bound', () => {
    expect(RESERVED).toEqual(['Escape']);
    expect(assignKey(resolveBindings(), 'jump', 'Escape')).toEqual(resolveBindings());
    expect(assignKey(resolveBindings(), 'rope', 'Tab')).toEqual(resolveBindings());
    const changed = assignKey(resolveBindings(), 'pause', 'KeyQ');
    expect(changed.pause).toEqual(['Escape', 'KeyQ']);
    expect(resolveBindings({ rope: ['Escape'], pause: [] }).rope).toEqual([]);
    expect(resolveBindings({ rope: ['Escape'], pause: [] }).pause).toEqual(['Escape']);
  });

  it('keyboard rope aims at the current world pointer and releases like the mouse', () => {
    const out: Intent[] = [];
    const camera = { offset: 2 };
    const mapper = new DesktopInputMapper(
      (intent) => out.push(intent),
      (x, y) => vec2(x / 64 + camera.offset, y / 64),
    );
    mapper.setBindings(resolveBindings({ rope: ['KeyF'] }));
    mapper.pointerMove(128, 64);
    mapper.keyDown('KeyF');
    mapper.keyDown('KeyF', true);
    mapper.keyUp('KeyF');
    expect(out).toEqual([
      { type: 'ropeAim', target: vec2(4, 1) },
      { type: 'ropePress' },
      { type: 'ropeRelease' },
    ]);
    out.length = 0;
    camera.offset = 3;
    mapper.pointerDown(128, 64, 0);
    mapper.pointerUp(0);
    expect(out).toEqual([
      { type: 'ropeAim', target: vec2(5, 1) },
      { type: 'ropePress' },
      { type: 'ropeRelease' },
    ]);
  });

  it('does not release a rope while the other input source is still holding it', () => {
    const out: Intent[] = [];
    const mapper = new DesktopInputMapper(
      (intent) => out.push(intent),
      (x, y) => vec2(x, y),
    );
    mapper.setBindings(resolveBindings({ rope: ['KeyF'] }));
    mapper.pointerMove(8, 16);
    mapper.keyDown('KeyF');
    mapper.pointerDown(8, 16, 0);
    mapper.keyUp('KeyF');
    expect(out.filter((intent) => intent.type === 'ropeRelease')).toEqual([]);
    mapper.pointerUp(0);
    expect(out.filter((intent) => intent.type === 'ropePress')).toHaveLength(1);
    expect(out.filter((intent) => intent.type === 'ropeRelease')).toHaveLength(1);
  });

  it('switching bindings releases any held keyboard state and keeps Escape working', () => {
    const out: Intent[] = [];
    const mapper = new DesktopInputMapper(
      (intent) => out.push(intent),
      (x, y) => vec2(x, y),
    );
    mapper.pointerMove(10, 20);
    mapper.setBindings(resolveBindings({ rope: ['KeyF'] }));
    mapper.keyDown('KeyF');
    mapper.keyDown('KeyA');
    mapper.keyDown('Space');
    out.length = 0;
    mapper.setBindings(resolveBindings({ left: ['KeyJ'], rope: ['KeyH'] }));
    expect(out).toEqual([
      { type: 'jumpRelease' },
      { type: 'ropeRelease' },
      { type: 'move', axis: 0 },
    ]);
    mapper.keyDown('Escape');
    expect(out.at(-1)).toEqual({ type: 'pause' });
  });
});
