// sim: the canonical game rules (player, rope, anchors, hazards, enemies, exits, reset).
// May import core and the physics interface only. Never Phaser, render, input devices, audio or platform.
export { levelSegments } from './level';
export { resolveTarget, STANDARD_ASSIST } from './targeting';
export type { TargetAnchor, TargetAssist, TargetResolution } from './targeting';
export type { AnchorDef, AnchorPathDef, LevelDef, SolidDef } from './level';
export { anchorPathState } from './anchorPath';
export type { AnchorPathState } from './anchorPath';
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
  SimulationOptions,
} from './Simulation';
export type { PlayerTuning, RopeTuning, SimTuning } from './tuning';
