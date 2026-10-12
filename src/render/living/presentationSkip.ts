/** Keep a held skip key from activating the newly focused results button. */
function consumeUntilRelease(key: KeyboardEvent): void {
  const consume = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.code !== key.code) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'keyup') cleanup();
  };
  const cleanup = (): void => {
    window.removeEventListener('keydown', consume, { capture: true });
    window.removeEventListener('keyup', consume, { capture: true });
    window.removeEventListener('blur', cleanup);
  };
  window.addEventListener('keydown', consume, { capture: true });
  window.addEventListener('keyup', consume, { capture: true });
  window.addEventListener('blur', cleanup);
}

/** Shared eraser/page-turn input: a skip never reaches gameplay or the results button. */
export function listenPresentationSkip(done: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const skip = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof KeyboardEvent !== 'undefined' && event instanceof KeyboardEvent) {
      // Repeats are consumed while the stage is active; a new press skips just this stage.
      if (event.repeat) return;
      consumeUntilRelease(event);
    }
    done();
  };
  for (const type of ['keydown', 'pointerdown'] as const)
    window.addEventListener(type, skip, { capture: true });
  return () => {
    for (const type of ['keydown', 'pointerdown'] as const)
      window.removeEventListener(type, skip, { capture: true });
  };
}
