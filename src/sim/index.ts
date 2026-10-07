// sim: the canonical game rules (player, rope, anchors, hazards, enemies, exits, reset).
// May import core and the physics interface only. Never Phaser, render, input devices, audio or platform.
export { levelSegments } from './level';
export { resolveTarget } from './targeting';
export type { TargetAnchor, TargetResolution } from './targeting';
export type { AnchorDef, LevelDef, SolidDef } from './level';
export { hashSnapshot } from './hash';
export { Simulation } from './Simulation';
export type {
  ContactSnapshot,
  DeathCause,
  DeathRecord,
  PlayerMode,
  PlayerSnapshot,
  RopeInvalidReason,
  RopeSnapshot,
  SimEvent,
  SimSnapshot,
  SimStats,
} from './Simulation';
export type { PlayerTuning, RopeTuning, SimTuning } from './tuning';
