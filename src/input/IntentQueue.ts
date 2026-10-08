import type { Intent, IntentSource } from '../core';

/** One tick's worth of intents, as handed to the simulation. */
export interface IntentLogEntry {
  readonly tick: number;
  readonly intents: readonly Intent[];
}

/**
 * Collects intents from device adapters between ticks and hands them to the next simulation tick.
 * Every non-empty handoff is logged with its tick, which is exactly what a replay needs (GMR-29).
 */
export class IntentQueue implements IntentSource {
  private pending: Intent[] = [];
  private readonly log: IntentLogEntry[] = [];
  private overflowed = false;

  constructor(private readonly logLimit = 100_000) {}

  push(intent: Intent): void {
    this.pending.push(intent);
  }

  poll(tick: number): readonly Intent[] {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    if (this.log.length < this.logLimit) this.log.push({ tick, intents: out });
    else this.overflowed = true;
    return out;
  }

  /** The recorded intent stream since creation or the last clearLog(). */
  entries(): readonly IntentLogEntry[] {
    return this.log;
  }

  /** True once intents were dropped from the log: entries() is then not a valid replay. */
  get truncated(): boolean {
    return this.overflowed;
  }

  clearLog(): void {
    this.log.length = 0;
    this.overflowed = false;
  }

  clear(): void {
    this.pending = [];
  }
}
