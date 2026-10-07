// sim: the canonical game rules (player, rope, anchors, hazards, enemies, exits, reset).
// May import core and the physics interface only. Never Phaser, render, input devices, audio or platform.
export { Simulation } from './Simulation';
export type { ProbeState, SimEvent, SimSnapshot, SimStats } from './Simulation';
export type { SimTuning } from './tuning';
