import type { SimSnapshot } from '../sim';

/** Timing and lifecycle counters shown by the debug overlay (GMR-18; expanded in GMR-28). */
export interface RuntimeStats {
  readonly simHz: number;
  readonly stepsLastFrame: number;
  readonly alpha: number;
  readonly frameMsAvg: number;
  readonly frameMsMax: number;
  readonly simStepMsAvg: number;
  readonly cappedFrames: number;
  readonly droppedSeconds: number;
  readonly tick: number;
  readonly attemptTick: number;
  readonly resets: number;
  readonly entities: number;
  readonly bodies: number;
  readonly joints: number;
  readonly paused: boolean;
}

/** A split just reached (GMR-103): shown with its delta to the PB split for about 2 s. */
export interface SplitFlash {
  readonly kind: 'checkpoint' | 'exit';
  /** Checkpoint index (exit: the number of checkpoints). */
  readonly index: number;
  /** Run time at the split. */
  readonly ticks: number;
  /** The PB's run time at the same split, or null (no PB, or the PB skipped it). */
  readonly pbTicks: number | null;
  /** Simulation tick it was reached on (for the display timeout). */
  readonly tick: number;
}

/** Racing state for the HUD and debug overlay (GMR-103); presentation only. */
export interface RaceView {
  /** PB run time and splits, or null when there is no valid PB for this level and build. */
  readonly pb: { readonly ticks: number; readonly splits: readonly (number | null)[] } | null;
  /** The ghost setting (G); the ghost draws only when a PB exists. */
  readonly ghostEnabled: boolean;
  /** The PB ghost's two latest states (same run tick as the live run), or null when not running. */
  readonly ghost: { readonly previous: SimSnapshot; readonly current: SimSnapshot } | null;
  readonly split: SplitFlash | null;
}

/** What render needs each frame: two simulation states and how far to blend between them. */
export interface RenderFrame {
  readonly previous: SimSnapshot;
  readonly current: SimSnapshot;
  readonly alpha: number;
  readonly stats: RuntimeStats;
  /** Racing timing view (GMR-103); absent in labs and tools that do not track runs. */
  readonly race?: RaceView;
}

/** Implemented by the app's runtime; render pulls one frame per display refresh. */
export interface FrameSource {
  frame(deltaSeconds: number): RenderFrame;
}
