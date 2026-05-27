import type { AdminAnalyticsSummary, SkillReadiness, SkillSummary } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  buildAdminSkillCatalog,
  buildAdminSkillMetrics,
  buildSkillDetailModel,
  buildSkillFileViews,
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  buildSkillKitImportPayload,
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

function readiness(slug: string, status: SkillReadiness['status'], message = 'Configure search.'): SkillReadiness {
  return {
    skill: skill({ id: `skill-${slug}`, slug, status: 'PUBLISHED', visibility: 'USER_VISIBLE' }),
    status,
    dependencies: [{ kind: 'tool', id: 'web.search', label: 'Web search', required: true, status, message }],
  };
}

function analytics(): AdminAnalyticsSummary {
  return {
    generatedAt: '2026-05-22T00:00:00.000Z',
    totals: { totalRuns: 12, completedRuns: 9, failedRuns: 3, activeRuns: 0, successRate: 75, averageDurationMs: 1200 },
    topSkills: [{
      skillSlug: 'deep-research',
      skillName: 'Deep Research',
      mode: 'DEEP_RESEARCH',
      totalRuns: 12,
      completedRuns: 9,
      failedRuns: 3,
      activeRuns: 0,
      successRate: 75,
      averageDurationMs: 1200,
      latestRunAt: '2026-05-22T01:00:00.000Z',
    }],
    modeBreakdown: [],
    providerUsage: [],
    recentFailures: [],
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

  it('builds skill kit import payloads from repo URL plus scoped folder', () => {
    expect(buildSkillKitImportPayload({
      sourceUrl: '  https://github.com/acme/agent-skills  ',
      folderPath: ' /skills/excalidraw/ ',
      ref: ' main ',
    })).toEqual({
      sourceUrl: 'https://github.com/acme/agent-skills',
      folderPath: 'skills/excalidraw',
      ref: 'main',
    });
  });

  it('rejects unsafe skill kit folder paths before import', () => {
    expect(() => buildSkillKitImportPayload({
      sourceUrl: 'https://github.com/acme/agent-skills',
      folderPath: 'skills/../secrets',
      ref: '',
    })).toThrow('Folder path cannot contain . or .. segments');
  });

  it('builds admin catalog rows with readiness, usage, and action priority', () => {
    const deepResearch = skill({
      id: 'skill-deep',
      slug: 'deep-research',
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      route: {
        id: 'route-deep',
        skillId: 'skill-deep',
        mode: 'DEEP_RESEARCH',
        defaultProviderId: 'provider-1',
        searchProfile: 'web-deep',
        maxBudgetCents: 250,
        config: null,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    });
    const disabledChat = skill({ id: 'skill-chat', slug: 'chat', name: 'Chat', status: 'DISABLED', visibility: 'ADMIN_ONLY', route: null });

    const rows = buildAdminSkillCatalog([disabledChat, deepResearch], [readiness('deep-research', 'missing')], analytics());

    expect(rows.map((row) => ({ slug: row.slug, priority: row.priority, readinessLabel: row.readinessLabel, usageLabel: row.usageLabel, routeLabel: row.routeLabel }))).toEqual([
      {
        slug: 'deep-research',
        priority: 'Needs setup',
        readinessLabel: 'Needs setup',
        usageLabel: '12 runs · 75% success',
        routeLabel: 'Deep Research · provider-1 · web-deep · 250¢',
      },
      {
        slug: 'chat',
        priority: 'Disabled',
        readinessLabel: 'Not checked',
        usageLabel: 'No runs yet',
        routeLabel: 'No route configured',
      },
    ]);
  });

  it('builds a skill detail model with admin next action and dependency copy', () => {
    const model = buildSkillDetailModel(
      skill({ id: 'skill-deep', slug: 'deep-research', status: 'PUBLISHED', visibility: 'USER_VISIBLE' }),
      readiness('deep-research', 'degraded', 'Source fetch is unavailable.'),
      analytics(),
    );

    expect(model).toMatchObject({
      slug: 'deep-research',
      readinessLabel: 'Limited',
      nextAction: 'Verify optional dependencies or provider route quality.',
      usageLabel: '12 runs · 75% success',
      dependencySummaries: ['Web search: Limited — Source fetch is unavailable.'],
    });
  });

  it('builds skill file views with SKILL.md instructions marked read-only', () => {
    const views = buildSkillFileViews([
      {
        id: 'file-skill',
        skillId: 'skill-excalidraw',
        path: 'SKILL.md',
        kind: 'skill',
        content: '# Excalidraw\n\nUse references/color.md.',
        contentType: 'text/markdown',
        sha256: 'abc123',
        sizeBytes: 34,
        executable: false,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
      {
        id: 'file-ref',
        skillId: 'skill-excalidraw',
        path: 'references/color.md',
        kind: 'reference',
        content: '# Color',
        contentType: 'text/markdown',
        sha256: 'def456',
        sizeBytes: 7,
        executable: false,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    ]);

    expect(views.map((view) => ({ path: view.path, label: view.label, role: view.role, byteLabel: view.byteLabel }))).toEqual([
      { path: 'SKILL.md', label: 'Instructions', role: 'Read-only instructions', byteLabel: '34 B' },
      { path: 'references/color.md', label: 'Reference', role: 'Supporting file', byteLabel: '7 B' },
    ]);
    expect(views[0]?.preview).toContain('Use references/color.md.');
  });

  it('builds admin skill metrics for top cards', () => {
    const rows = buildAdminSkillCatalog([
      skill({ id: 'skill-chat', slug: 'chat', name: 'Chat', status: 'PUBLISHED', visibility: 'USER_VISIBLE', route: null }),
      skill({ id: 'skill-video', slug: 'video-lab', name: 'Video Lab', status: 'DISABLED', visibility: 'ADMIN_ONLY', route: null }),
      skill({ id: 'skill-deep', slug: 'deep-research', name: 'Deep Research', status: 'PUBLISHED', visibility: 'USER_VISIBLE', route: {
        id: 'route-deep',
        skillId: 'skill-deep',
        mode: 'DEEP_RESEARCH',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: null,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      } }),
    ], [readiness('deep-research', 'ready')], analytics());

    expect(buildAdminSkillMetrics(rows, analytics()).map((metric) => ({ label: metric.label, value: metric.value, hint: metric.hint }))).toEqual([
      { label: 'Total skills', value: '3', hint: '2 published · 1 disabled' },
      { label: 'User visible', value: '2', hint: 'Visible in workflow picker' },
      { label: 'Ready routes', value: '1', hint: '1 need route/setup' },
      { label: 'Run health', value: '75%', hint: '12 runs · 3 failed' },
    ]);
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
