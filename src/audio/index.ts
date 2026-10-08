// audio: Web Audio layer, procedural SFX and music; reacts to sim events. May import core and sim types.
export { AudioEngine } from './AudioEngine';
export type { PlayOptions } from './AudioEngine';
export { SfxDirector } from './SfxDirector';
export type { SfxSink } from './SfxDirector';
export { parseSfxBank, renderSfx, sfxDuration, SfxParamsError } from './synth';
export type { SfxParams, Wave } from './synth';
