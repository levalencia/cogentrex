import type { SkillReadiness } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  applyLauncherReadiness,
  buildWorkflowSelectionGroups,
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
  it('keeps the chat-first launcher focused on existing workflows before aspirational skills', () => {
    const items = getLauncherItems();

    expect(items.map((item) => item.id)).toEqual([
      'ask-chat',
      'algorithmic-art',
      'deep-research',
      'social-writer',
      'image-studio',
      'video-studio',
      'artifact-brief',
    ]);
    expect(items.some((item) => /god mode/i.test(item.label))).toBe(false);
    expect(items.every((item) => item.status === 'available' || item.status === 'near_existing')).toBe(true);
  });

  it('maps primary launcher items to app modes without inventing new routes', () => {
    expect(getPrimaryLauncherItems().map((item) => [item.id, item.mode])).toEqual([
      ['ask-chat', 'CHAT'],
      ['algorithmic-art', 'CHAT'],
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

  it('explains Skill Assist as Auto, Manual, or Off for the composer', () => {
    expect(getSkillAssistModeOptions()).toEqual([
      expect.objectContaining({ mode: 'auto', label: 'Auto' }),
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
      description: 'Cogentrex will choose relevant published skills from your prompt and workflow context.',
      selectedLabels: [],
      suggestedLabels: ['PM coach', 'Mermaid', 'Scrum planner'],
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
    expect(getLauncherPlaceholder('artifact-brief')).toBe('What brief, memo, or artifact should Cogentrex draft?');
    expect(getLauncherPlaceholder('missing')).toBe('Ask Cogentrex... (Press Enter to send)');
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
      message: 'This workflow is not enabled yet.',
    });
  });

  it('separates workflow capabilities from output affordances for selection UI', () => {
    const readiness = [
      skillReadiness('deep-research', 'ready'),
      skillReadiness('artifact-writer', 'ready'),
    ];

    const groups = buildWorkflowSelectionGroups(applyLauncherReadiness(getLauncherItems(), readiness));
    const deepResearch = groups.primaryWorkflows.find((item) => item.id === 'deep-research');

    expect(groups.primaryWorkflows.map((item) => item.id)).toEqual([
      'ask-chat',
      'algorithmic-art',
      'deep-research',
      'social-writer',
      'image-studio',
      'video-studio',
    ]);
    expect(groups.outputAffordances.map((item) => item.id)).toEqual(['artifact-brief']);
    expect(deepResearch?.capabilitySummary).toEqual({
      required: ['Text model', 'Web search'],
      optional: ['Source fetch', 'Streaming trace'],
      outputs: ['Cited answer', 'Saved artifact', 'Diagram-ready outline'],
    });
    expect(deepResearch?.operatorNote).toBe('Research uses capabilities and adapters; diagram or artifact output is an output affordance, not a separate research engine.');
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
