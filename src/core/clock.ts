export interface FixedStepPolicy {
  /** Simulation step in seconds (1/60 per ADR-001 Amendment 1). */
  readonly dt: number;
  /** Most simulation steps run for one rendered frame; extra time is dropped to avoid a spiral of death. */
  readonly maxStepsPerFrame: number;
  /** Longest frame delta accepted, in seconds (tab switches and debugger pauses are clamped to this). */
  readonly maxFrameDelta: number;
}

export interface ClockAdvance {
  /** Simulation steps to run this frame. */
  readonly steps: number;
  /** Interpolation factor between the previous and current simulation state, in [0, 1). */
  readonly alpha: number;
  /** Seconds discarded this frame by the frame-delta clamp or the step cap. */
  readonly droppedSeconds: number;
}

/**
 * Fixed-step accumulator. The caller feeds it real frame time; it decides how many fixed simulation
 * steps to run. It never reads a clock itself, so it stays deterministic and testable.
 */
export class FixedStepClock {
  private accumulator = 0;

  constructor(readonly policy: FixedStepPolicy) {
    if (policy.dt <= 0) throw new Error('dt must be positive');
    if (policy.maxStepsPerFrame < 1) throw new Error('maxStepsPerFrame must be at least 1');
  }

  advance(frameDeltaSeconds: number): ClockAdvance {
    const { dt, maxStepsPerFrame, maxFrameDelta } = this.policy;
    const delta = Math.max(0, frameDeltaSeconds);
    const clamped = Math.min(delta, maxFrameDelta);
    let dropped = delta - clamped;

    this.accumulator += clamped;
    // Tolerate float error so that, e.g., 6 frames of 1/360 s produce exactly one 1/60 s step.
    const epsilon = dt * 1e-9;
    let steps = 0;
    while (this.accumulator + epsilon >= dt && steps < maxStepsPerFrame) {
      this.accumulator -= dt;
      steps++;
    }
    if (this.accumulator + epsilon >= dt) {
      dropped += this.accumulator;
      this.accumulator = 0;
    }
    this.accumulator = Math.max(0, this.accumulator);

    return {
      steps,
      alpha: Math.min(this.accumulator / dt, 1 - Number.EPSILON),
      droppedSeconds: dropped,
    };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
