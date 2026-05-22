import { describe, expect, it } from 'vitest';
import { buildLibraryModeCards } from './libraryOutputs';

describe('buildLibraryModeCards', () => {
  it('groups conversations into library output buckets', () => {
    const cards = buildLibraryModeCards([
      { mode: 'DEEP_RESEARCH' },
      { mode: 'DEEP_RESEARCH' },
      { mode: 'SOCIAL_WRITING' },
      { mode: 'IMAGE_GENERATION' },
      { mode: 'CHAT' },
    ]);

    expect(cards.map((card) => [card.id, card.count])).toEqual([
      ['research', 2],
      ['social', 1],
      ['media', 1],
      ['chat', 1],
    ]);
  });
});
