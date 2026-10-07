import type { PhysicsAdapter, PhysicsStats } from '../../adapter';

/** No-op backend for the runtime skeleton and tests until GMR-32 chooses the real backend. */
export class NullPhysicsAdapter implements PhysicsAdapter {
  private steps = 0;

  step(): void {
    this.steps++;
  }

  resetBodies(): void {}

  stats(): PhysicsStats {
    return { bodies: 0, joints: 0, contacts: 0 };
  }

  get stepCount(): number {
    return this.steps;
  }

  dispose(): void {}
}
