import { describe, expect, it } from 'vitest';
import { vec2, type Intent } from '../core';
import {
  computeLayout,
  TouchInputMapper,
  type TouchControlId,
  type TouchOptions,
} from './TouchInputMapper';

/** Screen px → world m: 1 m = 50 px, plus a camera offset the tests can move. */
function setup(options: Partial<TouchOptions> = {}, width = 844, height = 390) {
  const out: Intent[] = [];
  const camera = { x: 0, y: 0 };
  const mapper = new TouchInputMapper(
    (i) => out.push(i),
    (x, y) => vec2(x / 50 + camera.x, y / 50 + camera.y),
    options,
  );
  mapper.setViewport(width, height);
  const at = (id: TouchControlId) => {
    const c = mapper.layout().controls.find((k) => k.id === id);
    if (!c) throw new Error(`no control ${id}`);
    return c;
  };
  const types = () => out.map((i) => i.type);
  const take = () => out.splice(0, out.length);
  return { mapper, out, at, types, take, camera };
}

const PLAY = { x: 520, y: 90 }; // upper middle: not a control, not the move zone

describe('TouchInputMapper: direct-touch', () => {
  it('overlapping move, jump and rope on three fingers produce independent intents', () => {
    const { mapper, at, take } = setup();
    const right = at('right');
    const jump = at('jump');
    mapper.pointerDown(1, right.x, right.y);
    mapper.pointerDown(2, jump.x, jump.y);
    mapper.pointerDown(3, PLAY.x, PLAY.y);
    expect(take()).toEqual([
      { type: 'move', axis: 1 },
      { type: 'jumpPress' },
      { type: 'ropeAim', target: vec2(PLAY.x / 50, PLAY.y / 50) },
      { type: 'ropePress' },
    ]);
    // Lift in a different order: each finger releases only its own verb.
    mapper.pointerUp(2);
    expect(take()).toEqual([{ type: 'jumpRelease' }]);
    mapper.pointerUp(3);
    expect(take()).toEqual([{ type: 'ropeRelease' }]);
    mapper.pointerUp(1);
    expect(take()).toEqual([{ type: 'move', axis: 0 }]);
  });

  it('the touch point is the aim, connect on touch-down, re-aim each tick under a moving camera', () => {
    const { mapper, take, camera } = setup();
    mapper.pointerDown(7, 400, 100);
    expect(take()).toEqual([{ type: 'ropeAim', target: vec2(8, 2) }, { type: 'ropePress' }]);
    mapper.beforeTick();
    expect(take()).toEqual([]); // nothing moved
    mapper.pointerMove(7, 450, 100);
    expect(take()).toEqual([]); // re-aims on the tick, like the desktop mouse
    mapper.beforeTick();
    expect(take()).toEqual([{ type: 'ropeAim', target: vec2(9, 2) }]);
    camera.x = 1;
    mapper.beforeTick();
    expect(take()).toEqual([{ type: 'ropeAim', target: vec2(10, 2) }]);
  });

  it('digital move: sliding the thumb across the split flips the axis without lifting', () => {
    const { mapper, at, take } = setup();
    const l = at('left');
    const r = at('right');
    mapper.pointerDown(1, l.x, l.y);
    mapper.pointerMove(1, r.x, r.y);
    mapper.pointerMove(1, r.x + 5, r.y);
    mapper.pointerMove(1, l.x, l.y);
    expect(take()).toEqual([
      { type: 'move', axis: -1 },
      { type: 'move', axis: 1 },
      { type: 'move', axis: -1 },
    ]);
  });

  it('a second play-area finger does not re-shoot or steal the rope', () => {
    const { mapper, take, types } = setup();
    mapper.pointerDown(1, PLAY.x, PLAY.y);
    take();
    mapper.pointerDown(2, PLAY.x + 100, PLAY.y);
    mapper.pointerMove(2, PLAY.x + 120, PLAY.y);
    mapper.beforeTick();
    expect(types()).toEqual([]);
    mapper.pointerUp(2);
    expect(types()).toEqual([]); // rope still held by finger 1
    mapper.pointerUp(1);
    expect(take()).toEqual([{ type: 'ropeRelease' }]);
  });

  it('two fingers on jump: release only when the last one lifts', () => {
    const { mapper, at, take } = setup();
    const j = at('jump');
    mapper.pointerDown(1, j.x, j.y);
    mapper.pointerDown(2, j.x + 10, j.y);
    mapper.pointerUp(1);
    expect(take()).toEqual([{ type: 'jumpPress' }]);
    mapper.pointerUp(2);
    expect(take()).toEqual([{ type: 'jumpRelease' }]);
  });

  it('pointer cancel releases exactly like lifting', () => {
    const { mapper, at, take } = setup();
    const r = at('right');
    const j = at('jump');
    mapper.pointerDown(1, r.x, r.y);
    mapper.pointerDown(2, j.x, j.y);
    mapper.pointerDown(3, PLAY.x, PLAY.y);
    take();
    mapper.pointerCancel(3);
    mapper.pointerCancel(2);
    mapper.pointerCancel(1);
    expect(take()).toEqual([
      { type: 'ropeRelease' },
      { type: 'jumpRelease' },
      { type: 'move', axis: 0 },
    ]);
    // Late events for cancelled pointers are ignored.
    mapper.pointerMove(3, 10, 10);
    mapper.pointerUp(3);
    mapper.beforeTick();
    expect(take()).toEqual([]);
  });

  it('blur releases everything and forgets every touch', () => {
    const { mapper, at, take } = setup();
    const r = at('right');
    const j = at('jump');
    mapper.pointerDown(1, r.x, r.y);
    mapper.pointerDown(2, j.x, j.y);
    mapper.pointerDown(3, PLAY.x, PLAY.y);
    take();
    mapper.blur();
    expect(take()).toEqual([
      { type: 'jumpRelease' },
      { type: 'ropeRelease' },
      { type: 'move', axis: 0 },
    ]);
    mapper.pointerUp(1);
    mapper.pointerUp(2);
    mapper.pointerUp(3);
    expect(take()).toEqual([]);
    expect(mapper.state().touches).toEqual([]);
  });

  it('a repeated down for a held id (lost up event) releases first, never sticks', () => {
    const { mapper, take } = setup();
    mapper.pointerDown(1, PLAY.x, PLAY.y);
    mapper.pointerDown(1, PLAY.x + 10, PLAY.y);
    expect(take().map((i) => i.type)).toEqual([
      'ropeAim',
      'ropePress',
      'ropeRelease',
      'ropeAim',
      'ropePress',
    ]);
  });

  it('pause and restart buttons emit their UI intents and nothing else', () => {
    const { mapper, at, take } = setup();
    const p = at('pause');
    const r = at('restart');
    mapper.pointerDown(1, p.x, p.y);
    mapper.pointerUp(1);
    mapper.pointerDown(2, r.x, r.y);
    mapper.pointerUp(2);
    expect(take()).toEqual([{ type: 'pause' }, { type: 'restart' }]);
  });
});

