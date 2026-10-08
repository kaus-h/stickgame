// input: device adapters that turn keyboard, mouse and touch events into hardware-agnostic intents.
// May import core only.
export { bindDom, DEFAULT_DESKTOP_BINDINGS, DesktopInputMapper } from './DesktopInputMapper';
export type { DesktopBindings, ScreenToWorld } from './DesktopInputMapper';
export { IntentQueue } from './IntentQueue';
export type { IntentLogEntry } from './IntentQueue';
