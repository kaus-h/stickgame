import { BUILD_HASH } from '../core';
import type { TelemetryEvent } from './schema';

const MAX_EVENTS = 50_000;

/** Bounded, in-memory, opt-in playtest recorder; it never sends data anywhere. */
export class PlaytestRecorder {
  readonly sessionId: string;
  private readonly ring: (TelemetryEvent | undefined)[] = Array.from(
    { length: MAX_EVENTS },
    () => undefined,
  );
  private head = 0;
  private count = 0;

  constructor(
    private readonly buildHash: string = BUILD_HASH,
    sessionId: string = globalThis.crypto.randomUUID(),
  ) {
    this.sessionId = sessionId;
  }

  get length(): number {
    return this.count;
  }

  record(event: TelemetryEvent): void {
    const index = (this.head + this.count) % MAX_EVENTS;
    this.ring[index] = event;
    if (this.count < MAX_EVENTS) this.count++;
    else this.head = (this.head + 1) % MAX_EVENTS;
  }

  recordMany(events: readonly TelemetryEvent[]): void {
    for (const event of events) this.record(event);
  }

  /** Events are oldest-to-newest, even after the buffer wraps. */
  get events(): readonly TelemetryEvent[] {
    const result: TelemetryEvent[] = [];
    for (let i = 0; i < this.count; i++) {
      const event = this.ring[(this.head + i) % MAX_EVENTS];
      if (event) result.push(event);
    }
    return result;
  }

  export(): string {
    return JSON.stringify({
      format: 1,
      build: this.buildHash,
      date: new Date().toISOString(),
      sessionId: this.sessionId,
      events: this.events,
    });
  }
}
