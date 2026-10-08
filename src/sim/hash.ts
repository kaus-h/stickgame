import type { SimSnapshot } from './Simulation';

const scratch = new DataView(new ArrayBuffer(8));
const MODES = { grounded: 1, air: 2, tethered: 3 } as const;

/**
 * Stable 32-bit FNV-1a hash of the state-relevant numbers in a snapshot, fed with exact IEEE-754
 * bits, so any single-ulp drift in position, velocity, rope or anchors changes the hash. Aim and
 * target are derived presentation state and are not hashed.
 */
export function hashSnapshot(s: SimSnapshot): string {
  let h = 0x811c9dc5;
  const byte = (b: number): void => {
    h = Math.imul(h ^ (b & 0xff), 0x01000193);
  };
  const int32 = (n: number): void => {
    byte(n);
    byte(n >>> 8);
    byte(n >>> 16);
    byte(n >>> 24);
  };
  const f64 = (n: number): void => {
    scratch.setFloat64(0, n, true);
    int32(scratch.getUint32(0, true));
    int32(scratch.getUint32(4, true));
  };

  int32(s.tick);
  int32(s.attemptTick);
  int32(s.resets);
  int32(s.deaths);
  int32(MODES[s.player.mode]);
  int32(s.player.facing);
  f64(s.player.position.x);
  f64(s.player.position.y);
  f64(s.player.velocity.x);
  f64(s.player.velocity.y);
  if (s.rope) {
    int32(1);
    int32(s.rope.anchor);
    f64(s.rope.point.x);
    f64(s.rope.point.y);
    f64(s.rope.length);
    int32(s.rope.locked ? 1 : 0);
    int32(s.rope.taut ? 1 : 0);
    int32(s.rope.attachedTick);
  } else {
    int32(0);
  }
  for (const a of s.anchors) {
    f64(a.x);
    f64(a.y);
  }
  // Null entry state adds no bytes, preserving all historical replay hashes.
  for (const record of [s.completion, s.lastExitAttempt]) {
    if (!record) continue;
    int32(record === s.completion ? 0x45584954 : 0x4d495353);
    for (const text of [record.exitId, record.family, record.reason ?? '']) {
      int32(text.length);
      for (let i = 0; i < text.length; i++) int32(text.charCodeAt(i));
    }
    int32(record.tick);
    int32(record.accepted ? 1 : 0);
    f64(record.at.x);
    f64(record.at.y);
    f64(record.velocity.x);
    f64(record.velocity.y);
    f64(record.speed);
    f64(record.angleCos);
    f64(record.alignment);
    if ('attemptTicks' in record && typeof record.attemptTicks === 'number')
      int32(record.attemptTicks);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
