import { describe, expect, it } from 'vitest';
import { vec2, type Intent } from '../core';
import { DesktopInputMapper } from './DesktopInputMapper';

function setup(offset = 0) {
  const out: Intent[] = [];
  const cam = { offset };
  const mapper = new DesktopInputMapper(
    (i) => out.push(i),
    (x, y) => vec2(x / 64 + cam.offset, y / 64),
  );
  return { out, mapper, cam };
}

describe('DesktopInputMapper', () => {
  it('emits move only when the axis changes and cancels opposite keys', () => {
    const { out, mapper } = setup();
    mapper.keyDown('KeyD');
    mapper.keyDown('ArrowRight');
    mapper.keyDown('KeyA');
    mapper.keyUp('KeyD');
    mapper.keyUp('ArrowRight');
    expect(out).toEqual([
      { type: 'move', axis: 1 },
      { type: 'move', axis: 0 },
      { type: 'move', axis: -1 },
    ]);
  });

  it('emits jump press once per press and release when the last jump key is released', () => {
    const { out, mapper } = setup();
    mapper.keyDown('Space');
    mapper.keyDown('Space', true);
    mapper.keyDown('KeyW');
    mapper.keyUp('Space');
    mapper.keyUp('KeyW');
    expect(out).toEqual([{ type: 'jumpPress' }, { type: 'jumpPress' }, { type: 'jumpRelease' }]);
  });

  it('Backspace respawns at the checkpoint and G toggles the ghost (GMR-103)', () => {
    const { out, mapper } = setup();
    mapper.keyDown('Backspace');
    mapper.keyDown('Backspace', true);
    mapper.keyDown('KeyG');
    mapper.keyDown('KeyR');
    expect(out).toEqual([{ type: 'respawn' }, { type: 'ghostToggle' }, { type: 'restart' }]);
  });

  it('aims in world space at press time and holds the rope until release', () => {
    const { out, mapper } = setup();
    mapper.pointerDown(128, 64, 0);
    mapper.pointerUp(0);
    expect(out).toEqual([
      { type: 'ropeAim', target: vec2(2, 1) },
      { type: 'ropePress' },
      { type: 'ropeRelease' },
    ]);
  });

  it('re-aims each tick when the camera moves under a still pointer', () => {
    const { out, mapper, cam } = setup();
    mapper.pointerMove(64, 64);
    mapper.beforeTick();
    mapper.beforeTick();
    cam.offset = 3;
    mapper.beforeTick();
    expect(out).toEqual([
      { type: 'ropeAim', target: vec2(1, 1) },
      { type: 'ropeAim', target: vec2(4, 1) },
    ]);
  });

  it('releases everything on blur so nothing stays stuck', () => {
    const { out, mapper } = setup();
    mapper.keyDown('KeyD');
    mapper.keyDown('Space');
    mapper.pointerDown(0, 0, 0);
    out.length = 0;
    mapper.blur();
    expect(out).toEqual([
      { type: 'jumpRelease' },
      { type: 'ropeRelease' },
      { type: 'move', axis: 0 },
    ]);
  });

  it('ignores non-primary mouse buttons', () => {
    const { out, mapper } = setup();
    mapper.pointerDown(0, 0, 2);
    mapper.pointerUp(2);
    expect(out).toEqual([]);
  });
});
