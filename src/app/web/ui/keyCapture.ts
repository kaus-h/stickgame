const CAPTURE = { capture: true } as const;

/**
 * Capture the next key press for remapping (GMR-50). The captured keydown, its auto-repeats and
 * its paired keyup are all swallowed, so none of them reaches the gameplay mapper (a captured
 * Space must not arrive later as a jump release). Tab passes through for focus navigation.
 * Listens in the capture phase; returns a function that removes every listener.
 */
export function captureNextKey(target: EventTarget, onKey: (code: string) => void): () => void {
  let pressed: string | null = null;
  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const down = (e: Event): void => {
    const { code, repeat } = e as KeyboardEvent;
    if (pressed !== null) {
      if (code === pressed) swallow(e);
      return;
    }
    if (repeat || code === 'Tab') return;
    swallow(e);
    pressed = code;
    onKey(code);
  };
  const up = (e: Event): void => {
    if ((e as KeyboardEvent).code !== pressed) return;
    swallow(e);
    cancel();
  };
  const cancel = (): void => {
    target.removeEventListener('keydown', down, CAPTURE);
    target.removeEventListener('keyup', up, CAPTURE);
  };
  target.addEventListener('keydown', down, CAPTURE);
  target.addEventListener('keyup', up, CAPTURE);
  return cancel;
}
