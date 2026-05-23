import { describe, expect, it } from 'vitest';
import {
  buildArtifactDownload,
  buildLibraryArtifactRows,
  buildLibraryModeCards,
  filterLibraryArtifacts,
} from './libraryOutputs';

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
        preview: 'Brief',
      },
    ]);
  });
});

describe('filterLibraryArtifacts', () => {
  const artifacts = [
    {
      id: 'art-1',
      filename: 'AI research brief.md',
      type: 'text/markdown',
      sizeBytes: 1536,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      content: '# Brief\n\nDeep market evidence with sources.',
      createdAt: '2026-05-22T20:01:00.000Z',
      conversationTitle: 'AI strategy research',
      conversationMode: 'DEEP_RESEARCH' as const,
    },
    {
      id: 'art-2',
      filename: 'LinkedIn draft.md',
      type: 'text/markdown',
      sizeBytes: 500,
      conversationId: 'conv-2',
      messageId: 'msg-2',
      content: 'Launch post copy',
      createdAt: '2026-05-22T20:02:00.000Z',
      conversationTitle: 'Social launch',
      conversationMode: 'SOCIAL_WRITING' as const,
    },
  ];

  it('searches filename, conversation metadata, and content', () => {
    expect(filterLibraryArtifacts(artifacts, 'market').map((artifact) => artifact.id)).toEqual(['art-1']);
    expect(filterLibraryArtifacts(artifacts, 'social').map((artifact) => artifact.id)).toEqual(['art-2']);
    expect(filterLibraryArtifacts(artifacts, '').map((artifact) => artifact.id)).toEqual(['art-1', 'art-2']);
  });
});

describe('buildArtifactDownload', () => {
  it('returns a markdown download payload with a safe filename', () => {
    const artifact = {
      id: 'art-1',
      filename: 'AI research brief.md',
      type: 'text/markdown',
      sizeBytes: 1536,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      content: '# Brief',
      createdAt: '2026-05-22T20:01:00.000Z',
    };

    expect(buildArtifactDownload(artifact)).toEqual({
      filename: 'AI research brief.md',
      content: '# Brief',
      mimeType: 'text/markdown;charset=utf-8',
    });
  });
});
