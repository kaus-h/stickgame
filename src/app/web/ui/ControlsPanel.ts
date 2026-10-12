import {
  assignKey,
  BINDABLE_ACTIONS,
  DEFAULT_DESKTOP_BINDINGS,
  resolveBindings,
  type BindableAction,
  type KeyBindingOverrides,
} from '../../../input/bindings';
import { t, type Strings } from './flow';

const CSS = `
.controls-panel { margin: 10px 0 18px; text-align: left; font-family: "Caveat", cursive; }
.controls-panel h3 { font-size: 32px; line-height: 1; margin: 6px 0 10px; }
.controls-panel .controls-row { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 5px 0; border-bottom: 1px dashed rgba(22,22,26,.25); }
.controls-panel .controls-name { flex: 1; font-size: 25px; }
.controls-panel .controls-keys { min-width: 90px; font-size: 23px; text-align: right; }
.controls-panel button { font: inherit; font-size: 24px; background: transparent; color: #16161a;
  border: 2px solid #16161a; border-radius: 9px 13px 8px 11px;
  padding: 2px 12px; min-height: 44px; cursor: pointer; }
.controls-panel button:focus-visible { outline: 3px solid #a66c2e; outline-offset: 2px; }
.controls-panel .controls-capture { font-size: 23px; margin: 8px 0; }
.controls-panel .controls-reset { margin-top: 12px; }
`;

/**
 * Embeddable settings pane, following GameFlowUi's DOM and localized-string style. The host
 * controls visibility; destroy() releases the temporary keyboard capture listener.
 */
export class ControlsPanel {
  readonly element: HTMLDivElement;
  private overrides: KeyBindingOverrides;
  private capturing: BindableAction | null = null;

  constructor(
    host: HTMLElement,
    private readonly strings: Strings,
    overrides: KeyBindingOverrides,
    private readonly onChange: (overrides: KeyBindingOverrides) => void,
  ) {
    if (!document.getElementById('controls-css')) {
      const style = document.createElement('style');
      style.id = 'controls-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.overrides = overrides;
    this.element = document.createElement('div');
    this.element.className = 'controls-panel';
    host.append(this.element);
    this.render();
  }

  /** Refresh when the owning settings screen receives a newer persisted value. */
  setOverrides(overrides: KeyBindingOverrides): void {
    this.cancelCapture();
    this.overrides = overrides;
    this.render();
  }

  destroy(): void {
    this.cancelCapture();
    this.element.remove();
  }

  private s(key: string, vars?: Readonly<Record<string, string | number>>): string {
    return t(this.strings, key, vars);
  }

  private render(): void {
    const bindings = resolveBindings(this.overrides);
    const heading = document.createElement('h3');
    heading.textContent = this.s('controls.heading');
    const rows = BINDABLE_ACTIONS.map((action) => {
      const row = document.createElement('div');
      row.className = 'controls-row';
      row.dataset.action = action;
      const name = document.createElement('span');
      name.className = 'controls-name';
      name.textContent = this.s(`controls.action.${action}`);
      const keys = document.createElement('span');
      keys.className = 'controls-keys';
      keys.textContent =
        bindings[action].length > 0
          ? bindings[action]
              .map((code) => this.readableKey(code))
              .join(this.s('controls.key.separator'))
          : this.s('controls.unbound');
      const change = document.createElement('button');
      change.type = 'button';
      change.dataset.action = action;
      change.textContent = this.s('controls.change');
      change.setAttribute(
        'aria-label',
        this.s('controls.changeAction', { action: this.s(`controls.action.${action}`) }),
      );
      change.onclick = () => {
        this.startCapture(action);
      };
      row.append(name, keys, change);
      return row;
    });
    const hint = document.createElement('p');
    hint.className = 'controls-capture';
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = this.capturing
      ? this.s('controls.pressKey', {
          action: this.s(`controls.action.${this.capturing}`),
        })
      : this.s('controls.help');
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'controls-reset';
    reset.textContent = this.s('controls.reset');
    reset.onclick = () => {
      this.cancelCapture();
      this.overrides = {};
      this.render();
      this.onChange(this.overrides);
    };
    this.element.replaceChildren(heading, ...rows, hint, reset);
  }

  private readableKey(code: string): string {
    const known: Readonly<Record<string, string>> = {
      Space: 'controls.key.space',
      ArrowLeft: 'controls.key.left',
      ArrowRight: 'controls.key.right',
      ArrowUp: 'controls.key.up',
      ArrowDown: 'controls.key.down',
      Escape: 'controls.key.escape',
      Backspace: 'controls.key.backspace',
      Enter: 'controls.key.enter',
      ShiftLeft: 'controls.key.shift',
      ShiftRight: 'controls.key.shift',
      ControlLeft: 'controls.key.ctrl',
      ControlRight: 'controls.key.ctrl',
    };
    if (known[code]) return this.s(known[code]);
    if (/^Key[A-Z]$/.test(code)) return this.s('controls.key.letter', { key: code.slice(3) });
    if (/^Digit[0-9]$/.test(code)) return this.s('controls.key.digit', { key: code.slice(5) });
    return this.s('controls.key.other', { code });
  }

  private startCapture(action: BindableAction): void {
    this.cancelCapture();
    this.capturing = action;
    this.render();
    this.element.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.focus();
    window.addEventListener('keydown', this.onCaptureKey, true);
  }

  private cancelCapture(): void {
    window.removeEventListener('keydown', this.onCaptureKey, true);
    this.capturing = null;
  }

  private readonly onCaptureKey = (event: KeyboardEvent): void => {
    if (!this.capturing || event.repeat) return;
    if (event.code === 'Tab') return; // Keep normal focus navigation available.
    event.preventDefault();
    event.stopImmediatePropagation(); // Do not send capture keys into the gameplay mapper.
    const action = this.capturing;
    this.cancelCapture();
    if (event.code !== 'Escape' && event.code !== 'Unidentified') {
      const assigned = assignKey(resolveBindings(this.overrides), action, event.code);
      const next: Partial<Record<BindableAction, readonly string[]>> = {};
      for (const name of BINDABLE_ACTIONS) {
        const actual = assigned[name];
        const original = DEFAULT_DESKTOP_BINDINGS[name];
        if (actual.length !== original.length || actual.some((code, i) => code !== original[i])) {
          next[name] = actual;
        }
      }
      this.overrides = next;
      this.render();
      this.onChange(this.overrides);
    } else {
      this.render();
    }
    this.element.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.focus();
  };
}
