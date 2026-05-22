import type { SkillSummary } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  getSkillBadges,
  getSkillRouteDraft,
} from './skills';

function skill(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id: 'skill-1',
    slug: 'deep-research-default',
    name: 'Deep Research',
    description: 'Plan, search, collect sources, and synthesize cited answers.',
    kind: 'NATIVE',
    status: 'STAGED',
    visibility: 'ADMIN_ONLY',
    category: 'Research',
    icon: '🔎',
    route: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('admin skill helpers', () => {
  it('summarizes status, visibility, kind, category, and route badges', () => {
    expect(getSkillBadges(skill({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      route: {
        id: 'route-1',
        skillId: 'skill-1',
        mode: 'DEEP_RESEARCH',
        defaultProviderId: 'provider-1',
        searchProfile: 'web-deep',
        maxBudgetCents: 250,
        config: { temperature: 0.2 },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    }))).toEqual([
      { label: 'Published', className: 'border-green-500/30 bg-green-500/10 text-green-200' },
      { label: 'User visible', className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' },
      { label: 'Native', className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
      { label: 'Research', className: 'border-purple-500/30 bg-purple-500/10 text-purple-200' },
      { label: 'Route: Deep Research', className: 'border-blue-500/30 bg-blue-500/10 text-blue-200' },
    ]);
  });

  it('normalizes edit form values from an existing skill route', () => {
    expect(getSkillRouteDraft(skill({
      route: {
        id: 'route-1',
        skillId: 'skill-1',
        mode: 'CHAT',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: { maxSources: 8 },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    }))).toEqual({
      mode: 'CHAT',
      defaultProviderId: '',
      searchProfile: '',
      maxBudgetCents: '',
      configJson: '{\n  "maxSources": 8\n}',
    });
  });

  it('builds skill metadata update payloads with nullable optional fields', () => {
    expect(buildSkillUpdatePayload({
      status: 'DISABLED',
      visibility: 'ADMIN_ONLY',
      category: '',
      icon: '  🧠  ',
    })).toEqual({
      status: 'DISABLED',
      visibility: 'ADMIN_ONLY',
      category: null,
      icon: '🧠',
    });
  });

  it('builds route payloads with trimmed strings, nullable blanks, numeric budget, and parsed JSON config', () => {
    expect(buildSkillRoutePayload({
      mode: 'DEEP_RESEARCH',
      defaultProviderId: '',
      searchProfile: '  web-deep  ',
      maxBudgetCents: '250',
      configJson: '{"temperature":0.2}',
    })).toEqual({
      mode: 'DEEP_RESEARCH',
      defaultProviderId: null,
      searchProfile: 'web-deep',
      maxBudgetCents: 250,
      config: { temperature: 0.2 },
    });
  });

  it('rejects route config JSON that is not an object', () => {
    expect(() => buildSkillRoutePayload({
      mode: 'CHAT',
      defaultProviderId: 'provider-1',
      searchProfile: '',
      maxBudgetCents: '',
      configJson: '["not", "an", "object"]',
    })).toThrow('Config JSON must be an object');
  });
});
