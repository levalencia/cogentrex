import type { SkillDetail, SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import { buildSkillManifestModel, getSkillLaunchPath } from './skillManifest';

describe('skill manifest helpers', () => {
  it('builds a launchable manifest model from stored skill detail, readiness, and runs', () => {
    const model = buildSkillManifestModel(
      skillDetail({
        slug: 'deep-research',
        name: 'Deep Research',
        inputSchema: {
          fields: [
            { name: 'question', label: 'Research question', type: 'textarea', required: true },
            { name: 'sourceLimit', label: 'Source limit', type: 'number', required: false },
          ],
        },
        outputContract: {
          artifacts: ['Cited answer', 'Source list'],
          savesToLibrary: true,
        },
      }),
      readiness('deep-research', 'degraded'),
      [
        skillRun('run-old', 'deep-research', 'completed', '2026-05-22T09:00:00.000Z'),
        skillRun('run-new', 'deep-research', 'failed', '2026-05-22T11:00:00.000Z'),
        skillRun('run-other', 'chat', 'completed', '2026-05-22T12:00:00.000Z'),
      ],
    );

    expect(model.slug).toBe('deep-research');
    expect(model.readiness).toMatchObject({ label: 'Limited', tone: 'warning' });
    expect(model.inputs.map((input) => `${input.label}:${input.required}`)).toEqual([
      'Research question:true',
      'Source limit:false',
    ]);
    expect(model.outputs).toEqual(['Cited answer', 'Source list', 'Saved library artifact']);
    expect(model.requiredCapabilities).toEqual(['Text generation provider', 'Web search tool']);
    expect(model.optionalCapabilities).toEqual(['URL fetch tool']);
    expect(model.latestRun?.id).toBe('run-new');
    expect(model.launchPath).toBe('/chats');
  });

  it('falls back to a prompt input and route-derived launch path for minimal skills', () => {
    const model = buildSkillManifestModel(skillDetail({ slug: 'image-studio', route: route('IMAGE_GENERATION'), inputSchema: null, outputContract: null }), null, []);

    expect(model.inputs).toEqual([{ name: 'prompt', label: 'Prompt', type: 'textarea', required: true, helpText: 'Describe what this skill should do.' }]);
    expect(model.outputs).toEqual(['Task result', 'Run trace']);
    expect(model.launchPath).toBe('/chats');
    expect(getSkillLaunchPath(route('CHAT'))).toBe('/chats');
  });
});

function skillDetail(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: 'skill-1',
    slug: 'chat',
    name: 'Chat',
    description: 'General assistant workflow.',
    kind: 'NATIVE',
    status: 'PUBLISHED',
    visibility: 'USER_VISIBLE',
    category: 'Core',
    icon: 'message-circle',
    route: route('CHAT'),
    inputSchema: null,
    outputContract: null,
    toolRequirements: [],
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    ...overrides,
  };
}

function route(mode: SkillDetail['route'] extends infer Route ? Route extends { mode: infer Mode } ? Mode : never : never): NonNullable<SkillDetail['route']> {
  return {
    id: `route-${mode}`,
    skillId: 'skill-1',
    mode,
    defaultProviderId: null,
    searchProfile: null,
    maxBudgetCents: null,
    config: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
  };
}

function readiness(slug: string, status: SkillReadiness['status']): SkillReadiness {
  return {
    skill: skillDetail({ slug }),
    status,
    dependencies: [
      { kind: 'provider', id: 'text', label: 'Text generation provider', required: true, status: 'ready', message: 'Satisfied by default provider.' },
      { kind: 'tool', id: 'web.search', label: 'Web search tool', required: true, status, message: 'Configured with Serper.' },
      { kind: 'tool', id: 'web.fetch', label: 'URL fetch tool', required: false, status: 'missing', message: 'Optional fetch adapter is unavailable.' },
    ],
  };
}

function skillRun(id: string, skillSlug: string, status: SkillRunSummary['status'], startedAt: string): SkillRunSummary {
  return {
    id,
    userId: 'user-1',
    skillId: `skill-${skillSlug}`,
    skillSlug,
    skillName: skillSlug,
    mode: 'CHAT',
    status,
    conversationId: `${id}-conversation`,
    jobId: null,
    providerId: null,
    startedAt,
    completedAt: status === 'running' ? null : startedAt,
    durationMs: status === 'running' ? null : 1000,
    errorMessage: status === 'failed' ? 'Provider failed' : null,
    observability: null,
    eventCount: 1,
  };
}
