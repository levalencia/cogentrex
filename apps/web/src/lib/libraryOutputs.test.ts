import { describe, expect, it } from 'vitest';
import {
  buildArtifactDownload,
  buildLibraryArtifactRows,
  buildLibraryModeCards,
  buildLibraryOverviewStats,
  buildRecentActivityItems,
  filterLibraryArtifacts,
  mergeLibraryArtifacts,
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

describe('buildLibraryOverviewStats', () => {
  it('summarizes workflow/artifact health for the library header', () => {
    const stats = buildLibraryOverviewStats(
      [
        { id: 'conv-1', mode: 'DEEP_RESEARCH', updatedAt: '2026-05-22T20:01:00.000Z' },
        { id: 'conv-2', mode: 'CHAT', updatedAt: '2026-05-22T20:03:00.000Z' },
      ],
      [
        {
          id: 'art-1',
          filename: 'brief.md',
          type: 'text/markdown',
          sizeBytes: 100,
          conversationId: 'conv-1',
          messageId: 'msg-1',
          content: 'Brief',
          createdAt: '2026-05-22T20:05:00.000Z',
        },
      ],
    );

    expect(stats).toEqual({
      totalWorkflows: 2,
      savedArtifacts: 1,
      savedPerWorkflowLabel: '0.5',
      latestActivityAt: '2026-05-22T20:05:00.000Z',
    });
  });
});

describe('mergeLibraryArtifacts', () => {
  it('combines fetched library artifacts with newly saved workspace artifacts without duplicates', () => {
    const fetched = [
      {
        id: 'art-1',
        filename: 'Fetched.md',
        type: 'text/markdown',
        sizeBytes: 20,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Fetched',
        createdAt: '2026-05-22T20:01:00.000Z',
      },
    ];
    const liveSaved = [
      fetched[0]!,
      {
        id: 'art-2',
        filename: 'Just saved.md',
        type: 'text/markdown',
        sizeBytes: 30,
        conversationId: 'conv-2',
        messageId: 'msg-2',
        content: 'Just saved',
        createdAt: '2026-05-22T20:02:00.000Z',
      },
    ];

    expect(mergeLibraryArtifacts(fetched, liveSaved).map((artifact) => artifact.id)).toEqual(['art-2', 'art-1']);
  });

  it('preserves fetched conversation metadata when merging a less-complete workspace copy', () => {
    const merged = mergeLibraryArtifacts([
      {
        id: 'art-1',
        filename: 'Brief.md',
        type: 'text/markdown',
        sizeBytes: 20,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Brief',
        createdAt: '2026-05-22T20:01:00.000Z',
        conversationTitle: 'Research brief',
        conversationMode: 'DEEP_RESEARCH',
      },
    ], [
      {
        id: 'art-1',
        filename: 'Brief.md',
        type: 'text/markdown',
        sizeBytes: 20,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Brief',
        createdAt: '2026-05-22T20:01:00.000Z',
      },
    ]);

    expect(merged[0]).toEqual(expect.objectContaining({
      id: 'art-1',
      conversationTitle: 'Research brief',
      conversationMode: 'DEEP_RESEARCH',
    }));
  });

  it('deduplicates live workspace artifacts once the persisted library artifact is fetched', () => {
    const merged = mergeLibraryArtifacts([
      {
        id: 'art-1',
        filename: 'Generated.md',
        type: 'text/markdown',
        sizeBytes: 29,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Generated',
        createdAt: '2026-05-22T20:01:00.000Z',
        conversationTitle: 'Artifact chat',
        conversationMode: 'CHAT',
      },
    ], [
      {
        id: 'live-1',
        filename: 'Generated.md',
        type: 'text/markdown',
        sizeBytes: 9,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Generated',
        createdAt: '2026-05-22T20:02:00.000Z',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({
      id: 'art-1',
      sizeBytes: 29,
      createdAt: '2026-05-22T20:01:00.000Z',
    }));
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

describe('buildRecentActivityItems', () => {
  it('combines workflow runs and saved artifacts in newest-first order', () => {
    const items = buildRecentActivityItems(
      [
        {
          id: 'conv-1',
          title: 'Market research',
          mode: 'DEEP_RESEARCH',
          updatedAt: '2026-05-22T20:01:00.000Z',
        },
        {
          id: 'conv-2',
          title: 'Launch post',
          mode: 'SOCIAL_WRITING',
          updatedAt: '2026-05-22T20:03:00.000Z',
        },
      ],
      [
        {
          id: 'art-1',
          filename: 'AI research brief.md',
          type: 'text/markdown',
          sizeBytes: 1536,
          conversationId: 'conv-1',
          messageId: 'msg-1',
          content: '# Brief',
          createdAt: '2026-05-22T20:02:00.000Z',
          conversationTitle: 'Market research',
          conversationMode: 'DEEP_RESEARCH',
        },
      ],
    );

    expect(items.map((item) => [item.id, item.kind, item.title])).toEqual([
      ['workflow-conv-2', 'workflow', 'Launch post'],
      ['artifact-art-1', 'artifact', 'AI research brief.md'],
      ['workflow-conv-1', 'workflow', 'Market research'],
    ]);
    expect(items[0]?.href).toBe('/chats/conv-2');
    expect(items[1]?.description).toBe('Market research · DEEP RESEARCH');
  });

  it('respects the provided activity limit', () => {
    const items = buildRecentActivityItems(
      [
        { id: 'conv-1', title: 'One', mode: 'CHAT', updatedAt: '2026-05-22T20:01:00.000Z' },
        { id: 'conv-2', title: 'Two', mode: 'CHAT', updatedAt: '2026-05-22T20:02:00.000Z' },
      ],
      [],
      1,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Two');
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
