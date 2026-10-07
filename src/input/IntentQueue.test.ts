import { describe, expect, it } from 'vitest';
import { IntentQueue } from './IntentQueue';

describe('IntentQueue', () => {
  it('hands pending intents to the next tick and logs them with that tick', () => {
    const q = new IntentQueue();
    q.push({ type: 'jumpPress' });
    expect(q.poll(7)).toEqual([{ type: 'jumpPress' }]);
    expect(q.poll(8)).toEqual([]);
    expect(q.entries()).toEqual([{ tick: 7, intents: [{ type: 'jumpPress' }] }]);
  });

  it('flags a truncated log instead of silently dropping intents', () => {
    const q = new IntentQueue(2);
    for (let t = 0; t < 3; t++) {
      q.push({ type: 'move', axis: 1 });
      q.poll(t);
    }
    expect(q.entries()).toHaveLength(2);
    expect(q.truncated).toBe(true);
    q.clearLog();
    expect(q.truncated).toBe(false);
  });
});
