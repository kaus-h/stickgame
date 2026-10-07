import type { Intent, IntentSource } from '../core';

/**
 * Collects intents from device adapters between ticks and hands them to the next simulation tick.
 * GMR-19 builds the real adapters on top of this; GMR-29 records what it hands out.
 */
export class IntentQueue implements IntentSource {
  private pending: Intent[] = [];

  push(intent: Intent): void {
    this.pending.push(intent);
  }

  poll(): readonly Intent[] {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    return out;
  }

  clear(): void {
    this.pending = [];
  }
}
