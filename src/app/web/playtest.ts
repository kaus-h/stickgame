import type { LevelDef, SimEvent, SimSnapshot } from '../../sim';
import { PlaytestRecorder, TelemetryDirector } from '../../telemetry';

/** The only phase-1 collection gate. No matching flag means no listeners or recorder. */
export function playtestEnabled(search: string): boolean {
  return new URLSearchParams(search).get('playtest') === '1';
}

/**
 * Web composition adapter. Call once with the current level and the runtime's event subscription.
 * Main.ts wiring is intentionally left for the orchestrator (GMR-49 amendment).
 */
export function installPlaytest(opts: {
  levelRef: () => LevelDef;
  onEvents: (listener: (events: readonly SimEvent[]) => void) => () => void;
  snapshot: () => SimSnapshot;
  window: Window;
}): { dispose(): void } {
  const browser = opts.window;
  if (!playtestEnabled(browser.location.search)) return { dispose: () => undefined };

  const recorder = new PlaytestRecorder();
  let level: LevelDef | null = null;
  let director: TelemetryDirector | null = null;
  let frame = 0;
  let disposed = false;

  const collect = (events: readonly SimEvent[], snapshot: SimSnapshot): void => {
    const active = opts.levelRef();
    if (active !== level) {
      level = active;
      director = new TelemetryDirector(active);
    }
    recorder.recordMany(director?.onEvents(events, snapshot) ?? []);
  };

  // First sample records the first life, even if the player does not provide input yet.
  collect([], opts.snapshot());
  const unsubscribe = opts.onEvents((events) => {
    if (!disposed) collect(events, opts.snapshot());
  });

  // The runtime sends events only when something happens. Sampling frames also observes chamber
  // entry during ordinary movement, without writing to the simulation or its event bus.
  const sampleFrame = (): void => {
    if (disposed) return;
    collect([], opts.snapshot());
    frame = browser.requestAnimationFrame(sampleFrame);
  };
  frame = browser.requestAnimationFrame(sampleFrame);

  const markQuit = (): void => {
    if (disposed || !director) return;
    collect([], opts.snapshot());
    recorder.recordMany(director.onQuit(opts.snapshot()));
  };
  const download = (): void => {
    const id = opts.levelRef().id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([recorder.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = browser.document.createElement('a');
    anchor.href = url;
    anchor.download = `playtest-${id}-${timestamp}.json`;
    anchor.hidden = true;
    browser.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    browser.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };
  const keydown = (event: KeyboardEvent): void => {
    if (
      event.code !== 'KeyE' ||
      !event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.repeat
    )
      return;
    event.preventDefault();
    collect([], opts.snapshot());
    download();
  };
  browser.addEventListener('keydown', keydown);
  browser.addEventListener('pagehide', markQuit);

  return {
    dispose(): void {
      if (disposed) return;
      markQuit();
      disposed = true;
      unsubscribe();
      browser.cancelAnimationFrame(frame);
      browser.removeEventListener('keydown', keydown);
      browser.removeEventListener('pagehide', markQuit);
    },
  };
}
