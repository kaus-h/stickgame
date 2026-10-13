import { describe, expect, it } from 'vitest';
import { renderRoomTone } from '../../src/audio/ambience';

describe('room tone', () => {
  it('renders the same quiet, bounded loop every time', () => {
    const a = renderRoomTone(8000, 4);
    const b = renderRoomTone(8000, 4);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8000 * 3);
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(0.9001);
  });
  it('loops without a click: the seam is no larger than an ordinary step', () => {
    const a = renderRoomTone(8000, 4);
    let step = 0;
    for (let i = 1; i < a.length; i++)
      step = Math.max(step, Math.abs((a[i] ?? 0) - (a[i - 1] ?? 0)));
    expect(Math.abs((a[0] ?? 0) - (a[a.length - 1] ?? 0))).toBeLessThanOrEqual(step * 1.5);
  });
});
