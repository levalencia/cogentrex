import type { AdminAnalyticsSummary, SkillReadiness, SkillSummary } from '@cogentrex/shared';
import { describe, expect, it } from 'vitest';
import {
  buildAdminBuiltInCapabilityCatalog,
  buildAdminSkillCatalog,
  buildAdminSkillMetrics,
  buildAdminSkillPackageCatalog,
  buildSkillDetailModel,
  buildSkillExampleViews,
  createEmptySkillExampleDraft,
  getSkillExampleDrafts,
  mergeSkillExamplesIntoRouteDraft,
  normalizeSkillExampleDrafts,
  buildSkillFileViews,
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  buildSkillKitImportPayload,
  getAdminSkillPanelCopy,
  getSkillBadges,
  getSkillIconGlyph,
  getSkillRouteDraft,
  getSkillSupportedModes,
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

  it('maps stored icon slugs to visible glyphs for catalog rows', () => {
    expect(getSkillIconGlyph('message-circle')).toBe('💬');
    expect(getSkillIconGlyph('search')).toBe('🔎');
    expect(getSkillIconGlyph('  plane  ')).toBe('✈️');
    expect(getSkillIconGlyph(null)).toBe('🧠');
    expect(getSkillIconGlyph('🧪')).toBe('🧪');
  });

  it('maps supported modes from route config and badge copy', () => {
    const multiModeSkill = skill({
      route: {
        id: 'route-1',
        skillId: 'skill-1',
        mode: 'CHAT',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: { supportedModes: ['CHAT', 'DEEP_RESEARCH', 'IMAGE_GENERATION', 'UNKNOWN'] },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    });

    expect(getSkillSupportedModes(multiModeSkill)).toEqual(['CHAT', 'DEEP_RESEARCH', 'IMAGE_GENERATION']);
    expect(getSkillBadges(multiModeSkill)).toEqual(expect.arrayContaining([
      { label: 'Supports: Chat + Deep Research + Image Generation', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
    ]));
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
        config: { maxSources: 8, supportedModes: ['CHAT', 'DEEP_RESEARCH'] },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    }))).toEqual({
      mode: 'CHAT',
      defaultProviderId: '',
      searchProfile: '',
      maxBudgetCents: '',
      supportedModes: ['CHAT', 'DEEP_RESEARCH'],
      configJson: '{\n  "maxSources": 8,\n  "supportedModes": [\n    "CHAT",\n    "DEEP_RESEARCH"\n  ]\n}',
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
      supportedModes: ['CHAT', 'DEEP_RESEARCH', 'IMAGE_GENERATION'],
      configJson: '{"temperature":0.2}',
    })).toEqual({
      mode: 'DEEP_RESEARCH',
      defaultProviderId: null,
      searchProfile: 'web-deep',
      maxBudgetCents: 250,
      config: { temperature: 0.2, supportedModes: ['DEEP_RESEARCH', 'CHAT', 'IMAGE_GENERATION'] },
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
      { path: 'SKILL.md', label: 'Instructions', role: 'Skill Markdown / SKILL.md', byteLabel: '34 B' },
      { path: 'references/color.md', label: 'Reference', role: 'Supporting file', byteLabel: '7 B' },
    ]);
    expect(views[0]?.preview).toContain('Use references/color.md.');
  });

  it('separates imported skill packages from built-in capabilities for admin governance', () => {
    const nativeChat = skill({ id: 'skill-chat', slug: 'chat', name: 'Chat', kind: 'NATIVE' });
    const importedBrand = skill({ id: 'skill-brand', slug: 'brand-agency', name: 'Brand Agency', kind: 'IMPORTED', status: 'DRAFT', visibility: 'ADMIN_ONLY' });

    expect(buildAdminSkillPackageCatalog([nativeChat, importedBrand]).map((row) => row.slug)).toEqual(['brand-agency']);
    expect(buildAdminBuiltInCapabilityCatalog([nativeChat, importedBrand]).map((row) => row.slug)).toEqual(['chat']);
  });

  it('extracts user-facing examples from route prompt templates', () => {
    const examples = buildSkillExampleViews(skill({
      slug: 'brand-agency',
      kind: 'IMPORTED',
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      route: {
        id: 'route-brand',
        skillId: 'skill-brand',
        mode: 'CHAT',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: {
          promptTemplates: [
            { id: 'positioning', label: 'Position a brand', prompt: 'Create a positioning brief for this brand: ', description: 'Strategic brand positioning.' },
            { id: 'campaign-angles', label: 'Campaign angles', prompt: 'Generate five campaign angles for: ' },
          ],
        },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    }));

    expect(examples).toEqual([
      { id: 'positioning', label: 'Position a brand', prompt: 'Create a positioning brief for this brand:', description: 'Strategic brand positioning.', visibleToUsers: true },
      { id: 'campaign-angles', label: 'Campaign angles', prompt: 'Generate five campaign angles for:', description: '', visibleToUsers: true },
    ]);
  });

  it('normalizes editable skill examples and merges them into route config', () => {
    const drafts = [
      { id: '  ', label: 'Position a premium brand', prompt: ' Create a positioning brief: ', description: ' Positioning ', visibleToUsers: true },
      { id: 'internal-note', label: 'Internal only', prompt: 'Draft private QA notes', description: '', visibleToUsers: false },
      { id: 'empty', label: '', prompt: 'Ignored', description: '', visibleToUsers: true },
    ];

    expect(normalizeSkillExampleDrafts(drafts)).toEqual([
      { id: 'position-a-premium-brand', label: 'Position a premium brand', prompt: 'Create a positioning brief:', description: 'Positioning', visibleToUsers: true },
      { id: 'internal-note', label: 'Internal only', prompt: 'Draft private QA notes', visibleToUsers: false },
    ]);

    const routeDraft = mergeSkillExamplesIntoRouteDraft({
      mode: 'CHAT',
      defaultProviderId: '',
      searchProfile: '',
      maxBudgetCents: '',
      supportedModes: ['CHAT'],
      configJson: '{"existing":true}',
    }, drafts);

    expect(JSON.parse(routeDraft.configJson)).toEqual({
      existing: true,
      promptTemplates: [
        { id: 'position-a-premium-brand', label: 'Position a premium brand', prompt: 'Create a positioning brief:', description: 'Positioning', visibleToUsers: true },
        { id: 'internal-note', label: 'Internal only', prompt: 'Draft private QA notes', visibleToUsers: false },
      ],
    });
  });

  it('builds editable example drafts and empty drafts for the admin examples editor', () => {
    const importedSkill = skill({
      slug: 'brand-agency',
      route: {
        id: 'route-brand',
        skillId: 'skill-brand',
        mode: 'CHAT',
        defaultProviderId: null,
        searchProfile: null,
        maxBudgetCents: null,
        config: { promptTemplates: [{ id: 'positioning', label: 'Positioning', prompt: 'Write positioning:', visibleToUsers: false }] },
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    });

    expect(getSkillExampleDrafts(importedSkill)).toEqual([
      { id: 'positioning', label: 'Positioning', prompt: 'Write positioning:', description: '', visibleToUsers: false },
    ]);
    expect(createEmptySkillExampleDraft(2)).toEqual({ id: 'example-3', label: '', prompt: '', description: '', visibleToUsers: false });
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
      { label: 'Skill packages', value: '3', hint: '2 published · 1 disabled' },
      { label: 'User visible', value: '2', hint: 'Visible in Skill Assist picker' },
      { label: 'Ready routes', value: '1', hint: '1 need setup' },
      { label: 'Run health', value: '75%', hint: '12 runs · 3 failed' },
    ]);
  });

  it('returns operator copy for drawer panel modes', () => {
    expect(getAdminSkillPanelCopy('detail')).toEqual({
      eyebrow: 'Governance detail',
      title: 'Review selected package',
      description: 'Review lifecycle, Instructions.md/SKILL.md, examples, tests, files, and routing before publishing to users.',
    });
    expect(getAdminSkillPanelCopy('import')).toMatchObject({ title: 'Import skill package' });
    expect(getAdminSkillPanelCopy('create')).toMatchObject({ title: 'Create manual skill package' });
  });

  it('rejects route config JSON that is not an object', () => {
    expect(() => buildSkillRoutePayload({
      mode: 'CHAT',
      defaultProviderId: 'provider-1',
      searchProfile: '',
      maxBudgetCents: '',
      supportedModes: ['CHAT'],
      configJson: '["not", "an", "object"]',
    })).toThrow('Config JSON must be an object');
  });
});