describe('TouchInputMapper: reticle-offset', () => {
  it('aims above the finger by the configured offset and reports the reticle', () => {
    const { mapper, take } = setup({ scheme: 'reticle-offset', reticleOffset: 60 });
    mapper.pointerDown(1, 400, 200);
    expect(take()).toEqual([{ type: 'ropeAim', target: vec2(8, 140 / 50) }, { type: 'ropePress' }]);
    const s = mapper.state();
    expect(s.reticle).toEqual({ x: 400, y: 140 });
    expect(s.leaderFrom).toEqual({ x: 400, y: 200 });
    mapper.pointerMove(1, 420, 210);
    mapper.beforeTick();
    expect(take()).toEqual([{ type: 'ropeAim', target: vec2(420 / 50, 150 / 50) }]);
    mapper.pointerUp(1);
    expect(take()).toEqual([{ type: 'ropeRelease' }]);
    expect(mapper.state().reticle).toBeNull();
  });

  it('the offset scales with the control scale and clamps at the top edge', () => {
    const { mapper, take } = setup({ scheme: 'reticle-offset', reticleOffset: 60, scale: 1.5 });
    mapper.pointerDown(1, 400, 50);
    expect(take()[0]).toEqual({ type: 'ropeAim', target: vec2(8, 0) });
  });
});

