import { vec2, type Vec2 } from '../../../core';
import type { BodyState, ContactEvent, PhysicsAdapter, PhysicsStats, RayHit } from '../../adapter';

/** No-op backend for tests of code that does not depend on physics behaviour. */
export class NullPhysicsAdapter implements PhysicsAdapter {
  private steps = 0;

  setGeometry(): void {}
  setGravity(): void {}
  createBody(): number {
    return 0;
  }
  bodyState(): BodyState {
    return { position: vec2(0, 0), velocity: vec2(0, 0), grounded: false };
  }
  setBodyVelocity(): void {}
  createKinematicAnchor(): number {
    return 0;
  }
  moveKinematicAnchor(): void {}
  anchorPosition(): Vec2 {
    return vec2(0, 0);
  }
  attachRope(): number {
    return 0;
  }
  detachRope(): void {}
  raycast(): RayHit | null {
    return null;
  }
  drainContacts(): ContactEvent[] {
    return [];
  }

  step(): void {
    this.steps++;
  }

  resetBodies(): void {}

  clearLevel(): void {}

  stats(): PhysicsStats {
    return { bodies: 0, joints: 0, contacts: 0 };
  }

  get stepCount(): number {
    return this.steps;
  }

  dispose(): void {}
}
