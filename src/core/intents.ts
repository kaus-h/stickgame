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
  | { readonly type: 'ropePress' }
  | { readonly type: 'ropeRelease' }
  | { readonly type: 'restart' }
  | { readonly type: 'pause' };

/** Supplies the intents that apply to a given simulation tick. */
export interface IntentSource {
  poll(tick: number): readonly Intent[];
}