describe('TouchInputMapper: drag-aim', () => {
  it('play-area drags move the cursor relatively without touching the rope', () => {
    const { mapper, take, types } = setup({ scheme: 'drag-aim', dragGain: 2 });
    mapper.activate();
    mapper.beforeTick();
    const start = mapper.state().reticle;
    expect(start).not.toBeNull();
    take();
    mapper.pointerDown(1, 500, 150);
    expect(types()).toEqual([]);
    mapper.pointerMove(1, 510, 145);
    const moved = mapper.state().reticle;
    expect(moved).toEqual({ x: (start?.x ?? 0) + 20, y: (start?.y ?? 0) - 10 });
    expect(take()).toEqual([
      { type: 'ropeAim', target: vec2((moved?.x ?? 0) / 50, (moved?.y ?? 0) / 50) },
    ]);
    mapper.pointerUp(1);
    expect(types()).toEqual([]);
  });

  it('the rope button is hold-to-tether at the cursor; dragging it lines up the next shot', () => {
    const { mapper, at, take } = setup({ scheme: 'drag-aim', dragGain: 1 });
    const rope = at('rope');
    mapper.activate();
    mapper.beforeTick();
    const cursor = mapper.state().reticle ?? { x: 0, y: 0 };
    take();
    mapper.pointerDown(4, rope.x, rope.y);
    expect(take()).toEqual([
      { type: 'ropeAim', target: vec2(cursor.x / 50, cursor.y / 50) },
      { type: 'ropePress' },
    ]);
    expect(mapper.state().controls.find((c) => c.id === 'rope')?.pressed).toBe(true);
    mapper.pointerMove(4, rope.x - 30, rope.y);
    expect(take()).toEqual([
      { type: 'ropeAim', target: vec2((cursor.x - 30) / 50, cursor.y / 50) },
    ]);
    mapper.pointerUp(4);
    expect(take()).toEqual([{ type: 'ropeRelease' }]);
  });

  it('jump, move and a rope hold overlap; play-area touches never press the rope', () => {
    const { mapper, at, types, take } = setup({ scheme: 'drag-aim' });
    mapper.pointerDown(1, at('left').x, at('left').y);
    mapper.pointerDown(2, at('rope').x, at('rope').y);
    mapper.pointerDown(3, at('jump').x, at('jump').y);
    mapper.pointerDown(5, PLAY.x, PLAY.y);
    expect(types()).toEqual(['move', 'ropeAim', 'ropePress', 'jumpPress']);
    take();
    mapper.pointerUp(5);
    mapper.pointerUp(3);
    mapper.pointerUp(2);
    mapper.pointerUp(1);
    expect(types()).toEqual(['jumpRelease', 'ropeRelease', 'move']);
  });
});

describe('TouchInputMapper: analog move', () => {
  it('maps thumb offset to a quantised axis with a dead zone', () => {
    const { mapper, at, take } = setup({ moveStyle: 'analog', deadzone: 0.2 });
    const s = at('stick');
    mapper.pointerDown(1, s.x + s.r * 0.1, s.y);
    expect(take()).toEqual([]); // inside the dead zone
    mapper.pointerMove(1, s.x + s.r * 0.6, s.y);
    expect(take()).toEqual([{ type: 'move', axis: 0.5 }]);
    mapper.pointerMove(1, s.x - s.r * 3, s.y);
    expect(take()).toEqual([{ type: 'move', axis: -1 }]);
    const knob = mapper.state().controls.find((c) => c.id === 'stick')?.knob;
    expect(knob?.x).toBeCloseTo(s.x - s.r, 9);
    mapper.pointerUp(1);
    expect(take()).toEqual([{ type: 'move', axis: 0 }]);
  });
});

