'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminAnalyticsSummary } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { buildAdminAnalyticsViewModel, type AdminAnalyticsHealthTone } from '@/lib/adminAnalytics';
import { getProtectedRouteState } from '@/lib/protectedRoute';
import { useAppStore } from '@/store/appStore';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return '—';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function modeLabel(mode: string): string {
  return mode.toLowerCase().split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function healthToneClass(tone: AdminAnalyticsHealthTone): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-100';
    case 'warning':
      return 'border-amber-400/20 bg-amber-400/5 text-amber-100';
    case 'danger':
      return 'border-rose-400/20 bg-rose-400/5 text-rose-100';
    case 'neutral':
    default:
      return 'border-line bg-panel/70 text-slate-200';
  }
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const routeState = getProtectedRouteState(user, { requireAdmin: true });
  const redirectHref = routeState.status === 'redirect' ? routeState.href : undefined;

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (redirectHref) router.replace(redirectHref);
  }, [router, redirectHref]);

  useEffect(() => {
    if (routeState.status === 'authorized') void loadAnalytics();
  }, [routeState.status]);

  async function loadAnalytics() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.listAdminAnalytics();
      setAnalytics(result.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
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

  const totals = analytics?.totals;
  const analyticsView = analytics ? buildAdminAnalyticsViewModel(analytics) : null;

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold">Workflow Analytics</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Operational health for skill runs: volume, success rate, failure hotspots, and provider usage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {analytics && analyticsView ? (
              <span className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-slate-500">
                Generated {formatDate(analytics.generatedAt)}
                {analyticsView.latestActivityAt ? ` · latest run ${formatDate(analyticsView.latestActivityAt)}` : ''}
              </span>
            ) : null}
            <a href="/settings/admin/skills" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Skills registry
            </a>
            <a href="/settings/admin/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Provider admin
            </a>
            <button type="button" onClick={() => void loadAnalytics()} className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <section className="mb-4 rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Could not load workflow analytics</p>
                <p className="mt-1 text-red-100/80">{error}</p>
              </div>
              <button type="button" onClick={() => void loadAnalytics()} className="rounded-xl border border-red-300/30 px-4 py-2 hover:border-red-200">
                Retry
              </button>
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-3xl border border-line bg-panel/70 p-8 text-center text-slate-400">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
            <p className="mt-4 font-medium text-slate-200">Loading workflow analytics…</p>
            <p className="mt-1 text-sm text-slate-500">Fetching recent skill runs, provider usage, and failure signals.</p>
          </section>
        ) : !analytics || !totals ? (
          <section className="rounded-3xl border border-line bg-panel/70 p-8 text-center text-slate-400">
            Analytics are not available yet. Refresh or run a workflow to create telemetry.
          </section>
        ) : (
          <div className="space-y-6">
            <section className={`rounded-3xl border p-5 ${healthToneClass(analyticsView?.healthTone ?? 'neutral')}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Workflow health</p>
                  <h2 className="mt-2 text-2xl font-semibold">{analyticsView?.healthLabel}</h2>
                  <p className="mt-2 max-w-3xl text-sm opacity-80">{analyticsView?.primaryInsight}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <a href={analyticsView?.primaryCta.href ?? '/library'} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15">
                    {analyticsView?.primaryCta.label ?? 'Review run history'}
                  </a>
                  <a href={analyticsView?.secondaryCta.href ?? '/settings/admin/skills'} className="rounded-xl border border-white/10 px-4 py-2 hover:bg-white/10">
                    {analyticsView?.secondaryCta.label ?? 'Check skill routes'}
                  </a>
                </div>
              </div>
            </section>

            {!analyticsView?.hasRuns ? (
              <section className="rounded-3xl border border-dashed border-line bg-panel/60 p-8 text-center">
                <p className="text-lg font-semibold text-white">No workflow telemetry yet</p>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
                  Run Chat, Deep Research, Social Writer, or Image Studio once and this dashboard will start showing success rates,
                  failures, provider usage, and durations.
                </p>
              </section>
            ) : null}

            <section className="grid gap-3 md:grid-cols-5">
              <article className="rounded-3xl border border-accent/20 bg-accent/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent">Runs</p>
                <p className="mt-2 text-3xl font-semibold text-white">{totals.totalRuns}</p>
                <p className="mt-1 text-xs text-slate-500">Latest {totals.totalRuns} tracked run records.</p>
              </article>
              <article className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">Success</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-100">{totals.successRate}%</p>
                <p className="mt-1 text-xs text-slate-500">Completed vs failed runs.</p>
              </article>
              <article className="rounded-3xl border border-rose-400/20 bg-rose-400/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-rose-200/70">Failed</p>
                <p className="mt-2 text-3xl font-semibold text-rose-100">{totals.failedRuns}</p>
                <p className="mt-1 text-xs text-slate-500">Runs needing investigation.</p>
              </article>
              <article className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/70">Active</p>
                <p className="mt-2 text-3xl font-semibold text-amber-100">{totals.activeRuns}</p>
                <p className="mt-1 text-xs text-slate-500">Pending or running now.</p>
              </article>
              <article className="rounded-3xl border border-line bg-panel/70 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Avg duration</p>
                <p className="mt-2 text-3xl font-semibold text-white">{formatDuration(totals.averageDurationMs)}</p>
                <p className="mt-1 text-xs text-slate-500">Completed and failed runs.</p>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-line bg-panel/70 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Top skills</h2>
                    <p className="text-sm text-slate-500">Run volume and health by workflow skill.</p>
                  </div>
                  <span className="text-xs text-slate-600">Generated {formatDate(analytics.generatedAt)}</span>
                </div>
                <div className="space-y-3">
                  {analytics.topSkills.length ? analytics.topSkills.map((skill) => (
                    <article key={skill.skillSlug} className="rounded-2xl border border-line bg-ink/50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{skill.skillName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{modeLabel(skill.mode)} · {skill.skillSlug}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>{skill.totalRuns} runs</p>
                          <p>{skill.successRate}% success</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                        <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-emerald-100">Done {skill.completedRuns}</span>
                        <span className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-rose-100">Failed {skill.failedRuns}</span>
                        <span className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-amber-100">Active {skill.activeRuns}</span>
                        <span className="rounded-xl border border-line bg-black/20 px-3 py-2 text-slate-300">Avg {formatDuration(skill.averageDurationMs)}</span>
                      </div>
                    </article>
                  )) : (
                    <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">No skill runs recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <section className="rounded-3xl border border-line bg-panel/70 p-5">
                  <h2 className="text-lg font-semibold">Mode breakdown</h2>
                  <div className="mt-4 space-y-2">
                    {analytics.modeBreakdown.length ? analytics.modeBreakdown.map((mode) => (
                      <div key={mode.mode} className="rounded-2xl border border-line bg-ink/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-white">{modeLabel(mode.mode)}</p>
                          <p className="text-xs text-slate-500">{mode.totalRuns} runs · {mode.successRate}% success</p>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, mode.successRate)}%` }} />
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-500">No mode data yet.</p>}
                  </div>
                </section>

                <section className="rounded-3xl border border-line bg-panel/70 p-5">
                  <h2 className="text-lg font-semibold">Provider usage</h2>
                  <div className="mt-4 space-y-2">
                    {analytics.providerUsage.length ? analytics.providerUsage.map((provider) => (
                      <div key={provider.providerId} className="rounded-2xl border border-line bg-ink/50 p-3 text-sm">
                        <p className="truncate font-medium text-white">{provider.providerId}</p>
                        <p className="mt-1 text-xs text-slate-500">{provider.totalRuns} runs · {provider.failedRuns} failed · avg {formatDuration(provider.averageDurationMs)}</p>
                      </div>
                    )) : <p className="text-sm text-slate-500">No provider-linked runs yet.</p>}
                  </div>
                </section>
              </div>
            </section>

            <section className="rounded-3xl border border-rose-400/20 bg-rose-400/5 p-5">
              <h2 className="text-lg font-semibold text-rose-100">Recent failures</h2>
              <div className="mt-4 space-y-2">
                {analytics.recentFailures.length ? analytics.recentFailures.map((run) => (
                  <article key={run.id} className="rounded-2xl border border-rose-400/20 bg-ink/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{run.skillName}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{modeLabel(run.mode)} · {run.providerId ?? 'no provider'}</p>
                        <p className="mt-2 text-sm text-rose-100">{run.errorMessage ?? 'No error message recorded.'}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(run.startedAt)}</span>
                    </div>
                  </article>
                )) : <p className="rounded-2xl border border-dashed border-rose-400/20 p-5 text-sm text-rose-100/70">No recent failures in the sampled run history.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
