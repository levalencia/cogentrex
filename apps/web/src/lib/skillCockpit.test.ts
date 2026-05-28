import type { SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import { buildSkillCockpitModel } from './skillCockpit';

describe('buildSkillCockpitModel', () => {
  it('builds an end-user cockpit model from readiness and recent skill runs', () => {
    const model = buildSkillCockpitModel(
      [
        skillReadiness('chat', 'ready'),
        skillReadiness('deep-research', 'missing', 'Configure web search.'),
        skillReadiness('linkedin-writer', 'degraded', 'Social provider fallback will be used.'),
      ],
      [
        skillRun('run-failed', 'LinkedIn Writer', 'SOCIAL_WRITING', 'failed', '2026-05-23T10:00:00.000Z'),
        skillRun('run-active', 'Deep Research', 'DEEP_RESEARCH', 'running', '2026-05-23T10:02:00.000Z'),
        skillRun('run-done', 'Ask / Chat', 'CHAT', 'completed', '2026-05-23T09:00:00.000Z'),
      ],
    );

    expect(model.readinessSummary).toEqual({ ready: 1, degraded: 1, missing: 1, unconfigured: 4 });
    expect(model.health).toMatchObject({ totalRuns: 3, activeRuns: 1, failedRuns: 1 });
    expect(model.cards.map((card) => [card.id, card.readiness?.label])).toEqual([
      ['ask-chat', 'Ready'],
      ['algorithmic-art', 'Not enabled'],
      ['deep-research', 'Needs setup'],
      ['social-writer', 'Limited'],
      ['image-studio', 'Not enabled'],
      ['video-studio', 'Not enabled'],
      ['artifact-brief', 'Not enabled'],
    ]);
    expect(model.recentRuns.map((run) => run.id)).toEqual(['run-active', 'run-failed', 'run-done']);
    expect(model.recentRuns.map((run) => run.href)).toEqual(['/runs?run=run-active', '/runs?run=run-failed', '/runs?run=run-done']);
  });
});

function skillReadiness(slug: string, status: SkillReadiness['status'], message?: string): SkillReadiness {
  return {
    skill: {
      id: `skl_${slug}`,
      slug,
      name: slug,
      description: slug,
      kind: 'NATIVE',
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      category: null,
      icon: null,
      route: null,
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:00.000Z',
    },
    status,
    dependencies: message ? [{ kind: 'tool', id: 'web.search', label: 'Dependency', required: true, status, message }] : [],
  };
}

function skillRun(id: string, skillName: string, mode: SkillRunSummary['mode'], status: SkillRunSummary['status'], startedAt: string): SkillRunSummary {
  return {
    id,
    userId: 'user-1',
    skillId: `skill-${id}`,
    skillSlug: skillName.toLowerCase().replace(/\s+/g, '-'),
    skillName,
    mode,
    status,
    conversationId: `${id}-conversation`,
    jobId: null,
    providerId: null,
    startedAt,
    completedAt: status === 'running' ? null : startedAt,
    durationMs: status === 'running' ? null : 60000,
    errorMessage: status === 'failed' ? 'Provider failed' : null,
    observability: status === 'completed' ? { sourceCount: 2 } : null,
    eventCount: 2,
  };
}
