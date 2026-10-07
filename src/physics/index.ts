// physics: the PhysicsAdapter interface plus backend implementations under ./backends (chosen by GMR-32).
// May import core only. sim depends on the interface, never on a backend.
export type { PhysicsAdapter, PhysicsStats } from './adapter';
