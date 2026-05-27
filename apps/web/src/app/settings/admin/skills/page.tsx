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
  getSkillRouteDraft,
  getSkillUpdateDraft,
  type SkillKitImportDraft,
  type SkillRouteDraft,
  type SkillUpdateDraft,
} from '@/lib/skills';
import { useAppStore } from '@/store/appStore';

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
    setActiveTab(tab);
    setSkillDraft(getSkillUpdateDraft(skill));
    setRouteDraft(getSkillRouteDraft(skill));
    setError(undefined);
    setSuccess(undefined);
    if (!skillFiles[skill.slug]) void loadSkillFiles(skill.slug);
  }

  function closeDetail() {
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
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold">Skill Catalog</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Govern installed skills, inspect read-only kit files, and route each workflow to the right providers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <form onSubmit={importSkillKit} className="rounded-3xl border border-line bg-panel/70 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-accent">Skill Kit Import</p>
            <h2 className="mt-1 text-lg font-semibold">Import one GitHub folder</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-400 sm:col-span-2">GitHub repo or tree URL
                <input value={importDraft.sourceUrl} onChange={(e) => setImportDraft({ ...importDraft, sourceUrl: e.target.value })} placeholder="https://github.com/org/skills-repo" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
              </label>
              <label className="block text-sm text-slate-400">Folder path
                <input value={importDraft.folderPath} onChange={(e) => setImportDraft({ ...importDraft, folderPath: e.target.value })} placeholder="skills/excalidraw" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
              </label>
              <label className="block text-sm text-slate-400">Ref
                <input value={importDraft.ref} onChange={(e) => setImportDraft({ ...importDraft, ref: e.target.value })} placeholder="main" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
              </label>
            </div>
            <button type="submit" disabled={importing} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{importing ? 'Importing…' : 'Import kit'}</button>
          </form>

          <form onSubmit={createSkill} className="rounded-3xl border border-line bg-panel/70 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-accent">Manual draft</p>
            <h2 className="mt-1 text-lg font-semibold">Create skill instructions</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <textarea value={createDraft.instructions} onChange={(e) => setCreateDraft({ ...createDraft, instructions: e.target.value })} rows={5} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
              </label>
            </div>
            <button type="submit" disabled={creating} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{creating ? 'Creating…' : 'Create draft'}</button>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
          <div className="rounded-3xl border border-line bg-panel/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Catalog table</h2>
                <p className="mt-1 text-sm text-slate-400">Select a row to inspect lifecycle, route, and files.</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{skills.length} skills</span>
            </div>
            {loading ? (
              <p className="py-8 text-center text-slate-500">Loading skills...</p>
            ) : skills.length === 0 ? (
              <p className="py-8 text-center text-slate-500">No skills seeded yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto] border-b border-line bg-ink/80 px-4 py-3 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <span>Skill</span><span>Lifecycle</span><span>Route</span><span>Usage</span><span>Actions</span>
                </div>
                {catalogRows.map((row) => (
                  <div key={row.id} className={`grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto] items-center gap-3 border-b border-line/70 px-4 py-4 text-sm last:border-b-0 ${selectedSlug === row.slug ? 'bg-accent/10' : 'bg-panel/30'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl" aria-hidden="true">{row.skill.icon ?? '🧠'}</span>
                        <button type="button" onClick={() => selectSkill(row.skill)} className="truncate font-semibold text-white hover:text-accent">{row.name}</button>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.slug} · {row.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {row.badges.slice(0, 3).map((badge) => <span key={`${row.id}-${badge.label}`} className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.className}`}>{badge.label}</span>)}
                    </div>
                    <div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${readinessClass(row.readinessTone)}`}>{row.readinessLabel}</span>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.routeLabel}</p>
                    </div>
                    <p className="text-xs text-slate-400">{row.usageLabel}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectSkill(row.skill, 'route')} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent">Configure</button>
                      <button type="button" onClick={() => selectSkill(row.skill, 'files')} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent">Files</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-line bg-panel/70 p-6">
            {selectedSkill && detailModel && skillDraft && routeDraft ? (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-accent">Skill detail</p>
                    <h2 className="mt-1 text-2xl font-semibold">{selectedSkill.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{selectedSkill.slug}</p>
                  </div>
                  <button type="button" onClick={closeDetail} className="rounded-xl border border-line px-3 py-2 text-xs hover:border-accent">Close</button>
                </div>
                <div className="mt-5 flex gap-2 border-b border-line">
                  {(['overview', 'route', 'files'] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => { setActiveTab(tab); if (tab === 'files' && !skillFiles[selectedSkill.slug]) void loadSkillFiles(selectedSkill.slug); }} className={`border-b-2 px-3 py-2 text-sm capitalize ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-white'}`}>{tab}</button>
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
                        <select value={routeDraft.mode} onChange={(e) => setRouteDraft({ ...routeDraft, mode: e.target.value as SkillRouteDraft['mode'] })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
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
                      <label className="block text-sm text-slate-400 sm:col-span-2">Advanced config JSON
                        <textarea value={routeDraft.configJson} onChange={(e) => setRouteDraft({ ...routeDraft, configJson: e.target.value })} rows={6} placeholder={'{"maxSources":8}'} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
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
              <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-line text-center">
                <div>
                  <p className="text-lg font-semibold text-white">Select a skill</p>
                  <p className="mt-2 max-w-xs text-sm text-slate-500">Use the catalog actions to inspect route setup, lifecycle, and read-only skill kit files.</p>
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
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
