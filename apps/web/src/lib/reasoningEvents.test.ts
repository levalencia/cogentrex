import { describe, expect, it } from 'vitest';
import { toDisplayReasoningEntries } from './reasoningEvents';

describe('toDisplayReasoningEntries', () => {
  it('keeps only reasoning events before rendering persisted thinking steps', () => {
    const entries = toDisplayReasoningEntries([
      { type: 'reasoning', step: 'Planning research', detail: 'Create a search plan' },
      { type: 'source', source: { id: 1, title: 'Example', url: 'https://example.com' } },
      { type: 'done', content: 'Final answer' },
      { step: 'Legacy reasoning item', detail: 'Still supported' },
      { type: 'reasoning', step: '', detail: 'Invalid empty step' },
      null,
    ]);

    expect(entries).toEqual([
      { step: 'Planning research', detail: 'Create a search plan', iteration: undefined },
      { step: 'Legacy reasoning item', detail: 'Still supported', iteration: undefined },
    ]);
  });
});
