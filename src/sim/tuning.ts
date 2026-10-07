/** Simulation tuning. Values live in content/tuning and are validated by the content layer. */
export interface SimTuning {
  /** Gravity in m/s², +y down. */
  readonly gravity: number;
  /** Physics substeps per fixed simulation step (GMR-32 baseline: 4). */
  readonly physicsSubsteps: number;
  readonly player: PlayerTuning;
  readonly rope: RopeTuning;
}

/** Base controller (GMR-20). Every value is PROTOTYPE REQUIRED in doc 09 until the movement lab sets it. */
export interface PlayerTuning {
  readonly radius: number;
  /** Top running speed, m/s. */
  readonly runSpeed: number;
  /** Ground acceleration toward the input direction, m/s². */
  readonly groundAccel: number;
  /** Ground deceleration with no input or when reversing, m/s². */
  readonly groundDecel: number;
  /** Air acceleration toward the input direction, m/s². Never brakes momentum above airMaxSpeed. */
  readonly airAccel: number;
  readonly airMaxSpeed: number;
  /** Jump take-off speed, m/s. */
  readonly jumpSpeed: number;
  /** Multiplier on upward speed when jump is released early (variable jump height). */
  readonly jumpCut: number;
  /** Extra gravity while falling, as a multiple of gravity (1 = none). */
  readonly fallGravityScale: number;
  readonly maxFallSpeed: number;
  /** Ticks after leaving the ground during which a jump still works. */
  readonly coyoteTicks: number;
  /** Ticks a jump press is remembered before landing. */
  readonly jumpBufferTicks: number;
}

/** Rope rules (GMR-21/22). */
export interface RopeTuning {
  readonly minLength: number;
  readonly maxLength: number;
  /** Aim selection radius around an anchor, m (selection tolerance, separate from impact point). */
  readonly selectRadius: number;
  /** Small horizontal steering while swinging, m/s² (no unlimited pumping, doc 09 B3). */
  readonly steerAccel: number;
  /**
   * Steering may add at most this much swing energy over the energy at connection, expressed as
   * metres of height (g·h per unit mass). Caps pumping so the shot, not wiggling, sets the swing.
   */
  readonly steerEnergyHeight: number;
  /**
   * Share of outward speed redirected into the swing when the rope snaps taut (0 = inelastic,
   * 1 = speed kept). Owner direction 2026-10-07: run/jump momentum transfers into the swing.
   */
  readonly catchRetention: number;
}
