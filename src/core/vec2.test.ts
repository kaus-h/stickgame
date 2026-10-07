import { describe, expect, it } from 'vitest';
import { add, distance, dot, length, scale, sub, vec2 } from './vec2';

describe('vec2', () => {
  it('adds, subtracts and scales', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual(vec2(-2, -2));
    expect(scale(vec2(1, -2), 3)).toEqual(vec2(3, -6));
  });

  it('measures length, dot product and distance', () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(distance(vec2(0, 0), vec2(6, 8))).toBe(10);
  });
});
