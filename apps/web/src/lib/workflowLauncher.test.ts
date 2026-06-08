import type { SkillReadiness } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  applyLauncherReadiness,
  buildWorkflowSelectionGroups,
  getAdminConfigurationModel,
  getLauncherItems,
  getLauncherPlaceholder,
  getLauncherPromptTemplates,
  getLauncherSkillSlug,
  getPrimaryLauncherItems,
  getSkillAssistModeOptions,
  getSkillAssistPickerOptions,
  getSkillAssistSuggestionsForPrompt,
  mergeSkillAssistSlugs,
  previewSkillAssistResolution,
  summarizeLauncherReadiness,
} from './workflowLauncher';

describe('workflow launcher helpers', () => {
  it('keeps the launcher focused on modes first, then task templates', () => {
    const items = getLauncherItems();

    expect(items.map((item) => item.id)).toEqual([
      'ask-chat',
      'deep-research',
      'social-writer',
      'image-studio',
      'video-studio',
      'algorithmic-art',
      'artifact-brief',
    ]);
    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ['ask-chat', 'mode'],
      ['deep-research', 'mode'],
      ['social-writer', 'mode'],
      ['image-studio', 'mode'],
      ['video-studio', 'mode'],
      ['algorithmic-art', 'template'],
      ['artifact-brief', 'template'],
    ]);
    expect(items.some((item) => /god mode/i.test(item.label))).toBe(false);
  });

  it('maps mode launcher items to app modes without treating templates as top-level modes', () => {
    expect(getPrimaryLauncherItems().map((item) => [item.id, item.mode])).toEqual([
      ['ask-chat', 'CHAT'],
      ['deep-research', 'DEEP_RESEARCH'],
      ['social-writer', 'SOCIAL_WRITING'],
      ['image-studio', 'IMAGE_GENERATION'],
      ['video-studio', 'VIDEO_GENERATION'],
    ]);
  });

  it('does not treat user-facing workflow modes as skill manifests', () => {
    expect(getLauncherSkillSlug('ask-chat')).toBeNull();
    expect(getLauncherSkillSlug('algorithmic-art')).toBe('algorithmic-art');
    expect(getLauncherSkillSlug('deep-research')).toBeNull();
    expect(getLauncherSkillSlug('social-writer')).toBeNull();
    expect(getLauncherSkillSlug('image-studio')).toBeNull();
    expect(getLauncherSkillSlug('video-studio')).toBeNull();
    expect(getLauncherSkillSlug('missing')).toBeNull();
  });

  it('exposes a small shared Skill Assist picker for PM and visual/diagram guidance', () => {
    const options = getSkillAssistPickerOptions('CHAT');

    expect(options.map((option) => option.slug)).toEqual([
      'scrum-delivery-planner',
      'project-management-coach',
      'pmp-risk-register',
      'excalidraw-diagramming',
      'mermaid-diagrams',
      'claude-design',
    ]);
    expect(getSkillAssistPickerOptions('DEEP_RESEARCH').map((option) => option.slug)).toEqual(options.map((option) => option.slug));
    expect(getSkillAssistPickerOptions('SOCIAL_WRITING')).toEqual([]);
    expect(options.filter((option) => option.group === 'Project management')).toHaveLength(3);
    expect(options.filter((option) => option.group === 'Visual & diagrams')).toHaveLength(3);
  });

  it('explains Skill Assist as Auto, Hybrid, Manual, or Off for the composer', () => {
    expect(getSkillAssistModeOptions()).toEqual([
      expect.objectContaining({ mode: 'auto', label: 'Auto' }),
      expect.objectContaining({ mode: 'hybrid', label: 'Hybrid' }),
      expect.objectContaining({ mode: 'manual', label: 'Manual' }),
      expect.objectContaining({ mode: 'off', label: 'Off' }),
    ]);
  });

  it('suggests PM plus Mermaid skills for a project timeline diagram prompt', () => {
    expect(getSkillAssistSuggestionsForPrompt('Create a timeline diagram for this project in Mermaid', 'CHAT').map((option) => option.slug)).toEqual([
      'mermaid-diagrams',
      'project-management-coach',
      'scrum-delivery-planner',
    ]);
  });

  it('previews manual selection as explicit skill combination', () => {
    expect(previewSkillAssistResolution({
      mode: 'manual',
      appMode: 'CHAT',
      prompt: 'Create a timeline diagram',
      selectedSkillSlugs: ['project-management-coach', 'mermaid-diagrams'],
    })).toEqual({
      mode: 'manual',
      label: 'Manual: PM coach + Mermaid',
      description: 'Cogentrex will use only the skills you selected for this run.',
      selectedLabels: ['PM coach', 'Mermaid'],
      suggestedLabels: [],
    });
  });

  it('previews Auto as resolver-owned with prompt-based suggestions', () => {
    expect(previewSkillAssistResolution({
      mode: 'auto',
      appMode: 'CHAT',
      prompt: 'Create a project timeline diagram',
      selectedSkillSlugs: [],
    })).toEqual({
      mode: 'auto',
      label: 'Auto skill selection',
      description: 'Cogentrex will choose relevant published skills from your task prompt.',
      selectedLabels: [],
      suggestedLabels: ['PM coach', 'Mermaid', 'Scrum planner'],
    });
  });

  it('previews Hybrid as user-selected skills plus prompt suggestions', () => {
    expect(previewSkillAssistResolution({
      mode: 'hybrid',
      appMode: 'CHAT',
      prompt: 'Create a project timeline diagram in Mermaid',
      selectedSkillSlugs: ['project-management-coach'],
    })).toEqual({
      mode: 'hybrid',
      label: 'Hybrid: PM coach + suggestions',
      description: 'Cogentrex will prioritize your selected skills and add relevant suggestions from the prompt.',
      selectedLabels: ['PM coach'],
      suggestedLabels: ['Mermaid', 'Scrum planner'],
    });
  });

  it('merges launcher and picker skill slugs without duplicates', () => {
    expect(mergeSkillAssistSlugs('algorithmic-art', ['scrum-delivery-planner', 'algorithmic-art'], null)).toEqual([
      'algorithmic-art',
      'scrum-delivery-planner',
    ]);
  });

  it('returns mode-aware composer placeholder copy', () => {
    expect(getLauncherPlaceholder('deep-research')).toBe('What should Cogentrex research with sources?');
    expect(getLauncherPlaceholder('algorithmic-art')).toBe('Describe the generative artwork, palette, motion, medium, and constraints...');
    expect(getLauncherPlaceholder('artifact-brief')).toBe('What brief, memo, or reusable output should Cogentrex create?');
    expect(getLauncherPlaceholder('missing')).toBe('What do you want Cogentrex to do?');
  });

  it('extracts configured workflow prompt templates from readiness route config', () => {
    const readiness: SkillReadiness[] = [
      skillReadiness('chat', 'ready', undefined, 'tool', 'web.search', 'Web search', [
        { id: 'chat-plan', label: 'Plan', prompt: 'Create a plan: ', description: 'Planning chip' },
        { id: 'bad', label: '', prompt: '' },
      ]),
    ];

    expect(getLauncherPromptTemplates('ask-chat', readiness)).toEqual([
      { id: 'chat-plan', label: 'Plan', prompt: 'Create a plan: ', description: 'Planning chip' },
    ]);
    expect(getLauncherPromptTemplates('deep-research', readiness)).toEqual([]);
  });

  it('overlays backend skill readiness onto launcher cards with user-safe setup copy', () => {
    const readiness: SkillReadiness[] = [
      skillReadiness('chat', 'ready'),
      skillReadiness('algorithmic-art', 'ready'),
      skillReadiness('deep-research', 'missing', 'Configure BRAVE_SEARCH_API_KEY to enable web search.'),
      skillReadiness('image-studio', 'degraded', 'Optional provider capability vision is not configured.', 'provider', 'vision', 'Vision'),
    ];

    const items = applyLauncherReadiness(getLauncherItems(), readiness);

    expect(items.find((item) => item.id === 'ask-chat')?.readiness).toEqual({
      status: 'ready',
      label: 'Ready',
      message: 'Ready to launch.',
    });
    expect(items.find((item) => item.id === 'algorithmic-art')?.readiness).toEqual({
      status: 'ready',
      label: 'Ready',
      message: 'Ready to launch.',
    });
    expect(items.find((item) => item.id === 'deep-research')?.readiness).toEqual({
      status: 'missing',
      label: 'Needs setup',
      message: 'Required web search setup is missing.',
    });
    expect(items.find((item) => item.id === 'image-studio')?.readiness).toEqual({
      status: 'degraded',
      label: 'Limited',
      message: 'Optional vision capability is unavailable.',
    });
    expect(items.find((item) => item.id === 'video-studio')?.readiness).toEqual({
      status: 'unconfigured',
      label: 'Not enabled',
      message: 'This mode or template is not enabled yet.',
    });
  });

  it('separates workspace modes from task templates for selection UI', () => {
    const readiness = [
      skillReadiness('deep-research', 'ready'),
      skillReadiness('artifact-writer', 'ready'),
    ];

    const groups = buildWorkflowSelectionGroups(applyLauncherReadiness(getLauncherItems(), readiness));
    const deepResearch = groups.modes.find((item) => item.id === 'deep-research');

    expect(groups.modes.map((item) => item.id)).toEqual([
      'ask-chat',
      'deep-research',
      'social-writer',
      'image-studio',
      'video-studio',
    ]);
    expect(groups.taskTemplates.map((item) => item.id)).toEqual(['algorithmic-art', 'artifact-brief']);
    expect(deepResearch?.capabilitySummary).toEqual({
      required: ['Text model', 'Web search'],
      optional: ['Source fetch', 'Streaming trace'],
      outputs: ['Cited answer', 'Saved artifact', 'Diagram-ready outline'],
    });
    expect(deepResearch?.operatorNote).toBe('Research uses capabilities and adapters; artifacts are reusable outputs, not separate tasks.');
  });

  it('explains the admin configuration boundary between modes, templates, skills, and workflows', () => {
    expect(getAdminConfigurationModel().map((item) => [item.label, item.href])).toEqual([
      ['Modes', '/settings/admin/providers'],
      ['Task templates', '/settings/admin/skills'],
      ['Skills', '/settings/admin/skills'],
      ['Workflows', '/runs'],
    ]);
    expect(getAdminConfigurationModel().find((item) => item.label === 'Task templates')?.description).toContain('prefill a mode, prompt, and suggested skills');
  });

  it('summarizes launcher readiness for cockpit-level status pills', () => {
    const readiness: SkillReadiness[] = [
      skillReadiness('chat', 'ready'),
      skillReadiness('deep-research', 'missing'),
      skillReadiness('image-studio', 'degraded'),
    ];

    const items = applyLauncherReadiness(getLauncherItems(), readiness);

    expect(summarizeLauncherReadiness(items)).toEqual({
      ready: 1,
      degraded: 1,
      missing: 1,
      unconfigured: 4,
    });
  });
});

function skillReadiness(
  slug: string,
  status: SkillReadiness['status'],
  message?: string,
  kind: SkillReadiness['dependencies'][number]['kind'] = 'tool',
  id: SkillReadiness['dependencies'][number]['id'] = 'web.search',
  label = 'Web search',
  promptTemplates: unknown[] = [],
): SkillReadiness {
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
      route: {
        id: `skr_${slug}`,
        skillId: `skl_${slug}`,
        mode: 'CHAT',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: { promptTemplates } as NonNullable<NonNullable<SkillReadiness['skill']['route']>['config']>,
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z',
      },
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:00.000Z',
    },
    status,
    dependencies: message ? [{ kind, id, label, required: true, status, message }] : [],
  };
}
