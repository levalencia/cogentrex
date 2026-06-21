'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminAnalyticsSummary, AdminSkillTestResponse, CreateSkillInput, ProviderConfigView, SkillFileSummary, SkillReadiness, SkillStatus, SkillSummary, SkillVisibility } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { getProtectedRouteState } from '@/lib/protectedRoute';
import {
  appModeOptions,
  buildAdminBuiltInCapabilityCatalog,
  buildAdminSkillMetrics,
  buildAdminSkillPackageCatalog,
  buildSkillDetailModel,
  buildSkillFileViews,
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  buildSkillKitImportPayload,
  createEmptySkillExampleDraft,
  getAdminSkillPanelCopy,
  getSkillIconGlyph,
  getSkillImportSourceView,
  getSkillInstructionsFile,
  getSkillExampleDrafts,
  getSkillPublishGateView,
  getSkillRouteDraft,
  getSkillUpdateDraft,
  isPublishBlockedByGate,
  mergeSkillExamplesIntoRouteDraft,
  type AdminSkillPanelMode,
  type SkillKitImportDraft,
  type SkillRouteDraft,
  type SkillUpdateDraft,
  type SkillExampleDraft,
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

type DetailTab = 'overview' | 'instructions' | 'examples' | 'test' | 'route' | 'files' | 'settings';

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
  const [exampleDrafts, setExampleDrafts] = useState<SkillExampleDraft[]>([]);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [testExampleId, setTestExampleId] = useState('custom');
  const [testPrompt, setTestPrompt] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<AdminSkillTestResponse | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateSkillInput>(emptyCreateDraft);
  const [importDraft, setImportDraft] = useState<SkillKitImportDraft>({ sourceUrl: '', folderPath: '', ref: '' });
  const [importing, setImporting] = useState(false);
  const [reimporting, setReimporting] = useState(false);
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

  async function loadSkillFiles(slug: string, syncInstructionsDraft = false) {
    setFilesLoading(true);
    setError(undefined);
    try {
      const result = await api.listAdminSkillFiles(slug);
      setSkillFiles((current) => ({ ...current, [slug]: result.files }));
      if (syncInstructionsDraft) {
        const instructions = getSkillInstructionsFile(buildSkillFileViews(result.files));
        setInstructionsDraft(instructions?.content ?? '');
      }
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
    setExampleDrafts(getSkillExampleDrafts(skill));
    const cachedFiles = skillFiles[skill.slug];
    if (Array.isArray(cachedFiles)) {
      const instructions = getSkillInstructionsFile(buildSkillFileViews(cachedFiles));
      setInstructionsDraft(instructions?.content ?? '');
    } else {
      setInstructionsDraft('');
    }
    setTestExampleId('custom');
    setTestPrompt('');
    setTestResult(null);
    setError(undefined);
    setSuccess(undefined);
    if (!skillFiles[skill.slug]) void loadSkillFiles(skill.slug, true);
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
    setExampleDrafts([]);
    setInstructionsDraft('');
    setTestExampleId('custom');
    setTestPrompt('');
    setTestResult(null);
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

  async function publishSkillPackage() {
    if (!selectedSlug || !selectedSkill || selectedPublishGate?.status !== 'passing') {
      setActiveTab('test');
      setSuccess('Run Test Lab successfully before publishing this package.');
      return;
    }
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.updateAdminSkill(selectedSlug, { status: 'PUBLISHED', visibility: 'USER_VISIBLE' });
      setSkillDraft(getSkillUpdateDraft(result.skill));
      setSuccess(`${result.skill.name} published to Skill Assist users.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish skill package');
    } finally {
      setSaving(false);
    }
  }

  async function unpublishSkillPackage() {
    if (!selectedSlug || !selectedSkill) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.updateAdminSkill(selectedSlug, { status: 'STAGED', visibility: 'ADMIN_ONLY' });
      setSkillDraft(getSkillUpdateDraft(result.skill));
      setSuccess(`${result.skill.name} moved back to staged/admin-only.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unpublish skill package');
    } finally {
      setSaving(false);
    }
  }

  async function saveSkillInstructions() {
    if (!selectedSlug || !instructionsDraft.trim()) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.updateAdminSkillInstructions(selectedSlug, { content: instructionsDraft });
      setSkillFiles((current) => ({ ...current, [selectedSlug]: result.files }));
      setInstructionsDraft(getSkillInstructionsFile(buildSkillFileViews(result.files))?.content ?? '');
      setSkills((current) => current.map((skill) => skill.slug === selectedSlug ? result.skill : skill));
      setSuccess('SKILL.md instructions saved. Publish gate is stale until Test Lab passes again.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save SKILL.md instructions');
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

  async function saveSkillExamples() {
    if (!selectedSlug || !routeDraft) return;
    const nextDraft = mergeSkillExamplesIntoRouteDraft(routeDraft, exampleDrafts);
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.updateAdminSkillRoute(selectedSlug, buildSkillRoutePayload(nextDraft));
      setRouteDraft(nextDraft);
      setSuccess('Skill examples saved.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save examples');
    } finally {
      setSaving(false);
    }
  }

  function updateExampleDraft(index: number, patch: Partial<SkillExampleDraft>) {
    setExampleDrafts((current) => current.map((example, itemIndex) => itemIndex === index ? { ...example, ...patch } : example));
  }

  function moveExampleDraft(index: number, direction: -1 | 1) {
    setExampleDrafts((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function removeExampleDraft(index: number) {
    setExampleDrafts((current) => current.filter((_example, itemIndex) => itemIndex !== index));
  }

  function addExampleDraft() {
    setExampleDrafts((current) => [...current, createEmptySkillExampleDraft(current.length)]);
  }


  function chooseTestExample(exampleId: string) {
    setTestExampleId(exampleId);
    setTestResult(null);
    if (exampleId === 'custom') {
      setTestPrompt('');
      return;
    }
    const example = exampleDrafts.find((item) => item.id === exampleId);
    setTestPrompt(example?.prompt ?? '');
  }

  async function runAdminSkillTest() {
    if (!selectedSlug || !testPrompt.trim()) return;
    setTestRunning(true);
    setError(undefined);
    setSuccess(undefined);
    setTestResult(null);
    try {
      const result = await api.runAdminSkillTest(selectedSlug, {
        prompt: testPrompt,
        ...(testExampleId !== 'custom' ? { exampleId: testExampleId } : {}),
      });
      setTestResult(result);
      setSuccess(`Admin test completed for ${result.skill.name}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run admin test');
    } finally {
      setTestRunning(false);
    }
  }

  async function createSkill(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.createAdminSkill(createDraft);
      setSuccess(`Created ${result.skill.name} as a draft skill package with SKILL.md instructions.`);
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

  async function reimportSkillKit() {
    if (!selectedSlug) return;
    setReimporting(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const result = await api.reimportAdminSkillKit(selectedSlug);
      setSkillFiles((current) => ({ ...current, [result.skill.slug]: result.files }));
      setSkills((current) => current.map((skill) => skill.slug === result.skill.slug ? result.skill : skill));
      setSuccess(`Refreshed ${result.skill.name} from source: ${result.files.length} file${result.files.length === 1 ? '' : 's'}${result.warnings.length ? `, ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}` : ''}. Examples and test history were preserved.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh skill package from source');
    } finally {
      setReimporting(false);
    }
  }

  const skillPackageRows = useMemo(() => buildAdminSkillPackageCatalog(skills, readiness, analytics), [skills, readiness, analytics]);
  const builtInCapabilityRows = useMemo(() => buildAdminBuiltInCapabilityCatalog(skills, readiness, analytics), [skills, readiness, analytics]);
  const metrics = useMemo(() => buildAdminSkillMetrics(skillPackageRows, analytics), [skillPackageRows, analytics]);
  const selectedSkill = selectedSlug ? skills.find((skill) => skill.slug === selectedSlug) : null;
  const selectedReadiness = selectedSlug ? readiness.find((item) => item.skill.slug === selectedSlug) : null;
  const detailModel = selectedSkill ? buildSkillDetailModel(selectedSkill, selectedReadiness, analytics) : null;
  const selectedFiles = selectedSlug ? buildSkillFileViews(skillFiles[selectedSlug] ?? []) : [];
  const selectedInstructions = getSkillInstructionsFile(selectedFiles);
  const instructionsChanged = instructionsDraft.trim() !== (selectedInstructions?.content.trim() ?? '');
  const selectedExamples = exampleDrafts;
  const selectedPublishGate = selectedSkill ? getSkillPublishGateView(selectedSkill) : null;
  const selectedImportSource = selectedSkill ? getSkillImportSourceView(selectedSkill) : null;
  const selectedSkillIsPublic = selectedSkill?.status === 'PUBLISHED' && selectedSkill.visibility === 'USER_VISIBLE';
  const publishBlocked = selectedSkill && skillDraft ? isPublishBlockedByGate(selectedSkill, skillDraft) : false;
  const testExampleOptions = selectedExamples.filter((example) => example.prompt.trim());
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
            <h1 className="mt-2 text-3xl font-semibold">Skill Governance</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Govern importable Markdown-based skill packages: SKILL.md expertise, referenced files, examples, admin tests, and publish state. Built-in Cogentrex capabilities like Chat and Deep Research are tracked separately below; they are not user-imported skills.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Back to Chat</a>
            <button type="button" onClick={() => openPanel('import')} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-accent/90">Import package</button>
            <button type="button" onClick={() => openPanel('create')} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent">Create package</button>
            <a href="/settings/admin/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Provider admin</a>
            <a href="/settings/admin/analytics" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Run analytics</a>
            <button type="button" onClick={() => void loadAdminData()} className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">Refresh</button>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {success ? <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</p> : null}

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-accent/25 bg-accent/10 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Skill package</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Importable governed expertise</h2>
            <p className="mt-2 text-sm text-slate-300">
              A skill package is the Claude/OpenCode/Hermes-style object: SKILL.md instructions plus optional references, templates, scripts, and assets. Admins import or create it, add examples, test it, then publish it for Skill Assist.
            </p>
          </article>
          <article className="rounded-3xl border border-line bg-panel/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Built-in capability</p>
            <h2 className="mt-2 text-lg font-semibold text-white">System modes are not skills</h2>
            <p className="mt-2 text-sm text-slate-400">
              Chat, Deep Research, Image, Video, and Social Writing are Cogentrex runtime capabilities. They keep provider/readiness controls, but they are managed separately from imported skill packages.
            </p>
          </article>
        </section>

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
              <h2 className="text-xl font-semibold">Governed skill packages</h2>
              <p className="mt-1 text-sm text-slate-400">Only importable Markdown-based packages live here. Use this table to stage, test, add examples, and publish packages into Skill Assist.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{skillPackageRows.length === 1 ? '1 package' : `${skillPackageRows.length} packages`}</span>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{providers.length} providers</span>
            </div>
          </div>
          {loading ? (
            <p className="py-10 text-center text-slate-500">Loading skill packages...</p>
          ) : skillPackageRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center">
              <p className="text-lg font-semibold text-white">No imported skill packages yet.</p>
              <p className="mt-2 text-sm text-slate-500">Import a GitHub folder like agent-god-mode/organized-skills/brand-agency, or create a manual SKILL.md draft.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => openPanel('import')} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink">Import package</button>
                <button type="button" onClick={() => openPanel('create')} className="rounded-xl border border-line px-4 py-2 text-sm hover:border-accent">Create package</button>
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
                {skillPackageRows.map((row) => (
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

        <section className="mt-6 rounded-3xl border border-line bg-panel/50 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Built-in capabilities</h2>
              <p className="mt-1 text-sm text-slate-400">These are Cogentrex runtime modes and first-party surfaces. They can have routes/readiness, but they are not imported skill packages.</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{builtInCapabilityRows.length === 1 ? '1 built-in' : `${builtInCapabilityRows.length} built-ins`}</span>
          </div>
          {loading ? (
            <p className="py-6 text-center text-slate-500">Loading capabilities...</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {builtInCapabilityRows.map((row) => (
                <article key={row.id} className="rounded-2xl border border-line bg-ink/40 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-line bg-panel text-lg" aria-hidden="true">{getSkillIconGlyph(row.skill.icon)}</span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">{row.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-300">Built-in capability</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${readinessClass(row.readinessTone)}`}>{row.priority}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{row.routeLabel}</p>
                </article>
              ))}
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
                  Import is scoped to one GitHub folder. Cogentrex stores SKILL.md plus references/templates/scripts/assets as a draft package for review, examples, testing, and publish approval.
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
                <button type="submit" disabled={importing} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{importing ? 'Importing…' : 'Import package as draft'}</button>
              </form>
            ) : null}

            {panelMode === 'create' ? (
              <form onSubmit={createSkill} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-400">
                  Use this for a new Markdown-based expertise package. It starts as Draft/Admin-only; publish only after examples and admin testing are acceptable.
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
                  <label className="block text-sm text-slate-400 sm:col-span-2">SKILL.md instructions
                    <textarea value={createDraft.instructions} onChange={(e) => setCreateDraft({ ...createDraft, instructions: e.target.value })} rows={10} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
                  </label>
                </div>
                <button type="submit" disabled={creating} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{creating ? 'Creating…' : 'Create draft package'}</button>
              </form>
            ) : null}

            {panelMode === 'detail' ? (
              selectedSkill && detailModel && skillDraft && routeDraft ? (
                <div className="mt-6">
                  <div className="flex gap-2 overflow-x-auto border-b border-line">
                    {(['overview', 'instructions', 'examples', 'test', 'route', 'files', 'settings'] as const).map((tab) => {
                      const label: Record<DetailTab, string> = {
                        overview: 'Overview',
                        instructions: 'Instructions.md',
                        examples: 'Examples',
                        test: 'Test Lab',
                        route: 'Route',
                        files: 'Files',
                        settings: 'Settings',
                      };
                      return (
                        <button key={tab} type="button" onClick={() => { setActiveTab(tab); if ((tab === 'files' || tab === 'instructions') && !skillFiles[selectedSkill.slug]) void loadSkillFiles(selectedSkill.slug); }} className={`shrink-0 border-b-2 px-3 py-2 text-sm ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-white'}`}>{label[tab]}</button>
                      );
                    })}
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
                      {selectedPublishGate ? (
                        <div className={`rounded-2xl border p-4 text-sm ${publishGateClass(selectedPublishGate.tone)}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] opacity-80">Publish gate</p>
                              <h3 className="mt-1 font-semibold text-white">{selectedPublishGate.label}</h3>
                              <p className="mt-2 text-xs opacity-90">{selectedPublishGate.description}</p>
                              <p className="mt-2 text-xs opacity-80">Last successful admin test: {selectedPublishGate.lastTestLabel}</p>
                            </div>
                            {selectedPublishGate.runHref ? <a href={selectedPublishGate.runHref} className="rounded-lg border border-current/30 px-3 py-1.5 text-xs hover:border-current">Open run trace</a> : null}
                          </div>
                        </div>
                      ) : null}
                      {publishBlocked ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Publishing is blocked until this package has a current successful admin test in Test Lab.</p> : null}
                      <div className="rounded-2xl border border-line bg-ink/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Publish action</p>
                            <h3 className="mt-1 font-semibold text-white">{selectedSkillIsPublic ? 'Package is live in Skill Assist' : selectedPublishGate?.status === 'passing' ? 'Ready to publish' : 'Test before publishing'}</h3>
                            <p className="mt-1 text-xs text-slate-400">
                              {selectedSkillIsPublic
                                ? 'Unpublish moves this package back to staged/admin-only without deleting examples or test history.'
                                : selectedPublishGate?.status === 'passing'
                                  ? 'The latest admin test is current. Publish makes the package user-visible in Skill Assist.'
                                  : 'Run Test Lab first; this button will take you there instead of attempting a blocked publish.'}
                            </p>
                          </div>
                          {selectedSkillIsPublic ? (
                            <button type="button" onClick={() => void unpublishSkillPackage()} disabled={saving} className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-100 hover:border-yellow-300 disabled:opacity-50">Unpublish package</button>
                          ) : selectedPublishGate?.status === 'passing' ? (
                            <button type="button" onClick={() => void publishSkillPackage()} disabled={saving} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">Publish package</button>
                          ) : (
                            <button type="button" onClick={() => void publishSkillPackage()} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent">Go to Test Lab</button>
                          )}
                        </div>
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
                      <button type="submit" disabled={saving || publishBlocked} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{publishBlocked ? 'Run Test Lab before publish' : 'Save lifecycle'}</button>
                    </form>
                  ) : null}

                  {activeTab === 'instructions' ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-400">
                        Edit the package SKILL.md instructions that are injected when this skill is selected. Saving instructions makes the publish gate stale until Test Lab passes again.
                      </div>
                      {filesLoading ? <p className="text-sm text-slate-500">Loading instructions…</p> : null}
                      <article className="rounded-2xl border border-line bg-black/30 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm text-white">{selectedInstructions?.path ?? 'SKILL.md'}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {selectedInstructions ? `${selectedInstructions.byteLabel} · sha ${selectedInstructions.checksumLabel}` : 'New package instructions file'}
                            </p>
                          </div>
                          {instructionsChanged ? <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">Unsaved changes</span> : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Saved</span>}
                        </div>
                        <textarea
                          value={instructionsDraft}
                          onChange={(event) => setInstructionsDraft(event.target.value)}
                          rows={18}
                          placeholder="# Skill name\n\nDescribe when to use this skill and the required operating steps."
                          className="w-full rounded-xl border border-line bg-ink p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-accent"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">Saving changes preserves test history but requires a fresh successful Test Lab run before publishing.</p>
                          <button type="button" onClick={() => void saveSkillInstructions()} disabled={saving || filesLoading || !instructionsDraft.trim() || !instructionsChanged} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save SKILL.md'}
                          </button>
                        </div>
                      </article>
                    </div>
                  ) : null}

                  {activeTab === 'examples' ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-400">
                        Examples are admin-managed prompt starters that appear in Chat when users select this published skill. Add, edit, delete, reorder, and choose which examples are user-visible.
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={addExampleDraft} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent">Add example</button>
                        <button type="button" onClick={() => void saveSkillExamples()} disabled={saving || !routeDraft} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{saving ? 'Saving…' : 'Save examples'}</button>
                      </div>
                      {selectedExamples.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-slate-500">No examples configured yet. Add one before publishing the package to users.</p>
                      ) : (
                        selectedExamples.map((example, index) => (
                          <article key={`${example.id}-${index}`} className="rounded-2xl border border-line bg-ink/50 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Example {index + 1}</p>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => moveExampleDraft(index, -1)} disabled={index === 0} className="rounded-lg border border-line px-2 py-1 text-xs text-slate-300 disabled:opacity-40">↑</button>
                                <button type="button" onClick={() => moveExampleDraft(index, 1)} disabled={index === selectedExamples.length - 1} className="rounded-lg border border-line px-2 py-1 text-xs text-slate-300 disabled:opacity-40">↓</button>
                                <button type="button" onClick={() => removeExampleDraft(index)} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10">Delete</button>
                              </div>
                            </div>
                            <div className="grid gap-3">
                              <label className="block text-sm text-slate-400">Title
                                <input value={example.label} onChange={(e) => updateExampleDraft(index, { label: e.target.value })} placeholder="Position a premium brand" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                              </label>
                              <label className="block text-sm text-slate-400">Prompt
                                <textarea value={example.prompt} onChange={(e) => updateExampleDraft(index, { prompt: e.target.value })} rows={3} placeholder="Create a positioning brief for this brand:" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                              </label>
                              <label className="block text-sm text-slate-400">Description
                                <input value={example.description} onChange={(e) => updateExampleDraft(index, { description: e.target.value })} placeholder="Short note shown to admins and users." className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                              </label>
                              <label className="flex items-center gap-2 rounded-xl border border-line bg-panel/40 px-3 py-2 text-sm text-slate-300">
                                <input type="checkbox" checked={example.visibleToUsers} onChange={(e) => updateExampleDraft(index, { visibleToUsers: e.target.checked })} />
                                Visible to users when this skill is published
                              </label>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  ) : null}

                  {activeTab === 'test' ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-slate-300">
                        Test Lab runs this skill package as an admin QA check before publishing. Pick a saved example or custom prompt, execute it through the configured route/provider, then inspect the output and saved run trace.
                      </div>
                      <label className="block text-sm text-slate-400">Example
                        <select value={testExampleId} onChange={(event) => chooseTestExample(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                          <option value="custom">Custom prompt</option>
                          {testExampleOptions.map((example) => <option key={example.id} value={example.id}>{example.label}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm text-slate-400">Test prompt
                        <textarea rows={5} value={testPrompt} onChange={(event) => { setTestPrompt(event.target.value); setTestResult(null); }} placeholder="Paste a prompt or choose one of the examples in the previous tab." className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                      </label>
                      <button type="button" onClick={() => void runAdminSkillTest()} disabled={testRunning || !testPrompt.trim()} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50">
                        {testRunning ? 'Running admin test…' : 'Run admin test'}
                      </button>
                      {testResult ? (
                        <div className="space-y-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-green-100">Test completed</p>
                              <p className="text-xs text-green-200/80">{testResult.provider.name} · {testResult.provider.model} · {testResult.durationMs}ms</p>
                            </div>
                            <a href={`/runs?run=${testResult.run.id}`} className="rounded-lg border border-green-400/40 px-3 py-1.5 text-xs text-green-100 hover:border-green-300">Open run trace</a>
                          </div>
                          <div className="rounded-xl border border-green-500/20 bg-ink/70 p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-green-300/80">Output</p>
                            <pre className="mt-2 max-h-80 whitespace-pre-wrap text-sm leading-6 text-slate-100">{testResult.output}</pre>
                          </div>
                        </div>
                      ) : null}
                    </div>
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
                          <legend className="px-1 text-sm text-slate-400">Compatible capabilities</legend>
                          <p className="mb-3 text-xs text-slate-500">Use this when one skill package can assist more than its primary Cogentrex mode. The primary mode is always included on save.</p>
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
                      {selectedImportSource ? (
                        <article className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-slate-300">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-accent">Import source</p>
                              <p className="mt-1 break-all font-mono text-xs text-white">{selectedImportSource.sourceLabel}</p>
                              <p className="mt-2 text-xs text-slate-400">Ref: {selectedImportSource.refLabel} · Path: {selectedImportSource.pathLabel} · Last import: {selectedImportSource.lastImportedLabel}</p>
                            </div>
                            <button type="button" onClick={() => void reimportSkillKit()} disabled={reimporting || !selectedImportSource.canRefresh} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50">
                              {reimporting ? 'Refreshing…' : selectedImportSource.canRefresh ? 'Re-import from source' : 'Manual package'}
                            </button>
                          </div>
                          {selectedImportSource.warnings.length ? (
                            <div className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Import warnings</p>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-yellow-100/90">
                                {selectedImportSource.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                              </ul>
                            </div>
                          ) : <p className="mt-3 text-xs text-slate-500">No import warnings recorded.</p>}
                        </article>
                      ) : null}
                      {filesLoading ? <p className="text-sm text-slate-500">Loading files…</p> : null}
                      {!filesLoading && selectedFiles.length === 0 ? <p className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-500">No package files stored for this skill yet.</p> : null}
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

                  {activeTab === 'settings' ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-line bg-ink/50 p-4 text-sm text-slate-400">
                        Governance settings define who can see the package and what must be true before publish. Fine-grained team permissions, cost ceilings, and editable examples are reserved for the next implementation slices.
                      </div>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-xl border border-line bg-black/20 p-3">
                          <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Status</dt>
                          <dd className="mt-1 text-white">{selectedSkill.status}</dd>
                        </div>
                        <div className="rounded-xl border border-line bg-black/20 p-3">
                          <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Visibility</dt>
                          <dd className="mt-1 text-white">{selectedSkill.visibility === 'USER_VISIBLE' ? 'Published to users' : 'Admin only'}</dd>
                        </div>
                        <div className="rounded-xl border border-line bg-black/20 p-3">
                          <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Examples</dt>
                          <dd className="mt-1 text-white">{selectedExamples.length}</dd>
                        </div>
                        <div className="rounded-xl border border-line bg-black/20 p-3">
                          <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Files</dt>
                          <dd className="mt-1 text-white">{selectedFiles.length}</dd>
                        </div>
                        <div className="rounded-xl border border-line bg-black/20 p-3 sm:col-span-2">
                          <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Publish gate</dt>
                          <dd className="mt-1 text-white">{selectedPublishGate?.label ?? 'Not checked'}</dd>
                          <dd className="mt-1 text-xs text-slate-500">{selectedPublishGate?.lastTestLabel ?? 'No successful admin test yet'}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-line text-center">
                  <div>
                    <p className="text-lg font-semibold text-white">Select a skill package</p>
                    <p className="mt-2 max-w-xs text-sm text-slate-500">Use Configure from the governed package table, then review Overview, Instructions.md, Examples, Test Lab, Route, Files, and Settings.</p>
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

function publishGateClass(tone: 'ready' | 'warning' | 'danger'): string {
  if (tone === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (tone === 'warning') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100';
  return 'border-red-500/30 bg-red-500/10 text-red-100';
}

function metricClass(tone: 'accent' | 'ready' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'accent') return 'border-accent/30 bg-accent/10';
  if (tone === 'ready') return 'border-emerald-500/30 bg-emerald-500/10';
  if (tone === 'warning') return 'border-yellow-500/30 bg-yellow-500/10';
  if (tone === 'danger') return 'border-red-500/30 bg-red-500/10';
  return 'border-line bg-panel/70';
}
