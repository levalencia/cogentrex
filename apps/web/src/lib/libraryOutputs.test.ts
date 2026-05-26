import { describe, expect, it } from 'vitest';
import type { ArtifactItem } from '@cogentrex/shared';
import {
  buildArtifactDownload,
  buildLibraryArtifactRows,
  buildLibraryModeCards,
  buildLibraryOverviewStats,
  buildRecentActivityItems,
  buildSkillRunDetail,
  buildSkillRunEventRows,
  buildSkillRunHealthStats,
  buildSkillRunHistoryRows,
  filterLibraryArtifacts,
  filterSkillRuns,
  mergeLibraryArtifacts,
  resolveLibraryArtifactSelection,
} from './libraryOutputs';

describe('resolveLibraryArtifactSelection', () => {
  const artifacts: ArtifactItem[] = [
    {
      id: 'art-1',
      filename: 'First.md',
      type: 'text/markdown',
      sizeBytes: 10,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      content: 'First',
      createdAt: '2026-05-22T20:00:00.000Z',
      conversationTitle: 'First conversation',
      conversationMode: 'CHAT',
    },
    {
      id: 'art-2',
      filename: 'Second.md',
      type: 'text/markdown',
      sizeBytes: 20,
      conversationId: 'conv-2',
      messageId: 'msg-2',
      content: 'Second',
      createdAt: '2026-05-22T20:01:00.000Z',
      conversationTitle: 'Second conversation',
      conversationMode: 'DEEP_RESEARCH',
    },
  ];

  it('selects a requested deep-linked artifact when it exists', () => {
    expect(resolveLibraryArtifactSelection(artifacts, null, 'art-2')).toEqual({
      selectedArtifactId: 'art-2',
      requestedArtifactMissing: false,
    });
  });

  it('keeps current selection when a requested artifact is missing and current selection is still visible', () => {
    expect(resolveLibraryArtifactSelection(artifacts, 'art-1', 'missing-artifact')).toEqual({
      selectedArtifactId: 'art-1',
      requestedArtifactMissing: true,
    });
  });

  it('falls back to the first visible artifact when selection is missing or invalid', () => {
    expect(resolveLibraryArtifactSelection(artifacts, 'gone', null)).toEqual({
      selectedArtifactId: 'art-1',
      requestedArtifactMissing: false,
    });
  });

  it('returns an empty safe state when no artifacts are visible', () => {
    expect(resolveLibraryArtifactSelection([], 'art-1', 'art-1')).toEqual({
      selectedArtifactId: null,
      requestedArtifactMissing: true,
    });
  });
});

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

  it('classifies conversations by completed skill run mode when persisted conversation mode is stale', () => {
    const cards = buildLibraryModeCards([
      { id: 'conv-stale', title: 'Started as chat', mode: 'CHAT', updatedAt: '2026-05-22T20:00:00.000Z' },
    ], [
      {
        id: 'run-1',
        userId: 'user-1',
        skillId: 'skl_deep_research',
        skillSlug: 'deep-research',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: 'conv-stale',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:00:00.000Z',
        completedAt: '2026-05-22T20:03:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: { sourceCount: 3 },
      },
    ]);

    expect(cards.map((card) => [card.id, card.count])).toEqual([
      ['research', 1],
      ['social', 0],
      ['media', 0],
      ['chat', 0],
    ]);
  });

  it('counts saved artifact cards by artifact provenance instead of a newer conversation run', () => {
    const cards = buildLibraryModeCards([
      { id: 'conv-mixed', title: 'Started as chat', mode: 'CHAT', updatedAt: '2026-05-22T20:05:00.000Z' },
    ], [
      {
        id: 'run-deep-research',
        userId: 'user-1',
        skillId: 'skl_deep_research',
        skillSlug: 'deep-research',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: 'conv-mixed',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:00:00.000Z',
        completedAt: '2026-05-22T20:03:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: { messageId: 'msg-deep-research', sourceCount: 3, savedArtifactCount: 1 },
      },
      {
        id: 'run-newer-chat',
        userId: 'user-1',
        skillId: 'skl_chat',
        skillSlug: 'chat',
        skillName: 'Chat',
        mode: 'CHAT',
        status: 'completed',
        conversationId: 'conv-mixed',
        jobId: null,
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:04:00.000Z',
        completedAt: '2026-05-22T20:05:00.000Z',
        durationMs: 60000,
        errorMessage: null,
        observability: { messageId: 'msg-newer-chat' },
      },
    ], [
      {
        id: 'art-deep-research',
        filename: 'Brief.md',
        type: 'text/markdown',
        sizeBytes: 20,
        conversationId: 'conv-mixed',
        messageId: 'msg-deep-research',
        content: 'Brief',
        createdAt: '2026-05-22T20:06:00.000Z',
        conversationTitle: 'Started as chat',
        conversationMode: 'CHAT',
        baseConversationMode: 'CHAT',
        skillRunName: 'Deep Research',
        skillRunStatus: 'completed',
      },
    ]);

    expect(cards.map((card) => [card.id, card.count])).toEqual([
      ['research', 1],
      ['social', 0],
      ['media', 0],
      ['chat', 0],
    ]);
  });

  it('uses active Deep Research skill runs to type stale chat conversations before completion', () => {
    const cards = buildLibraryModeCards([
      { id: 'conv-running-research', title: 'Started as chat', mode: 'CHAT', updatedAt: '2026-05-22T20:00:00.000Z' },
    ], [
      {
        id: 'run-running',
        userId: 'user-1',
        skillId: 'skl_deep_research',
        skillSlug: 'deep-research',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'running',
        conversationId: 'conv-running-research',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:00:00.000Z',
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        observability: { phase: 'searching' },
      },
    ]);

    expect(cards.map((card) => [card.id, card.count])).toEqual([
      ['research', 1],
      ['social', 0],
      ['media', 0],
      ['chat', 0],
    ]);
  });

  it('counts standalone Deep Research skill runs in library output buckets', () => {
    const cards = buildLibraryModeCards([], [
      {
        id: 'run-standalone',
        userId: 'user-1',
        skillId: 'skl_deep_research',
        skillSlug: 'deep-research',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: null,
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:00:00.000Z',
        completedAt: '2026-05-22T20:03:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: { sourceCount: 3 },
      },
    ]);

    expect(cards.map((card) => [card.id, card.count])).toEqual([
      ['research', 1],
      ['social', 0],
      ['media', 0],
      ['chat', 0],
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
  it('includes standalone skill runs in workflow stats and latest activity', () => {
    const stats = buildLibraryOverviewStats(
      [],
      [],
      [
        {
          id: 'run-1',
          userId: 'user-1',
          skillId: 'skill-1',
          skillSlug: 'deep-research-default',
          skillName: 'Deep Research',
          mode: 'DEEP_RESEARCH',
          status: 'completed',
          conversationId: null,
          jobId: 'job-1',
          providerId: 'provider-1',
          startedAt: '2026-05-22T20:01:00.000Z',
          completedAt: '2026-05-22T20:04:00.000Z',
          durationMs: 180000,
          errorMessage: null,
          observability: { sourceCount: 4 },
        },
      ],
    );

    expect(stats).toEqual({
      totalWorkflows: 1,
      savedArtifacts: 0,
      savedPerWorkflowLabel: '0.0',
      latestActivityAt: '2026-05-22T20:04:00.000Z',
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

  it('uses server-derived artifact provenance before falling back to stale conversation mode', () => {
    const rows = buildLibraryArtifactRows([
      {
        id: 'art-1',
        filename: 'Research answer.md',
        type: 'text/markdown',
        sizeBytes: 1536,
        conversationId: 'conv-stale',
        messageId: 'msg-1',
        content: '# Research answer',
        createdAt: '2026-05-22T20:01:00.000Z',
        conversationTitle: 'Started as chat',
        conversationMode: 'CHAT',
        baseConversationMode: 'CHAT',
        effectiveMode: 'DEEP_RESEARCH',
        skillRunId: 'run-1',
        skillRunName: 'Deep Research',
        skillRunStatus: 'completed',
      },
    ]);

    expect(rows[0]?.subtitle).toBe('Started as chat · DEEP RESEARCH · Deep Research completed');
  });

  it('prefers the message-linked skill run over a newer generic run in the same conversation', () => {
    const rows = buildLibraryArtifactRows([
      {
        id: 'art-1',
        filename: 'Research answer.md',
        type: 'text/markdown',
        sizeBytes: 1536,
        conversationId: 'conv-mixed',
        messageId: 'msg-deep-research',
        content: '# Research answer',
        createdAt: '2026-05-22T20:06:00.000Z',
        conversationTitle: 'Started as chat',
        conversationMode: 'CHAT',
      },
    ], [
      {
        id: 'run-deep-research',
        userId: 'user-1',
        skillId: 'skl_deep_research',
        skillSlug: 'deep-research',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: 'conv-mixed',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:00:00.000Z',
        completedAt: '2026-05-22T20:03:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: { messageId: 'msg-deep-research', sourceCount: 3 },
      },
      {
        id: 'run-newer-chat',
        userId: 'user-1',
        skillId: 'skl_chat',
        skillSlug: 'chat',
        skillName: 'Chat',
        mode: 'CHAT',
        status: 'completed',
        conversationId: 'conv-mixed',
        jobId: null,
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:04:00.000Z',
        completedAt: '2026-05-22T20:05:00.000Z',
        durationMs: 60000,
        errorMessage: null,
        observability: { messageId: 'msg-newer-chat' },
      },
    ]);

    expect(rows[0]?.subtitle).toBe('Started as chat · DEEP RESEARCH');
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

  it('labels recent saved artifacts by Deep Research skill run mode when artifact mode is stale', () => {
    const items = buildRecentActivityItems(
      [],
      [
        {
          id: 'art-stale',
          filename: 'Research answer.md',
          type: 'text/markdown',
          sizeBytes: 1536,
          conversationId: 'conv-stale',
          messageId: 'msg-1',
          content: '# Research answer',
          createdAt: '2026-05-22T20:04:00.000Z',
          conversationTitle: 'Started as chat',
          conversationMode: 'CHAT',
        },
      ],
      [
        {
          id: 'run-1',
          userId: 'user-1',
          skillId: 'skl_deep_research',
          skillSlug: 'deep-research',
          skillName: 'Deep Research',
          mode: 'DEEP_RESEARCH',
          status: 'completed',
          conversationId: 'conv-stale',
          jobId: 'job-1',
          providerId: 'provider-1',
          startedAt: '2026-05-22T20:00:00.000Z',
          completedAt: '2026-05-22T20:03:00.000Z',
          durationMs: 180000,
          errorMessage: null,
          observability: { messageId: 'msg-1', sourceCount: 3 },
        },
        {
          id: 'run-newer-chat',
          userId: 'user-1',
          skillId: 'skl_chat',
          skillSlug: 'chat',
          skillName: 'Chat',
          mode: 'CHAT',
          status: 'completed',
          conversationId: 'conv-stale',
          jobId: null,
          providerId: 'provider-1',
          startedAt: '2026-05-22T20:03:00.000Z',
          completedAt: '2026-05-22T20:03:30.000Z',
          durationMs: 30000,
          errorMessage: null,
          observability: { messageId: 'msg-newer-chat' },
        },
      ],
    );

    expect(items.find((item) => item.id === 'artifact-art-stale')?.description).toBe('Started as chat · DEEP RESEARCH');
  });

  it('shows skill runs as first-class recent activity without duplicating linked conversations', () => {
    const items = buildRecentActivityItems(
      [
        {
          id: 'conv-1',
          title: 'Market research conversation',
          mode: 'DEEP_RESEARCH',
          updatedAt: '2026-05-22T20:03:00.000Z',
        },
      ],
      [],
      [
        {
          id: 'run-1',
          userId: 'user-1',
          skillId: 'skill-1',
          skillSlug: 'deep-research-default',
          skillName: 'Deep Research',
          mode: 'DEEP_RESEARCH',
          status: 'completed',
          conversationId: 'conv-1',
          jobId: 'job-1',
          providerId: 'provider-1',
          startedAt: '2026-05-22T20:01:00.000Z',
          completedAt: '2026-05-22T20:04:00.000Z',
          durationMs: 180000,
          errorMessage: null,
          observability: { sourceCount: 4 },
        },
      ],
    );

    expect(items.map((item) => [item.id, item.kind, item.title, item.href])).toEqual([
      ['skill-run-run-1', 'workflow', 'Deep Research', '/chats/conv-1'],
    ]);
    expect(items[0]?.eyebrow).toBe('DEEP RESEARCH · completed');
    expect(items[0]?.description).toBe('Completed skill run in 180s.');
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

describe('buildSkillRunHealthStats', () => {
  it('summarizes run health by status and latest run timestamp', () => {
    const stats = buildSkillRunHealthStats([
      {
        id: 'run-1',
        userId: 'user-1',
        skillId: 'skill-1',
        skillSlug: 'deep-research-default',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: 'conv-1',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:01:00.000Z',
        completedAt: '2026-05-22T20:04:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: { sourceCount: 4 },
      },
      {
        id: 'run-2',
        userId: 'user-1',
        skillId: 'skill-2',
        skillSlug: 'social-writer',
        skillName: 'Social Writer',
        mode: 'SOCIAL_WRITING',
        status: 'failed',
        conversationId: 'conv-2',
        jobId: null,
        providerId: 'provider-2',
        startedAt: '2026-05-22T20:06:00.000Z',
        completedAt: '2026-05-22T20:07:00.000Z',
        durationMs: 60000,
        errorMessage: 'Provider unavailable',
        observability: { phase: 'failed' },
      },
      {
        id: 'run-3',
        userId: 'user-1',
        skillId: 'skill-3',
        skillSlug: 'image-studio',
        skillName: 'Image Studio',
        mode: 'IMAGE_GENERATION',
        status: 'running',
        conversationId: 'conv-3',
        jobId: null,
        providerId: 'provider-3',
        startedAt: '2026-05-22T20:09:00.000Z',
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        observability: { type: 'image' },
      },
    ]);

    expect(stats).toEqual({
      totalRuns: 3,
      completedRuns: 1,
      activeRuns: 1,
      failedRuns: 1,
      latestRunAt: '2026-05-22T20:09:00.000Z',
    });
  });
});

describe('buildSkillRunHistoryRows', () => {
  it('turns skill runs into auditable rows with status, duration, metrics, and drill-down links', () => {
    const rows = buildSkillRunHistoryRows([
      {
        id: 'run-1',
        userId: 'user-1',
        skillId: 'skill-1',
        skillSlug: 'deep-research-default',
        skillName: 'Deep Research',
        mode: 'DEEP_RESEARCH',
        status: 'completed',
        conversationId: 'conv-1',
        jobId: 'job-1',
        providerId: 'provider-1',
        startedAt: '2026-05-22T20:01:00.000Z',
        completedAt: '2026-05-22T20:04:00.000Z',
        durationMs: 180000,
        errorMessage: null,
        observability: {
          sourceCount: 4,
          newSourceCount: 3,
          planLength: 5,
          estimatedTokens: 1234,
          synthesisDurationMs: 45000,
        },
      },
      {
        id: 'run-2',
        userId: 'user-1',
        skillId: 'skill-2',
        skillSlug: 'social-writer',
        skillName: 'Social Writer',
        mode: 'SOCIAL_WRITING',
        status: 'failed',
        conversationId: null,
        jobId: null,
        providerId: null,
        startedAt: '2026-05-22T20:05:00.000Z',
        completedAt: '2026-05-22T20:06:00.000Z',
        durationMs: 60000,
        errorMessage: 'Provider unavailable',
        observability: { phase: 'failed' },
      },
    ]);

    expect(rows.map((row) => row.id)).toEqual(['run-2', 'run-1']);
    expect(rows[0]).toEqual(expect.objectContaining({
      skillName: 'Social Writer',
      statusLabel: 'Failed',
      statusTone: 'danger',
      durationLabel: '60s',
      href: '/',
      summary: 'Provider unavailable',
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      skillName: 'Deep Research',
      modeLabel: 'DEEP RESEARCH',
      statusLabel: 'Completed',
      statusTone: 'success',
      durationLabel: '3m',
      href: '/chats/conv-1',
      timestamp: '2026-05-22T20:04:00.000Z',
      summary: 'Completed with 4 sources.',
    }));
    expect(rows[1]?.metrics).toEqual(['4 sources', '3 new', '5 plan steps', '1.2k tokens', '45s synthesis']);
  });
});

describe('buildSkillRunDetail', () => {
  it('builds a drawer-ready skill run detail model with links, metrics, and observability entries', () => {
    const detail = buildSkillRunDetail({
      id: 'run-1',
      userId: 'user-1',
      skillId: 'skill-1',
      skillSlug: 'deep-research-default',
      skillName: 'Deep Research',
      mode: 'DEEP_RESEARCH',
      status: 'completed',
      conversationId: 'conv-1',
      jobId: 'job-1',
      providerId: 'provider-1',
      startedAt: '2026-05-22T20:01:00.000Z',
      completedAt: '2026-05-22T20:04:00.000Z',
      durationMs: 180000,
      errorMessage: null,
      observability: {
        phase: 'synthesis',
        sourceCount: 4,
        newSourceCount: 2,
        planLength: 5,
        estimatedTokens: 1234,
        synthesisDurationMs: 45000,
        platforms: ['linkedin', 'x'],
        savedArtifactCount: 1,
        savedArtifactIds: ['art-1'],
        nested: { phase: 'synthesis' },
      },
    });

    expect(detail).toEqual(expect.objectContaining({
      id: 'run-1',
      skillName: 'Deep Research',
      skillSlug: 'deep-research-default',
      modeLabel: 'DEEP RESEARCH',
      statusLabel: 'Completed',
      statusTone: 'success',
      durationLabel: '3m',
      conversationHref: '/chats/conv-1',
      jobId: 'job-1',
      providerId: 'provider-1',
      summary: 'Completed with 4 sources.',
    }));
    expect(detail.metrics).toEqual(['4 sources', '2 new', '5 plan steps', '1.2k tokens', '45s synthesis', '2 platforms', '1 saved artifact']);
    expect(detail.criticalObservabilityEntries).toEqual([
      { label: 'Phase', value: 'synthesis' },
      { label: 'Sources', value: '4' },
      { label: 'New sources', value: '2' },
      { label: 'Plan steps', value: '5' },
      { label: 'Estimated tokens', value: '1.2k' },
      { label: 'Synthesis time', value: '45s' },
      { label: 'Platforms', value: 'linkedin, x' },
      { label: 'Saved artifacts', value: '1' },
    ]);
    expect(detail.savedArtifactLinks).toEqual([
      { id: 'art-1', href: '/library?artifact=art-1', label: 'Artifact art-1' },
    ]);
    expect(detail.observabilityEntries).toEqual([
      { key: 'estimatedTokens', value: '1234' },
      { key: 'nested', value: '{"phase":"synthesis"}' },
      { key: 'newSourceCount', value: '2' },
      { key: 'phase', value: 'synthesis' },
      { key: 'planLength', value: '5' },
      { key: 'platforms', value: 'linkedin, x' },
      { key: 'savedArtifactCount', value: '1' },
      { key: 'savedArtifactIds', value: 'art-1' },
      { key: 'sourceCount', value: '4' },
      { key: 'synthesisDurationMs', value: '45000' },
    ]);
  });

  it('uses saved artifact metadata when building Library links from run observability', () => {
    const detail = buildSkillRunDetail({
      id: 'run-1',
      userId: 'user-1',
      skillId: 'skill-1',
      skillSlug: 'linkedin-writer',
      skillName: 'LinkedIn Writer',
      mode: 'SOCIAL_WRITING',
      status: 'completed',
      conversationId: 'conv-1',
      jobId: null,
      providerId: 'provider-1',
      startedAt: '2026-05-22T20:01:00.000Z',
      completedAt: '2026-05-22T20:04:00.000Z',
      durationMs: 180000,
      errorMessage: null,
      observability: {
        savedArtifactIds: ['art-1', 'art-2'],
        savedArtifacts: [
          { id: 'art-1', filename: 'LinkedIn launch draft.md', type: 'text/markdown' },
          { id: 'art-2', filename: 'Follow-up post.md', type: 'text/markdown' },
        ],
      },
    });

    expect(detail.savedArtifactLinks).toEqual([
      { id: 'art-1', href: '/library?artifact=art-1', label: 'LinkedIn launch draft.md' },
      { id: 'art-2', href: '/library?artifact=art-2', label: 'Follow-up post.md' },
    ]);
    expect(detail.observabilityEntries.some((entry) => entry.key === 'savedArtifacts')).toBe(false);
  });
});

describe('buildSkillRunEventRows', () => {
  it('turns persisted skill run events into drawer timeline rows', () => {
    const rows = buildSkillRunEventRows([
      {
        id: 'event-2',
        runId: 'run-1',
        userId: 'user-1',
        sequence: 2,
        eventType: 'run_completed',
        label: 'Social Writer completed',
        message: null,
        metadata: { postCount: 1, platforms: ['linkedin'] },
        createdAt: '2026-05-22T20:03:00.000Z',
      },
      {
        id: 'event-1',
        runId: 'run-1',
        userId: 'user-1',
        sequence: 1,
        eventType: 'run_started',
        label: 'Social Writer started',
        message: 'Starting provider request',
        metadata: { mode: 'SOCIAL_WRITING' },
        createdAt: '2026-05-22T20:01:00.000Z',
      },
    ]);

    expect(rows).toEqual([
      {
        id: 'event-1',
        sequenceLabel: '#1',
        label: 'Social Writer started',
        eventType: 'run_started',
        message: 'Starting provider request',
        metadataEntries: [{ key: 'mode', value: 'SOCIAL_WRITING' }],
        createdAt: '2026-05-22T20:01:00.000Z',
      },
      {
        id: 'event-2',
        sequenceLabel: '#2',
        label: 'Social Writer completed',
        eventType: 'run_completed',
        message: null,
        metadataEntries: [
          { key: 'platforms', value: 'linkedin' },
          { key: 'postCount', value: '1' },
        ],
        createdAt: '2026-05-22T20:03:00.000Z',
      },
    ]);
  });
});

describe('filterSkillRuns', () => {
  const runs = [
    {
      id: 'run-1',
      userId: 'user-1',
      skillId: 'skill-1',
      skillSlug: 'deep-research-default',
      skillName: 'Deep Research',
      mode: 'DEEP_RESEARCH' as const,
      status: 'completed' as const,
      conversationId: 'conv-1',
      jobId: 'job-1',
      providerId: 'firecrawl',
      startedAt: '2026-05-22T20:01:00.000Z',
      completedAt: '2026-05-22T20:04:00.000Z',
      durationMs: 180000,
      errorMessage: null,
      observability: { sourceCount: 4, phase: 'synthesis' },
    },
    {
      id: 'run-2',
      userId: 'user-1',
      skillId: 'skill-2',
      skillSlug: 'linkedin-writer',
      skillName: 'LinkedIn Writer',
      mode: 'SOCIAL_WRITING' as const,
      status: 'failed' as const,
      conversationId: null,
      jobId: null,
      providerId: null,
      startedAt: '2026-05-22T20:05:00.000Z',
      completedAt: '2026-05-22T20:06:00.000Z',
      durationMs: 60000,
      errorMessage: 'Provider unavailable',
      observability: { phase: 'publish' },
    },
    {
      id: 'run-3',
      userId: 'user-1',
      skillId: 'skill-3',
      skillSlug: 'image-studio',
      skillName: 'Image Studio',
      mode: 'IMAGE_GENERATION' as const,
      status: 'running' as const,
      conversationId: 'conv-3',
      jobId: 'job-3',
      providerId: 'foundry',
      startedAt: '2026-05-22T20:07:00.000Z',
      completedAt: null,
      durationMs: null,
      errorMessage: null,
      observability: { promptLength: 120 },
    },
  ];

  it('filters skill runs by status, mode, and searchable metadata while preserving newest-first order', () => {
    expect(filterSkillRuns(runs, { status: 'failed', mode: 'all', query: 'provider' }).map((run) => run.id)).toEqual(['run-2']);
    expect(filterSkillRuns(runs, { status: 'all', mode: 'DEEP_RESEARCH', query: 'firecrawl' }).map((run) => run.id)).toEqual(['run-1']);
    expect(filterSkillRuns(runs, { status: 'active', mode: 'all', query: 'image' }).map((run) => run.id)).toEqual(['run-3']);
    expect(filterSkillRuns(runs, { status: 'all', mode: 'all', query: '' }).map((run) => run.id)).toEqual(['run-3', 'run-2', 'run-1']);
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
