'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminAnalyticsSummary, CreateSkillInput, ProviderConfigView, SkillFileSummary, SkillReadiness, SkillStatus, SkillSummary, SkillVisibility } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { getProtectedRouteState } from '@/lib/protectedRoute';
import {
  appModeOptions,
  buildAdminSkillCatalog,
  buildAdminSkillMetrics,
  buildSkillDetailModel,
  buildSkillFileViews,
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  buildSkillKitImportPayload,
  getAdminSkillPanelCopy,
  getSkillIconGlyph,
  getSkillRouteDraft,
  getSkillUpdateDraft,
  type AdminSkillPanelMode,
  type SkillKitImportDraft,
  type SkillRouteDraft,
  type SkillUpdateDraft,
} from '@/lib/skills';
import { useAppStore } from '@/store/appStore';
import { MobileStandaloneShell } from '@/components/MobileAppMenu';

const statusOptions: { value: SkillStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'STAGED', label: 'Staged' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DISABLED', label: 'Disabled' },
];

const visibilityOptions: { value: SkillVisibility; label: string }[] = [
  { value: 'ADMIN_ONLY', label: 'Admin only' },
  { value: 'USER_VISIBLE', label: 'User visible' },
];

type DetailTab = 'overview' | 'route' | 'files';

const emptyCreateDraft: CreateSkillInput = {
  slug: '',
  name: '',
  description: '',
  category: 'Imported',
  icon: 'sparkles',
  instructions: '# New Skill\n\nDescribe when to use this skill and the required operating steps.',
};

