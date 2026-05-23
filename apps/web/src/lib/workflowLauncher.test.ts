import type { SkillReadiness } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  applyLauncherReadiness,
  getLauncherItems,
  getLauncherPlaceholder,
  getPrimaryLauncherItems,
  summarizeLauncherReadiness,
} from './workflowLauncher';

describe('workflow launcher helpers', () => {
  it('keeps the chat-first launcher focused on existing workflows before aspirational skills', () => {
    const items = getLauncherItems();

    expect(items.map((item) => item.id)).toEqual([
      'ask-chat',
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
      ['deep-research', 'DEEP_RESEARCH'],
      ['social-writer', 'SOCIAL_WRITING'],
      ['image-studio', 'IMAGE_GENERATION'],
      ['video-studio', 'VIDEO_GENERATION'],
    ]);
  });

  it('returns mode-aware composer placeholder copy', () => {
    expect(getLauncherPlaceholder('deep-research')).toBe('What should Cogentrex research with sources?');
    expect(getLauncherPlaceholder('artifact-brief')).toBe('What brief, memo, or artifact should Cogentrex draft?');
    expect(getLauncherPlaceholder('missing')).toBe('Ask Cogentrex... (Press Enter to send)');
  });

  it('overlays backend skill readiness onto launcher cards with setup copy', () => {
    const readiness: SkillReadiness[] = [
      skillReadiness('chat', 'ready'),
      skillReadiness('deep-research', 'missing', 'Configure BRAVE_SEARCH_API_KEY to enable web search.'),
      skillReadiness('image-studio', 'degraded', 'Optional provider capability vision is not configured.'),
    ];

    const items = applyLauncherReadiness(getLauncherItems(), readiness);

    expect(items.find((item) => item.id === 'ask-chat')?.readiness).toEqual({
      status: 'ready',
      label: 'Ready',
      message: 'Ready to launch.',
    });
    expect(items.find((item) => item.id === 'deep-research')?.readiness).toEqual({
      status: 'missing',
      label: 'Needs setup',
      message: 'Configure BRAVE_SEARCH_API_KEY to enable web search.',
    });
    expect(items.find((item) => item.id === 'image-studio')?.readiness).toEqual({
      status: 'degraded',
      label: 'Limited',
      message: 'Optional provider capability vision is not configured.',
    });
    expect(items.find((item) => item.id === 'video-studio')?.readiness).toEqual({
      status: 'unconfigured',
      label: 'Not enabled',
      message: 'This skill is not published in the registry yet.',
    });
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
      unconfigured: 3,
    });
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
    dependencies: message ? [{ kind: 'tool', id: 'web.search', label: 'Web search', required: true, status, message }] : [],
  };
}