describe('TouchInputMapper: scheme switching', () => {
  it('switching mid-hold releases every verb cleanly and ignores the old touches', () => {
    const { mapper, at, take } = setup();
    mapper.pointerDown(1, at('right').x, at('right').y);
    mapper.pointerDown(2, at('jump').x, at('jump').y);
    mapper.pointerDown(3, PLAY.x, PLAY.y);
    take();
    mapper.setScheme('drag-aim');
    expect(take()).toEqual([
      { type: 'jumpRelease' },
      { type: 'ropeRelease' },
      { type: 'move', axis: 0 },
    ]);
    // Old fingers keep moving and lift: nothing leaks into the new scheme.
    mapper.pointerMove(1, at('left').x, at('left').y);
    mapper.pointerMove(3, PLAY.x + 50, PLAY.y);
    mapper.pointerUp(1);
    mapper.pointerUp(2);
    mapper.pointerUp(3);
    expect(take()).toEqual([]);
    // A fresh touch works under the new scheme (play area = aim drag, no rope press).
    mapper.pointerDown(9, PLAY.x, PLAY.y);
    expect(take()).toEqual([]);
    expect(mapper.options.scheme).toBe('drag-aim');
  });

  it('switching move style mid-hold releases the axis', () => {
    const { mapper, at, take } = setup();
    mapper.pointerDown(1, at('left').x, at('left').y);
    take();
    mapper.setMoveStyle('analog');
    expect(take()).toEqual([{ type: 'move', axis: 0 }]);
    expect(mapper.layout().controls.some((c) => c.id === 'stick')).toBe(true);
  });

  it('switching to the same scheme is a no-op', () => {
    const { mapper, take } = setup();
    mapper.pointerDown(1, PLAY.x, PLAY.y);
    take();
    mapper.setScheme('direct-touch');
    expect(take()).toEqual([]);
  });
});

describe('computeLayout', () => {
  it('keeps every control inside the safe area on 844x390 and 800x360', () => {
    const insets = { top: 0, right: 47, bottom: 21, left: 47 };
    for (const [w, h] of [
      [844, 390],
      [800, 360],
    ] as const) {
      for (const scheme of ['direct-touch', 'drag-aim'] as const) {
        for (const moveStyle of ['digital', 'analog'] as const) {
          const l = computeLayout(w, h, insets, { scheme, moveStyle, scale: 1 });
          for (const c of l.controls) {
            expect(c.x - c.r).toBeGreaterThanOrEqual(insets.left);
            expect(c.x + c.r).toBeLessThanOrEqual(w - insets.right);
            expect(c.y + c.r).toBeLessThanOrEqual(h - insets.bottom);
            expect(c.y - c.r).toBeGreaterThanOrEqual(insets.top);
          }
          // Drawn controls never overlap each other.
          for (const a of l.controls)
            for (const b of l.controls)
              if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
        }
      }
    }
  });

  it('scales controls with the scale option', () => {
    const a = computeLayout(
      844,
      390,
      { top: 0, right: 0, bottom: 0, left: 0 },
      {
        scheme: 'direct-touch',
        moveStyle: 'digital',
        scale: 1,
      },
    );
    const b = computeLayout(
      844,
      390,
      { top: 0, right: 0, bottom: 0, left: 0 },
      {
        scheme: 'direct-touch',
        moveStyle: 'digital',
        scale: 1.3,
      },
    );
    const jump = (l: typeof a) => l.controls.find((c) => c.id === 'jump')?.r ?? 0;
    expect(jump(b)).toBeCloseTo(jump(a) * 1.3, 9);
  });
});