export default function AdminSkillsPage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [readiness, setReadiness] = useState<SkillReadiness[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [skillFiles, setSkillFiles] = useState<Record<string, SkillFileSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<AdminSkillPanelMode | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [skillDraft, setSkillDraft] = useState<SkillUpdateDraft | null>(null);
  const [routeDraft, setRouteDraft] = useState<SkillRouteDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateSkillInput>(emptyCreateDraft);
  const [importDraft, setImportDraft] = useState<SkillKitImportDraft>({ sourceUrl: '', folderPath: '', ref: '' });
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const routeState = getProtectedRouteState(user, { requireAdmin: true });
  const redirectHref = routeState.status === 'redirect' ? routeState.href : undefined;

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (redirectHref) router.replace(redirectHref);
  }, [router, redirectHref]);

  useEffect(() => {
    if (routeState.status === 'authorized') void loadAdminData();
  }, [routeState.status]);

  async function loadAdminData() {
    setLoading(true);
    setError(undefined);
    try {
      const [{ skills: nextSkills }, { providers: nextProviders }, readinessResult, analyticsResult] = await Promise.all([
        api.listAdminSkills(),
        api.listAdminProviders(),
        api.getSkillReadiness().catch(() => ({ skills: [] as SkillReadiness[] })),
        api.listAdminAnalytics().catch(() => ({ analytics: null as AdminAnalyticsSummary | null })),
      ]);
      setSkills(nextSkills);
      setProviders(nextProviders);
      setReadiness(readinessResult.skills);
      setAnalytics(analyticsResult.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  async function loadSkillFiles(slug: string) {
    setFilesLoading(true);
    setError(undefined);
    try {
      const result = await api.listAdminSkillFiles(slug);
      setSkillFiles((current) => ({ ...current, [slug]: result.files }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load skill files');
    } finally {
      setFilesLoading(false);
    }
  }

  function selectSkill(skill: SkillSummary, tab: DetailTab = 'overview') {
    setSelectedSlug(skill.slug);
    setPanelMode('detail');
    setActiveTab(tab);
    setSkillDraft(getSkillUpdateDraft(skill));
    setRouteDraft(getSkillRouteDraft(skill));
    setError(undefined);
    setSuccess(undefined);
    if (!skillFiles[skill.slug]) void loadSkillFiles(skill.slug);
  }

  function openPanel(mode: AdminSkillPanelMode) {
    setPanelMode(mode);
    setError(undefined);
    setSuccess(undefined);
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedSlug(null);
    setSkillDraft(null);
    setRouteDraft(null);
    setActiveTab('overview');
    setError(undefined);
    setSuccess(undefined);
  }

  async function saveSkillMetadata(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlug || !skillDraft) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.updateAdminSkill(selectedSlug, buildSkillUpdatePayload(skillDraft));
      setSuccess('Skill visibility/status updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update skill');
    } finally {
      setSaving(false);
    }
  }

  async function saveSkillRoute(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlug || !routeDraft) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.updateAdminSkillRoute(selectedSlug, buildSkillRoutePayload(routeDraft));
      setSuccess('Skill route updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update route');
    } finally {
      setSaving(false);
    }
  }

  async function createSkill(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.createAdminSkill(createDraft);
      setSuccess(`Created ${result.skill.name} with read-only SKILL.md instructions.`);
      setCreateDraft(emptyCreateDraft);
      setSkillFiles((current) => ({ ...current, [result.skill.slug]: result.files }));
      await loadAdminData();
      selectSkill(result.skill, 'files');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create skill');
    } finally {
      setCreating(false);
    }
  }

  async function importSkillKit(event: FormEvent) {
    event.preventDefault();
    setImporting(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.importAdminSkillKit(buildSkillKitImportPayload(importDraft));
      setSuccess(`Imported ${result.skill.name} from ${result.files.length} file${result.files.length === 1 ? '' : 's'}${result.warnings.length ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})` : ''}.`);
      setImportDraft({ sourceUrl: '', folderPath: '', ref: '' });
      setSkillFiles((current) => ({ ...current, [result.skill.slug]: result.files }));
      await loadAdminData();
      selectSkill(result.skill, 'files');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import skill kit');
    } finally {
      setImporting(false);
    }
  }

  const catalogRows = useMemo(() => buildAdminSkillCatalog(skills, readiness, analytics), [skills, readiness, analytics]);
  const metrics = useMemo(() => buildAdminSkillMetrics(catalogRows, analytics), [catalogRows, analytics]);
  const selectedSkill = selectedSlug ? skills.find((skill) => skill.slug === selectedSlug) : null;
  const selectedReadiness = selectedSlug ? readiness.find((item) => item.skill.slug === selectedSlug) : null;
  const detailModel = selectedSkill ? buildSkillDetailModel(selectedSkill, selectedReadiness, analytics) : null;
  const selectedFiles = selectedSlug ? buildSkillFileViews(skillFiles[selectedSlug] ?? []) : [];
  const panelCopy = panelMode ? getAdminSkillPanelCopy(panelMode) : null;

  if (routeState.status === 'loading' || routeState.status === 'redirect') {
    return (
      <main className="flex h-screen items-center justify-center bg-ink text-slate-100">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-4 text-sm text-slate-400">Checking access…</p>
        </div>
      </main>
    );
  }

  if (routeState.status === 'forbidden') {
    return (
      <main className="min-h-screen bg-ink text-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-3xl border border-line bg-panel/70 p-8 text-center">
            <h1 className="text-2xl font-semibold">Access Denied</h1>
            <p className="mt-2 text-slate-400">You need admin privileges to view this page.</p>
            <a href="/settings/providers" className="mt-4 inline-block rounded-xl border border-line px-4 py-2 text-sm hover:border-accent">
              Go to personal provider settings
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <MobileStandaloneShell title="Admin" subtitle="Skill catalog">
      <div className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold">Skill Catalog</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Import skill packages, test/stage/publish them, and decide which ones users can use through Skill Assist. Published skills can be selected automatically or manually in the Chat runner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Back to Chat</a>
            <button type="button" onClick={() => openPanel('import')} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-accent/90">Import Skill Kit</button>
            <button type="button" onClick={() => openPanel('create')} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent">Manual Draft</button>
            <a href="/settings/admin/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Provider admin</a>
            <a href="/settings/admin/analytics" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Workflow analytics</a>
            <button type="button" onClick={() => void loadAdminData()} className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Refresh</button>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {success ? <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</p> : null}

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className={`rounded-3xl border p-5 ${metricClass(metric.tone)}`}>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{metric.label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{metric.value}</p>
              <p className="mt-1 text-xs text-slate-400">{metric.hint}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-line bg-panel/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Catalog table</h2>
              <p className="mt-1 text-sm text-slate-400">Scan readiness, route policy, and usage. Actions open the side panel; the table stays in place.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{skills.length} skills</span>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{providers.length} providers</span>
            </div>
          </div>
          {loading ? (
            <p className="py-10 text-center text-slate-500">Loading skills...</p>
          ) : skills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center">
              <p className="text-lg font-semibold text-white">No skills seeded yet.</p>
              <p className="mt-2 text-sm text-slate-500">Import a Skill Kit or create a manual draft to start the catalog.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => openPanel('import')} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink">Import Skill Kit</button>
                <button type="button" onClick={() => openPanel('create')} className="rounded-xl border border-line px-4 py-2 text-sm hover:border-accent">Manual Draft</button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-[minmax(280px,1.6fr)_180px_260px_170px_120px] border-b border-line bg-ink/80 px-4 py-3 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <span>Skill</span>
                  <span>Lifecycle</span>
                  <span>Route readiness</span>
                  <span>Usage</span>
                  <span className="text-right">Actions</span>
                </div>
                {catalogRows.map((row) => (
                  <div key={row.id} className={`grid grid-cols-[minmax(280px,1.6fr)_180px_260px_170px_120px] items-center gap-3 border-b border-line/70 px-4 py-4 text-sm last:border-b-0 ${selectedSlug === row.slug && panelMode === 'detail' ? 'bg-accent/10' : 'bg-panel/30 hover:bg-white/[0.03]'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-ink/70 text-xl" aria-hidden="true">{getSkillIconGlyph(row.skill.icon)}</span>
                        <div className="min-w-0">
                          <button type="button" onClick={() => selectSkill(row.skill)} className="block max-w-full truncate text-left font-semibold text-white hover:text-accent">{row.name}</button>
                          <p className="mt-1 truncate text-xs text-slate-500">{row.slug} · {row.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {row.badges.slice(0, 3).map((badge) => <span key={`${row.id}-${badge.label}`} className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.className}`}>{badge.label}</span>)}
                    </div>
                    <div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${readinessClass(row.readinessTone)}`}>{row.priority}</span>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.routeLabel}</p>
                    </div>
                    <p className="text-xs text-slate-400">{row.usageLabel}</p>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => selectSkill(row.skill, 'overview')} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent">Configure</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {panelMode && panelCopy ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close panel overlay" onClick={closePanel} className="hidden flex-1 cursor-default lg:block" />
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-panel p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-accent">{panelCopy.eyebrow}</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{panelMode === 'detail' && selectedSkill ? selectedSkill.name : panelCopy.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{panelMode === 'detail' && selectedSkill ? `${selectedSkill.slug} · ${panelCopy.description}` : panelCopy.description}</p>
              </div>
              <button type="button" onClick={closePanel} className="rounded-xl border border-line px-3 py-2 text-xs hover:border-accent">Close</button>
            </div>

            {panelMode === 'import' ? (
              <form onSubmit={importSkillKit} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-slate-300">
                  Import is intentionally scoped to one GitHub folder. Cogentrex stores the files as read-only kit assets for later inspection and routing.
                </div>
                <label className="block text-sm text-slate-400">GitHub repo or tree URL
                  <input value={importDraft.sourceUrl} onChange={(e) => setImportDraft({ ...importDraft, sourceUrl: e.target.value })} placeholder="https://github.com/org/skills-repo" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-400">Folder path
                    <input value={importDraft.folderPath} onChange={(e) => setImportDraft({ ...importDraft, folderPath: e.target.value })} placeholder="skills/excalidraw" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                  </label>
                  <label className="block text-sm text-slate-400">Ref
                    <input value={importDraft.ref} onChange={(e) => setImportDraft({ ...importDraft, ref: e.target.value })} placeholder="main" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                  </label>
                </div>
                <button type="submit" disabled={importing} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{importing ? 'Importing…' : 'Import kit'}</button>
              </form>
            ) : null}

            {panelMode === 'create' ? (
              <form onSubmit={createSkill} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-400">
                  Use this for new internal operating instructions. Published exposure and provider route still happen after creation.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-400">Slug
                    <input value={createDraft.slug} onChange={(e) => setCreateDraft({ ...createDraft, slug: e.target.value })} placeholder="support-triage" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                  </label>
                  <label className="block text-sm text-slate-400">Name
                    <input value={createDraft.name} onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })} placeholder="Support Triage" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                  </label>
                  <label className="block text-sm text-slate-400 sm:col-span-2">Description
                    <input value={createDraft.description} onChange={(e) => setCreateDraft({ ...createDraft, description: e.target.value })} placeholder="Classify tickets and draft next actions." className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                  </label>
                  <label className="block text-sm text-slate-400 sm:col-span-2">Read-only SKILL.md instructions
                    <textarea value={createDraft.instructions} onChange={(e) => setCreateDraft({ ...createDraft, instructions: e.target.value })} rows={10} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
                  </label>
                </div>
                <button type="submit" disabled={creating} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{creating ? 'Creating…' : 'Create draft'}</button>
              </form>
            ) : null}

            {panelMode === 'detail' ? (
              selectedSkill && detailModel && skillDraft && routeDraft ? (
                <div className="mt-6">
                  <div className="flex gap-2 border-b border-line">
                    {(['overview', 'route', 'files'] as const).map((tab) => (
                      <button key={tab} type="button" onClick={() => { setActiveTab(tab); if (tab === 'files' && !skillFiles[selectedSkill.slug]) void loadSkillFiles(selectedSkill.slug); }} className={`border-b-2 px-3 py-2 text-sm capitalize ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-white'}`}>{tab === 'overview' ? 'Manifest' : tab}</button>
                    ))}
                  </div>

                  {activeTab === 'overview' ? (
                    <form onSubmit={saveSkillMetadata} className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-slate-200">
                        <h3 className="font-semibold text-white">{detailModel.nextAction}</h3>
                        <p className="mt-2 text-xs text-slate-400">{detailModel.usageLabel} · {detailModel.routeLabel}</p>
                        <ul className="mt-3 space-y-1 text-xs text-slate-400">
                          {detailModel.dependencySummaries.map((summary) => <li key={summary}>{summary}</li>)}
                        </ul>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm text-slate-400">Status
                          <select value={skillDraft.status} onChange={(e) => setSkillDraft({ ...skillDraft, status: e.target.value as SkillStatus })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm text-slate-400">Visibility
                          <select value={skillDraft.visibility} onChange={(e) => setSkillDraft({ ...skillDraft, visibility: e.target.value as SkillVisibility })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                            {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm text-slate-400">Category
                          <input value={skillDraft.category} onChange={(e) => setSkillDraft({ ...skillDraft, category: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                        </label>
                        <label className="block text-sm text-slate-400">Icon
                          <input value={skillDraft.icon} onChange={(e) => setSkillDraft({ ...skillDraft, icon: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                        </label>
                      </div>
                      <button type="submit" disabled={saving} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">Save visibility</button>
                    </form>
                  ) : null}

                  {activeTab === 'route' ? (
                    <form onSubmit={saveSkillRoute} className="mt-5 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm text-slate-400">Mode
                          <select value={routeDraft.mode} onChange={(e) => {
                            const mode = e.target.value as SkillRouteDraft['mode'];
                            setRouteDraft({ ...routeDraft, mode, supportedModes: Array.from(new Set([mode, ...routeDraft.supportedModes])) });
                          }} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                            {appModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm text-slate-400">Default provider
                          <select value={routeDraft.defaultProviderId} onChange={(e) => setRouteDraft({ ...routeDraft, defaultProviderId: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                            <option value="">None</option>
                            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm text-slate-400">Search profile
                          <input value={routeDraft.searchProfile} onChange={(e) => setRouteDraft({ ...routeDraft, searchProfile: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                        </label>
                        <label className="block text-sm text-slate-400">Max budget (cents)
                          <input value={routeDraft.maxBudgetCents} onChange={(e) => setRouteDraft({ ...routeDraft, maxBudgetCents: e.target.value })} inputMode="numeric" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                        </label>
                        <fieldset className="sm:col-span-2 rounded-xl border border-line bg-ink/50 p-3">
                          <legend className="px-1 text-sm text-slate-400">Supported workflows</legend>
                          <p className="mb-3 text-xs text-slate-500">Use this when one skill can assist more than its primary route. The primary mode is always included on save.</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {appModeOptions.map((option) => {
                              const checked = routeDraft.supportedModes.includes(option.value) || routeDraft.mode === option.value;
                              return (
                                <label key={option.value} className="flex items-center gap-2 rounded-lg border border-line bg-panel/50 px-3 py-2 text-sm text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={routeDraft.mode === option.value}
                                    onChange={(e) => {
                                      const nextModes = e.target.checked
                                        ? Array.from(new Set([...routeDraft.supportedModes, option.value]))
                                        : routeDraft.supportedModes.filter((mode) => mode !== option.value);
                                      setRouteDraft({ ...routeDraft, supportedModes: nextModes });
                                    }}
                                  />
                                  {option.label}
                                  {routeDraft.mode === option.value ? <span className="text-xs text-slate-500">primary</span> : null}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                        <label className="block text-sm text-slate-400 sm:col-span-2">Advanced config JSON
                          <textarea value={routeDraft.configJson} onChange={(e) => setRouteDraft({ ...routeDraft, configJson: e.target.value })} rows={8} placeholder={'{"maxSources":8}'} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
                        </label>
                      </div>
                      <button type="submit" disabled={saving} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">Save route</button>
                    </form>
                  ) : null}

                  {activeTab === 'files' ? (
                    <div className="mt-5 space-y-3">
                      {filesLoading ? <p className="text-sm text-slate-500">Loading files…</p> : null}
                      {!filesLoading && selectedFiles.length === 0 ? <p className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-500">No skill kit files stored for this skill yet.</p> : null}
                      {selectedFiles.map((file) => (
                        <article key={file.id} className="rounded-2xl border border-line bg-ink/50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-sm text-white">{file.path}</p>
                              <p className="mt-1 text-xs text-slate-500">{file.label} · {file.role} · {file.byteLabel} · sha {file.checksumLabel}</p>
                            </div>
                            {file.executable ? <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">Executable</span> : null}
                          </div>
                          <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-line bg-black/30 p-3 text-xs text-slate-300"><code>{file.content}</code></pre>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-line text-center">
                  <div>
                    <p className="text-lg font-semibold text-white">Select a skill</p>
                    <p className="mt-2 max-w-xs text-sm text-slate-500">Use Configure from the catalog table, then switch between Manifest, Route, and Files in the drawer.</p>
                  </div>
                </div>
              )
            ) : null}
          </aside>
        </div>
      ) : null}
    </MobileStandaloneShell>
  );
}

function readinessClass(tone: 'ready' | 'degraded' | 'missing' | 'neutral'): string {
  if (tone === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (tone === 'degraded') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
  if (tone === 'missing') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

function metricClass(tone: 'accent' | 'ready' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'accent') return 'border-accent/30 bg-accent/10';
  if (tone === 'ready') return 'border-emerald-500/30 bg-emerald-500/10';
  if (tone === 'warning') return 'border-yellow-500/30 bg-yellow-500/10';
  if (tone === 'danger') return 'border-red-500/30 bg-red-500/10';
  return 'border-line bg-panel/70';
}
