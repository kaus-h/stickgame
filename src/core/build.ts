declare const __BUILD_HASH__: string;

/**
 * Build identity: `<short commit SHA>-<content hash of content/ and src/>`, injected by Vite `define`
 * (vite.config.ts). Stamped into replays (`Replay.build`) and telemetry; shown in the debug overlay.
 * Falls back to 'dev' where no bundler injected it (unit tests, tooling).
 */
export const BUILD_HASH: string = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : 'dev';
