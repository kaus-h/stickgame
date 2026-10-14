// sim: the canonical game rules (player, rope, anchors, hazards, enemies, exits, reset).
// May import core and the physics interface only. Never Phaser, render, input devices, audio or platform.
export { levelSegments } from './level';
export { sweepPatroller, patrollerState } from './enemies';
export type { EnemySnapshot, EnemyContact } from './enemies';
export type { PatrollerDef } from './level';
export {
  resolveTarget,
  resolveAnchor,
  resolvePointTarget,
  neutralCandidates,
  STANDARD_ASSIST,
} from './targeting';
export type { TargetAnchor, TargetAssist, TargetResolution } from './targeting';
export type {
  AnchorDef,
  AnchorPathDef,
  AnchorTimerDef,
  LevelDef,
  SolidDef,
  TargetDef,
  ExitDef,
  ExitFamily,
  ExitSide,
  ExitWindow,
} from './level';
export { evaluateExitEntry } from './exits';
export type { ExitAttempt } from './exits';
export { anchorPathState } from './anchorPath';
export type { TargetSnapshot } from './impactTargets';
export type { AnchorPathState } from './anchorPath';
export { anchorTimerState } from './anchorTimer';
export type { AnchorTimerState } from './anchorTimer';
export { hashSnapshot, levelFingerprint } from './hash';
export { Simulation } from './Simulation';
export type {
  ContactSnapshot,
  DeathCause,
  DeathRecord,
  LifeEndReason,
  PlayerMode,
  PlayerSnapshot,
  RopeInvalidReason,
  RopeSnapshot,
  AnchorStateSnapshot,
  SimEvent,
  SimSnapshot,
  SimStats,
  SimulationOptions,
} from './Simulation';
export type { CombatTuning, PlayerTuning, RopeTuning, SimTuning } from './tuning';
