// Route solver (GMR-101): proves chambers completable with the real simulation and measures the
// timing windows of the found route. Pure TypeScript, no DOM; driven by scripts/solve-levels.mjs.
export { parseLevel, parseRuntimeTuning } from '../../content';
export { chamberSpecs, DistanceField, goalReached } from './goals';
export type { ChamberGoal, ChamberSpec } from './goals';
export { PlanSource, ROPE_OFFSETS } from './plan';
export type { PlanStep } from './plan';
export { DEFAULT_SEARCH, searchChamber } from './search';
export type { SearchOptions, SearchResult } from './search';
export {
  DEFAULT_SOLVER,
  SOLVER_VERSION,
  solveLevel,
  solveLevelJson,
  verifySolution,
} from './solve';
export type { ChamberReport, SolutionFile, SolverOptions, Verification } from './solve';
export type { TimingWindow } from './windows';
export { deepClone, World } from './world';
export { traceSolution } from './trace';
export type { TracePoint } from './trace';
