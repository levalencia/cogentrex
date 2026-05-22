import { describe, expect, it } from 'vitest';
import { buildLibraryArtifactRows, buildLibraryModeCards } from './libraryOutputs';

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

describe('buildLibraryArtifactRows', () => {
  it('summarizes persisted artifacts with source conversation context', () => {
    const rows = buildLibraryArtifactRows([
      {
        id: 'art-1',
        filename: 'AI research brief.md',
        type: 'text/markdown',
        sizeBytes: 1536,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: '# Brief',
        createdAt: '2026-05-22T20:01:00.000Z',
        conversationTitle: 'AI strategy research',
        conversationMode: 'DEEP_RESEARCH',
      },
    ]);

    expect(rows).toEqual([
      {
        id: 'art-1',
        filename: 'AI research brief.md',
        subtitle: 'AI strategy research · DEEP RESEARCH',
        sizeLabel: '1.5 KB',
        conversationHref: '/chats/conv-1',
      },
    ]);
  });
});
