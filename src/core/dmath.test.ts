import { describe, expect, it } from 'vitest';
import { dcos, dlen, dsin } from './dmath';

describe('deterministic math', () => {
  it('matches Math.sin/cos to within 1e-13 across many periods', () => {
    for (let x = -50; x <= 50; x += 0.0137) {
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-13);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-13);
    }
  });

  it('computes vector length', () => {
    expect(dlen(3, 4)).toBe(5);
  });
});
