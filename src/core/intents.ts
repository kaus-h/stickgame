import type { Vec2 } from './vec2';

/**
 * Hardware-agnostic gameplay intents (doc 03). The simulation consumes only these; input adapters
 * (GMR-19) produce them from keyboard, mouse or touch.
 */
export type Intent =
  | { readonly type: 'move'; readonly axis: number }
  | { readonly type: 'jumpPress' }
  | { readonly type: 'jumpRelease' }
  | { readonly type: 'ropeAim'; readonly target: Vec2 }
  /** Point-select with a world-space direction; zero selects the neutral forward candidate. */
  | { readonly type: 'ropePoint'; readonly direction: Vec2 }
  /** Select the visible anchor nearest this world tap; the sim persists the selected anchor. */
  | { readonly type: 'ropeTouch'; readonly target: Vec2 }
  /** Switch to neutral targeting without an explicit pointer selection (touch button mode). */
  | { readonly type: 'ropeNeutral' }
  | { readonly type: 'ropePress' }
  | { readonly type: 'ropeRelease' }
  | { readonly type: 'restart' }
  /**
   * Respawn at the last reached checkpoint (GMR-103, owner decision 2026-10-08): ends the current
   * life; the run clock keeps counting. Without a reached checkpoint it acts as restart.
   */
  | { readonly type: 'respawn' }
  | { readonly type: 'pause' }
  /** Show or hide the personal-best ghost (GMR-103). Presentation only; the simulation ignores it. */
  | { readonly type: 'ghostToggle' }
  /** Show or hide the death bodies (GMR-104, B). Presentation only; never reaches the simulation. */
  | { readonly type: 'bodiesToggle' }
  /** Clear the death bodies (GMR-104, C). Presentation only; never reaches the simulation. */
  | { readonly type: 'bodiesClear' };

/** Supplies the intents that apply to a given simulation tick. */
export interface IntentSource {
  poll(tick: number): readonly Intent[];
}

/** Run provenance only; never changes simulation behavior. Legacy runs have unknown provenance. */
export type InputDevice = 'mouse' | 'pad' | 'touch' | 'unknown';

export function parseInputDevice(value: unknown): InputDevice | null {
  return value === 'mouse' || value === 'pad' || value === 'touch' || value === 'unknown'
    ? value
    : null;
}
