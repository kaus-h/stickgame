import type { Vec2 } from '../core';

/** Simulation tuning. Values live in content/tuning and are validated by the content layer. */
export interface SimTuning {
  /** Gravity in m/s², +y down. */
  readonly gravity: number;
  /** Physics substeps per fixed simulation step (evaluated in GMR-32). */
  readonly physicsSubsteps: number;
  /** Timing probe used by the runtime lab to make frame-rate effects visible. Removed once real bodies exist. */
  readonly probe: {
    readonly start: Vec2;
    readonly velocity: Vec2;
    readonly bounds: { readonly minX: number; readonly maxX: number; readonly floorY: number };
    readonly restitution: number;
  };
}
