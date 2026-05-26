'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ProviderConfigView, SkillStatus, SkillSummary, SkillVisibility } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { getProtectedRouteState } from '@/lib/protectedRoute';
import {
  appModeOptions,
  buildSkillRoutePayload,
  buildSkillUpdatePayload,
  formatSkillMode,
  getSkillBadges,
  getSkillRouteDraft,
  getSkillUpdateDraft,
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

export default function AdminSkillsPage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillUpdateDraft | null>(null);
  const [routeDraft, setRouteDraft] = useState<SkillRouteDraft | null>(null);
  const [saving, setSaving] = useState(false);
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
      const [{ skills: nextSkills }, { providers: nextProviders }] = await Promise.all([
        api.listAdminSkills(),
        api.listAdminProviders(),
      ]);
      setSkills(nextSkills);
      setProviders(nextProviders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(skill: SkillSummary) {
    setEditingSlug(skill.slug);
    setSkillDraft(getSkillUpdateDraft(skill));
    setRouteDraft(getSkillRouteDraft(skill));
    setError(undefined);
    setSuccess(undefined);
  }

  function cancelEdit() {
    setEditingSlug(null);
    setSkillDraft(null);
    setRouteDraft(null);
    setError(undefined);
    setSuccess(undefined);
  }

  async function saveSkillMetadata(event: FormEvent) {
    event.preventDefault();
    if (!editingSlug || !skillDraft) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.updateAdminSkill(editingSlug, buildSkillUpdatePayload(skillDraft));
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
    if (!editingSlug || !routeDraft) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.updateAdminSkillRoute(editingSlug, buildSkillRoutePayload(routeDraft));
      setSuccess('Skill route updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update route');
    } finally {
      setSaving(false);
    }
  }

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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold">Skills Registry</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Curate which skills are visible and route each workflow to the right provider/search profile.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/settings/admin/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Provider admin
            </a>
            <a href="/settings/admin/analytics" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Workflow analytics
            </a>
            <a href="/settings/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Personal provider settings
            </a>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {success ? <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</p> : null}

        <section className="rounded-3xl border border-line bg-panel/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Skills ({skills.length})</h2>
            <button type="button" onClick={() => void loadAdminData()} className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:border-accent">
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No skills seeded yet.</p>
          ) : (
            <div className="space-y-4">
              {skills.map((skill) => {
                const editing = editingSlug === skill.slug;
                return (
                  <article key={skill.id} className="rounded-2xl border border-line bg-ink/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-2xl" aria-hidden="true">{skill.icon ?? '🧠'}</span>
                          <h3 className="text-lg font-semibold text-white">{skill.name}</h3>
                          <code className="rounded bg-black/30 px-2 py-1 text-xs text-slate-400">{skill.slug}</code>
                        </div>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">{skill.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {getSkillBadges(skill).map((badge) => (
                            <span key={`${skill.id}-${badge.label}`} className={`rounded-full border px-2.5 py-1 text-xs ${badge.className}`}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        {skill.route ? (
                          <p className="mt-3 text-xs text-slate-500">
                            Route: {formatSkillMode(skill.route.mode)} · Provider: {providerName(providers, skill.route.defaultProviderId)} · Search: {skill.route.searchProfile ?? 'none'} · Budget: {skill.route.maxBudgetCents ?? 'none'}¢
                          </p>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500">No route configured yet.</p>
                        )}
                      </div>
                      <button type="button" onClick={() => editing ? cancelEdit() : startEdit(skill)} className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-accent">
                        {editing ? 'Close' : 'Configure'}
                      </button>
                    </div>

                    {editing && skillDraft && routeDraft ? (
                      <div className="mt-5 grid gap-4 border-t border-line pt-5 lg:grid-cols-2">
                        <form onSubmit={saveSkillMetadata} className="rounded-2xl border border-line bg-panel/50 p-4">
                          <h4 className="font-semibold text-white">Visibility & lifecycle</h4>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block text-sm text-slate-400">
                              Status
                              <select value={skillDraft.status} onChange={(e) => setSkillDraft({ ...skillDraft, status: e.target.value as SkillStatus })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <label className="block text-sm text-slate-400">
                              Visibility
                              <select value={skillDraft.visibility} onChange={(e) => setSkillDraft({ ...skillDraft, visibility: e.target.value as SkillVisibility })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                                {visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <label className="block text-sm text-slate-400">
                              Category
                              <input value={skillDraft.category} onChange={(e) => setSkillDraft({ ...skillDraft, category: e.target.value })} placeholder="Research" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                            </label>
                            <label className="block text-sm text-slate-400">
                              Icon
                              <input value={skillDraft.icon} onChange={(e) => setSkillDraft({ ...skillDraft, icon: e.target.value })} placeholder="🧠" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                            </label>
                          </div>
                          <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                            Save visibility
                          </button>
                        </form>

                        <form onSubmit={saveSkillRoute} className="rounded-2xl border border-line bg-panel/50 p-4">
                          <h4 className="font-semibold text-white">Route config</h4>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block text-sm text-slate-400">
                              Mode
                              <select value={routeDraft.mode} onChange={(e) => setRouteDraft({ ...routeDraft, mode: e.target.value as SkillRouteDraft['mode'] })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                                {appModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <label className="block text-sm text-slate-400">
                              Default provider
                              <select value={routeDraft.defaultProviderId} onChange={(e) => setRouteDraft({ ...routeDraft, defaultProviderId: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent">
                                <option value="">None</option>
                                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}
                              </select>
                            </label>
                            <label className="block text-sm text-slate-400">
                              Search profile
                              <input value={routeDraft.searchProfile} onChange={(e) => setRouteDraft({ ...routeDraft, searchProfile: e.target.value })} placeholder="web-deep" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                            </label>
                            <label className="block text-sm text-slate-400">
                              Max budget (cents)
                              <input value={routeDraft.maxBudgetCents} onChange={(e) => setRouteDraft({ ...routeDraft, maxBudgetCents: e.target.value })} inputMode="numeric" placeholder="250" className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-white outline-none focus:border-accent" />
                            </label>
                            <label className="block text-sm text-slate-400 sm:col-span-2">
                              Advanced config JSON
                              <textarea value={routeDraft.configJson} onChange={(e) => setRouteDraft({ ...routeDraft, configJson: e.target.value })} rows={4} placeholder={'{"maxSources":8}'} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs text-white outline-none focus:border-accent" />
                            </label>
                          </div>
                          <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                            Save route
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function providerName(providers: ProviderConfigView[], id: string | null): string {
  if (!id) return 'none';
  return providers.find((provider) => provider.id === id)?.name ?? id;
}
