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

/** What render needs each frame: two simulation states and how far to blend between them. */
export interface RenderFrame {
  readonly previous: SimSnapshot;
  readonly current: SimSnapshot;
  readonly alpha: number;
  readonly stats: RuntimeStats;
}

/** Implemented by the app's runtime; render pulls one frame per display refresh. */
export interface FrameSource {
  frame(deltaSeconds: number): RenderFrame;
}
