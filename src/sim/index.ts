// sim: the canonical game rules (player, rope, anchors, hazards, enemies, exits, reset).
// May import core and the physics interface only. Never Phaser, render, input devices, audio or platform.
export { levelSegments } from './level';
export { sweepPatroller, patrollerState } from './enemies';
export type { EnemySnapshot, EnemyContact } from './enemies';
export type { PatrollerDef } from './level';
export { resolveTarget } from './targeting';
export type { TargetAnchor, TargetResolution } from './targeting';
export type {
  AnchorDef,
  AnchorPathDef,
  LevelDef,
  SolidDef,
  ExitDef,
  ExitFamily,
  ExitSide,
  ExitWindow,
} from './level';
export { evaluateExitEntry } from './exits';
export type { ExitAttempt } from './exits';
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
} from './Simulation';
export type { PlayerTuning, RopeTuning, SimTuning } from './tuning';
