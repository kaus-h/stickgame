// input: device adapters that turn keyboard, mouse and touch events into hardware-agnostic intents.
export {
  GamepadInputMapper,
  GAMEPAD_ROPE_BUTTONS,
  DEFAULT_GAMEPAD_ROPE_BUTTON,
} from './GamepadInputMapper';
export type { GamepadState } from './GamepadInputMapper';
// May import core only.
export { bindDom, DEFAULT_DESKTOP_BINDINGS, DesktopInputMapper } from './DesktopInputMapper';
export type { DesktopBindings, ScreenToWorld } from './DesktopInputMapper';
export { assignKey, BINDABLE_ACTIONS, resolveBindings } from './bindings';
export type { BindableAction, KeyBindingOverrides } from './bindings';
export { IntentQueue } from './IntentQueue';
export type { IntentLogEntry } from './IntentQueue';
export {
  bindTouchDom,
  computeLayout,
  DEFAULT_TOUCH_OPTIONS,
  NO_INSETS,
  TOUCH_SCHEMES,
  TouchInputMapper,
} from './TouchInputMapper';
export type {
  MoveStyle,
  SafeAreaInsets,
  TouchControl,
  TouchControlId,
  TouchControlsState,
  TouchLayout,
  TouchOptions,
  TouchRole,
  TouchScheme,
} from './TouchInputMapper';
