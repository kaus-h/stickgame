/** Simulation tuning. Values live in content/tuning and are validated by the content layer. */
export interface SimTuning {
  /** Gravity in m/s², +y down. */
  readonly gravity: number;
  /** Physics substeps per fixed simulation step (GMR-32 baseline: 4). */
  readonly physicsSubsteps: number;
  readonly player: PlayerTuning;
  readonly rope: RopeTuning;
  /** Optional for legacy direct simulation fixtures; runtime content always supplies it. */
  readonly combat?: CombatTuning;
}

/** Swing-impact damage threshold and normal bounce response (GMR-119). */
export interface CombatTuning {
  /** Closing velocity toward the target required for damage, m/s. */
  readonly minImpactSpeed: number;
  /** Retained share of reflected normal velocity, in [0, 1]. */
  readonly restitution: number;
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
  /** Highlight switches only with this distance advantage, m (default 0.5). */
  readonly stickinessDistance?: number;
  /** Pointing highlight switches only with this angular advantage, degrees (default 12). */
  readonly stickinessAngleDegrees?: number;
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
