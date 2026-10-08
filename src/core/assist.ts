/**
 * Aim-assist tiers (GMR-27). Assists are explicit, opt-in and visible; `standard` is the canonical
 * game with no assist. The tier changes which anchor a rope press selects, so it is part of a run's
 * identity: replays carry it (Replay.assist) and must be played back with the same tier.
 *
 * - `standard`: the authored selection radius (rope.selectRadius). No auto-targeting.
 * - `wide-select`: a larger selection radius (assist.wideSelectRadius), drawn like any selection.
 * - `snap`: when nothing is inside the standard radius, the nearest anchor within
 *   assist.snapRadius is selected and the snap is drawn as a visible line (never silent).
 */
export type AssistMode = 'standard' | 'wide-select' | 'snap';

export const ASSIST_MODES: readonly AssistMode[] = ['standard', 'wide-select', 'snap'];

/** Parse a settings or URL value; unknown values give null so callers choose the fallback. */
export function parseAssistMode(value: string | null | undefined): AssistMode | null {
  return ASSIST_MODES.find((m) => m === value) ?? null;
}
