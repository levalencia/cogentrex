'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppMode, SkillRunEvent, SkillRunSummary } from '@cogentrex/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  buildSkillRunDetail,
  buildSkillRunEventRows,
  buildSkillRunHealthStats,
  buildSkillRunHistoryRows,
  filterSkillRuns,
} from '@/lib/libraryOutputs';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function runStatusClass(tone: 'success' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (tone === 'danger') return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  return 'border-slate-600 bg-slate-800/60 text-slate-300';
}

const runStatusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
] as const;

const runModeOptions: Array<{ value: AppMode | 'all'; label: string }> = [
  { value: 'all', label: 'All modes' },
  { value: 'DEEP_RESEARCH', label: 'Deep Research' },
  { value: 'SOCIAL_WRITING', label: 'Social Writing' },
  { value: 'IMAGE_GENERATION', label: 'Image' },
  { value: 'VIDEO_GENERATION', label: 'Video' },
  { value: 'CHAT', label: 'Chat' },
];

export function RunsView() {
  const router = useRouter();
  const [skillRuns, setSkillRuns] = useState<SkillRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runQuery, setRunQuery] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<(typeof runStatusOptions)[number]['value']>('all');
  const [runModeFilter, setRunModeFilter] = useState<AppMode | 'all'>('all');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunEvents, setSelectedRunEvents] = useState<SkillRunEvent[]>([]);
  const [isLoadingRunEvents, setIsLoadingRunEvents] = useState(false);
  const skillRunStats = buildSkillRunHealthStats(skillRuns);
  const filteredSkillRuns = useMemo(
    () => filterSkillRuns(skillRuns, { status: runStatusFilter, mode: runModeFilter, query: runQuery }),
    [skillRuns, runStatusFilter, runModeFilter, runQuery],
  );
  const skillRunRows = buildSkillRunHistoryRows(filteredSkillRuns, 50);
  const selectedRun = selectedRunId ? skillRuns.find((run) => run.id === selectedRunId) : undefined;
  const selectedRunDetail = selectedRun ? buildSkillRunDetail(selectedRun) : undefined;
  const selectedRunEventRows = buildSkillRunEventRows(selectedRunEvents);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api.listSkillRuns()
      .then((result) => {
        if (!cancelled) setSkillRuns(result.runs);
      })
      .catch(() => {
        if (!cancelled) setSkillRuns([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedRunId && !skillRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [selectedRunId, skillRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunEvents([]);
      setIsLoadingRunEvents(false);
      return;
    }
    let cancelled = false;
    setIsLoadingRunEvents(true);
    api.listSkillRunEvents(selectedRunId)
      .then((result) => {
        if (!cancelled) setSelectedRunEvents(result.events);
      })
      .catch(() => {
        if (!cancelled) setSelectedRunEvents([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRunEvents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  return (
    <>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#17213b,#0b0f19_45%)]">
        <header className="border-b border-line bg-panel/70 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent">Run ledger</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Workflow runs as auditable work units.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Track status, duration, provider context, errors, and compact observability signals for every skill execution.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
            >
              Launch workflow
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-3 md:grid-cols-4">
            <article className="rounded-3xl border border-accent/20 bg-accent/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-accent">Total runs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{skillRunStats.totalRuns}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">All skill executions captured in the run ledger.</p>
            </article>
            <article className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/60">Completed</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-100">{skillRunStats.completedRuns}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Runs that reached a terminal success state.</p>
            </article>
            <article className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/60">Active</p>
              <p className="mt-2 text-2xl font-semibold text-amber-100">{skillRunStats.activeRuns}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Pending or running work that is still in flight.</p>
            </article>
            <article className="rounded-3xl border border-rose-400/20 bg-rose-400/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-rose-200/60">Failed</p>
              <p className="mt-2 text-2xl font-semibold text-rose-100">{skillRunStats.failedRuns}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Runs that need product or provider troubleshooting.</p>
            </article>
          </div>

          <section className="mt-6 rounded-3xl border border-line bg-panel/80 p-5 shadow-xl shadow-black/20">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent">Run history</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Search and inspect workflow execution history</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                  Use this page for operational debugging. Library remains focused on saved artifacts and reusable outputs.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-ink/50 px-4 py-3 text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Latest</p>
                <p className="mt-1 text-sm font-semibold text-white">{skillRunStats.latestRunAt ? formatDate(skillRunStats.latestRunAt) : '—'}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
              <label className="block">
                <span className="sr-only">Search skill runs</span>
                <input
                  type="search"
                  value={runQuery}
                  onChange={(event) => setRunQuery(event.target.value)}
                  placeholder="Search runs, providers, jobs, errors…"
                  className="w-full rounded-2xl border border-line bg-ink/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="sr-only">Filter run status</span>
                <select
                  value={runStatusFilter}
                  onChange={(event) => setRunStatusFilter(event.target.value as (typeof runStatusOptions)[number]['value'])}
                  className="w-full rounded-2xl border border-line bg-ink/70 px-4 py-3 text-sm text-white outline-none transition focus:border-accent"
                >
                  {runStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Filter run mode</span>
                <select
                  value={runModeFilter}
                  onChange={(event) => setRunModeFilter(event.target.value as AppMode | 'all')}
                  className="w-full rounded-2xl border border-line bg-ink/70 px-4 py-3 text-sm text-white outline-none transition focus:border-accent"
                >
                  {runModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center rounded-2xl border border-line bg-ink/40 px-4 py-3 text-xs text-slate-500">
                Showing {filteredSkillRuns.length} of {skillRuns.length}
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {isLoading && !skillRunRows.length ? (
                <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                  Loading run history…
                </div>
              ) : skillRunRows.length ? skillRunRows.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedRunId === run.id ? 'border-accent/70 bg-accent/10' : 'border-line bg-ink/50 hover:border-accent/60 hover:bg-accent/5'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${runStatusClass(run.statusTone)}`}>
                          {run.statusLabel}
                        </span>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{run.modeLabel}</p>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-white">{run.skillName}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{run.summary}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-500">
                      <p>{formatDate(run.timestamp)}</p>
                      <p className="mt-1 text-slate-600">{run.durationLabel}</p>
                    </div>
                  </div>
                  {run.metrics.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {run.metrics.map((metric) => (
                        <span key={metric} className="rounded-full border border-line bg-black/20 px-2 py-1 text-[10px] text-slate-400">
                          {metric}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                  {skillRuns.length ? 'No runs match these filters. Clear search or choose another status/mode.' : 'No skill runs yet. Launch a workflow to start building an auditable run ledger.'}
                </div>
              )}
            </div>
          </section>
        </section>
      </main>

      {selectedRunDetail ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="run-detail-title">
          <button
            type="button"
            aria-label="Close run details"
            onClick={() => setSelectedRunId(null)}
            className="absolute inset-0 cursor-default"
          />
          <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-2xl shadow-black/40">
            <div className="border-b border-line px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-accent">Run detail</p>
                  <h2 id="run-detail-title" className="mt-2 truncate text-2xl font-semibold text-white">{selectedRunDetail.skillName}</h2>
                  <p className="mt-1 truncate text-xs text-slate-500">{selectedRunDetail.skillSlug} · {selectedRunDetail.modeLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(null)}
                  className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 transition hover:border-accent"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${runStatusClass(selectedRunDetail.statusTone)}`}>
                  {selectedRunDetail.statusLabel}
                </span>
                <span className="rounded-full border border-line bg-ink/60 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  {selectedRunDetail.durationLabel}
                </span>
                <span className="rounded-full border border-line bg-ink/60 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  {selectedRun?.eventCount ?? 0} events
                </span>
                {selectedRunDetail.conversationHref ? (
                  <button
                    type="button"
                    onClick={() => router.push(selectedRunDetail.conversationHref!)}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-accent transition hover:border-accent"
                  >
                    Open chat
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section className="rounded-3xl border border-line bg-ink/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{selectedRunDetail.summary}</p>
                {selectedRunDetail.errorMessage ? (
                  <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-100">{selectedRunDetail.errorMessage}</p>
                ) : null}
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-line bg-ink/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Started</p>
                  <p className="mt-2 text-sm font-medium text-white">{formatDate(selectedRunDetail.startedAt)}</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Completed</p>
                  <p className="mt-2 text-sm font-medium text-white">{selectedRunDetail.completedAt ? formatDate(selectedRunDetail.completedAt) : '—'}</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Provider</p>
                  <p className="mt-2 truncate text-sm font-medium text-white">{selectedRunDetail.providerId ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Job</p>
                  <p className="mt-2 truncate text-sm font-medium text-white">{selectedRunDetail.jobId ?? '—'}</p>
                </div>
              </section>

              {selectedRunDetail.criticalObservabilityEntries.length ? (
                <section className="rounded-3xl border border-accent/20 bg-accent/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-accent">Key observability</p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {selectedRunDetail.criticalObservabilityEntries.map((entry) => (
                      <div key={entry.label} className="rounded-2xl border border-line bg-black/10 p-3">
                        <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-600">{entry.label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-white">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              {selectedRunDetail.savedArtifactLinks.length ? (
                <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Saved outputs</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRunDetail.savedArtifactLinks.map((artifact) => (
                      <Link
                        key={artifact.id}
                        href={artifact.href}
                        className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100 transition hover:border-emerald-200"
                      >
                        {artifact.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl border border-line bg-ink/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Metrics</p>
                {selectedRunDetail.metrics.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRunDetail.metrics.map((metric) => (
                      <span key={metric} className="rounded-full border border-line bg-black/20 px-3 py-1 text-xs text-slate-300">
                        {metric}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No compact metrics were captured for this run.</p>
                )}
              </section>

              <section className="rounded-3xl border border-line bg-ink/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Event trace</p>
                  {isLoadingRunEvents ? <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Loading</span> : null}
                </div>
                {selectedRunEventRows.length ? (
                  <ol className="mt-3 space-y-3">
                    {selectedRunEventRows.map((event) => (
                      <li key={event.id} className="rounded-2xl border border-line bg-black/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{event.label}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-600">{event.sequenceLabel} · {event.eventType}</p>
                          </div>
                          <p className="shrink-0 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                        </div>
                        {event.message ? <p className="mt-2 text-xs leading-5 text-slate-400">{event.message}</p> : null}
                        {event.metadataEntries.length ? (
                          <dl className="mt-2 grid gap-1 text-xs text-slate-400">
                            {event.metadataEntries.map((entry) => (
                              <div key={entry.key} className="grid gap-2 sm:grid-cols-[0.4fr_1fr]">
                                <dt className="font-mono text-slate-600">{entry.key}</dt>
                                <dd className="break-words">{entry.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No event trace was captured for this run.</p>
                )}
              </section>

              <section className="rounded-3xl border border-line bg-ink/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Observability payload</p>
                {selectedRunDetail.observabilityEntries.length ? (
                  <dl className="mt-3 divide-y divide-line rounded-2xl border border-line bg-black/10">
                    {selectedRunDetail.observabilityEntries.map((entry) => (
                      <div key={entry.key} className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[0.45fr_1fr]">
                        <dt className="font-mono text-slate-500">{entry.key}</dt>
                        <dd className="break-words text-slate-300">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No observability payload was stored for this run.</p>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
