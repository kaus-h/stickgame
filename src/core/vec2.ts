/** Immutable 2D vector in simulation units (meters). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);

export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);

export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));
