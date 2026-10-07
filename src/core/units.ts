/**
 * World space: meters, +x right, +y down (matches screen space, so rendering is a pure scale).
 * Rendering converts with this scale (ADR-001). Tuned in GMR-20.
 */
export const PIXELS_PER_METER = 64;

/** Fixed simulation step (ADR-001 Amendment 1). Not tunable. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const metersToPixels = (m: number): number => m * PIXELS_PER_METER;

export const pixelsToMeters = (px: number): number => px / PIXELS_PER_METER;
