export interface PhysicsStats {
  readonly bodies: number;
  readonly joints: number;
  readonly contacts: number;
}

/**
 * The only way game code touches physics (ADR-001). One persistent world per scene lifecycle:
 * reset re-initializes bodies and joints and never recreates the world (ADR-001 Amendment 1).
 * GMR-32 extends this with bodies, shapes, sensors, distance constraints and queries.
 */
export interface PhysicsAdapter {
  /** Advance the world by one fixed simulation step. */
  step(dt: number, substeps: number): void;
  /** Restore every body and joint to its authored initial state inside the same world. */
  resetBodies(): void;
  stats(): PhysicsStats;
  dispose(): void;
}
