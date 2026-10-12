import { DEFAULT_DESKTOP_BINDINGS, type DesktopBindings } from './DesktopInputMapper';

/** The desktop actions that may be rebound without changing gameplay semantics. */
export const BINDABLE_ACTIONS = [
  'left',
  'right',
  'jump',
  'rope',
  'restart',
  'respawn',
  'pause',
  'ghost',
  'bodies',
  'clearBodies',
] as const;

export type BindableAction = (typeof BINDABLE_ACTIONS)[number];
export type KeyBindingOverrides = Readonly<Partial<Record<BindableAction, readonly string[]>>>;

/** Escape is a non-removable pause key. Tab is reserved for keyboard navigation in the UI. */
export const RESERVED = ['Escape'] as const;

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Merge saved overrides with the defaults. Explicit overrides take precedence over other
 * actions' default keys, so importing a remap cannot make one key fire two intents.
 */
export function resolveBindings(overrides: KeyBindingOverrides = {}): DesktopBindings {
  const result = {} as Record<BindableAction, string[]>;
  const claimed = new Set<string>(RESERVED);

  // Process overrides first, then unchanged defaults. This lets a reassigned key be stolen from
  // the default action even when that action occurs earlier in the action list.
  for (const overridden of [true, false]) {
    for (const action of BINDABLE_ACTIONS) {
      if (hasOwn(overrides, action) !== overridden) continue;
      const requested = overridden ? overrides[action] : DEFAULT_DESKTOP_BINDINGS[action];
      const keys: string[] = [];
      if (action === 'pause') keys.push('Escape');
      if (Array.isArray(requested)) {
        for (const code of requested) {
          if (typeof code !== 'string' || !code || code === 'Escape' || code === 'Tab') continue;
          if (!claimed.has(code)) {
            claimed.add(code);
            keys.push(code);
          }
        }
      }
      result[action] = keys;
    }
  }
  return result;
}

/**
 * Assign a single key to an action and remove it from every other action. Escape is always
 * retained for Pause; an additional pause remap may coexist with that non-removable key.
 */
export function assignKey(
  bindings: DesktopBindings | KeyBindingOverrides,
  action: BindableAction,
  code: string,
): DesktopBindings {
  const current = resolveBindings(bindings);
  if (!code || code === 'Tab' || (code === 'Escape' && action !== 'pause')) return current;

  const next = {} as Record<BindableAction, string[]>;
  for (const name of BINDABLE_ACTIONS) {
    next[name] = current[name].filter(
      (key) => key !== code && (name === 'pause' || key !== 'Escape'),
    );
  }
  next[action] = [code];
  next.pause =
    action === 'pause'
      ? code === 'Escape'
        ? ['Escape']
        : ['Escape', code]
      : ['Escape', ...next.pause.filter((key) => key !== 'Escape')];
  return next;
}

export { DEFAULT_DESKTOP_BINDINGS } from './DesktopInputMapper';
