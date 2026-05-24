'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppMode, ArtifactItem, SkillRunSummary } from '@cogentrex/shared';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import {
  buildArtifactDownload,
  buildLibraryArtifactRows,
  buildLibraryModeCards,
  buildLibraryOverviewStats,
  buildRecentActivityItems,
  buildSkillRunDetail,
  buildSkillRunHealthStats,
  buildSkillRunHistoryRows,
  filterLibraryArtifacts,
  filterSkillRuns,
  getLibraryArtifactMode,
  mergeLibraryArtifacts,
} from '@/lib/libraryOutputs';
import { api } from '@/lib/api';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function findArtifact(artifacts: ArtifactItem[], artifactId: string | null): ArtifactItem | undefined {
  return artifacts.find((artifact) => artifact.id === artifactId) ?? artifacts[0];
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

export function LibraryView() {
  const router = useRouter();
  const conversations = useAppStore((state) => state.conversations);
  const workspaceArtifacts = useAppStore((state) => state.artifacts);
  const [libraryArtifacts, setLibraryArtifacts] = useState<ArtifactItem[]>([]);
  const [skillRuns, setSkillRuns] = useState<SkillRunSummary[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(true);
  const [artifactQuery, setArtifactQuery] = useState('');
  const [runQuery, setRunQuery] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<(typeof runStatusOptions)[number]['value']>('all');
  const [runModeFilter, setRunModeFilter] = useState<AppMode | 'all'>('all');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const cards = buildLibraryModeCards(conversations, skillRuns);
  const mergedArtifacts = useMemo(
    () => mergeLibraryArtifacts(libraryArtifacts, workspaceArtifacts),
    [libraryArtifacts, workspaceArtifacts],
  );
  const overviewStats = buildLibraryOverviewStats(conversations, mergedArtifacts, skillRuns);
  const filteredArtifacts = useMemo(
    () => filterLibraryArtifacts(mergedArtifacts, artifactQuery),
    [mergedArtifacts, artifactQuery],
  );
  const artifactRows = buildLibraryArtifactRows(filteredArtifacts, skillRuns);
  const selectedArtifact = findArtifact(filteredArtifacts, selectedArtifactId);
  const selectedArtifactMode = selectedArtifact ? getLibraryArtifactMode(selectedArtifact, skillRuns) : undefined;
  const recentActivity = buildRecentActivityItems(conversations, mergedArtifacts, skillRuns, 8);
  const skillRunStats = buildSkillRunHealthStats(skillRuns);
  const filteredSkillRuns = useMemo(
    () => filterSkillRuns(skillRuns, { status: runStatusFilter, mode: runModeFilter, query: runQuery }),
    [skillRuns, runStatusFilter, runModeFilter, runQuery],
  );
  const skillRunRows = buildSkillRunHistoryRows(filteredSkillRuns, 12);
  const selectedRun = selectedRunId ? skillRuns.find((run) => run.id === selectedRunId) : undefined;
  const selectedRunDetail = selectedRun ? buildSkillRunDetail(selectedRun) : undefined;

  useEffect(() => {
    let cancelled = false;
    setIsLoadingArtifacts(true);
    Promise.all([
      api.listLibraryArtifacts().catch(() => ({ artifacts: [] })),
      api.listSkillRuns().catch(() => ({ runs: [] })),
    ])
      .then(([artifactResult, runResult]) => {
        if (!cancelled) {
          setLibraryArtifacts(artifactResult.artifacts);
          setSkillRuns(runResult.runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLibraryArtifacts([]);
          setSkillRuns([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingArtifacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!filteredArtifacts.length) {
      setSelectedArtifactId(null);
      return;
    }
    if (!selectedArtifactId || !filteredArtifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(filteredArtifacts[0]?.id ?? null);
    }
  }, [filteredArtifacts, selectedArtifactId]);

  useEffect(() => {
    if (selectedRunId && !skillRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [selectedRunId, skillRuns]);

  async function copySelectedArtifact() {
    if (!selectedArtifact) return;
    try {
      await navigator.clipboard.writeText(selectedArtifact.content);
      setCopyStatus('Copied Markdown');
    } catch {
      setCopyStatus('Copy failed');
    }
  }

  function downloadSelectedArtifact() {
    if (!selectedArtifact) return;
    const download = buildArtifactDownload(selectedArtifact);
    const blob = new Blob([download.content], { type: download.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = download.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#17213b,#0b0f19_45%)]">
      <header className="border-b border-line bg-panel/70 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Output library</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Reusable work, not buried chat history.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Search, preview, copy, and export durable research briefs, social drafts, generated media, and saved assistant artifacts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
          >
            New workflow
          </button>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-3 lg:grid-cols-4">
          <article className="rounded-3xl border border-accent/20 bg-accent/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">Workspace runs</p>
            <p className="mt-2 text-2xl font-semibold text-white">{overviewStats.totalWorkflows}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Total reusable workflows tracked in this cockpit.</p>
          </article>
          <article className="rounded-3xl border border-line bg-panel/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Saved artifacts</p>
            <p className="mt-2 text-2xl font-semibold text-white">{overviewStats.savedArtifacts}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Pinned assistant outputs ready to copy or export.</p>
          </article>
          <article className="rounded-3xl border border-line bg-panel/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Saved per run</p>
            <p className="mt-2 text-2xl font-semibold text-white">{overviewStats.savedPerWorkflowLabel}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Lightweight reuse signal; higher means more work is being captured.</p>
          </article>
          <article className="rounded-3xl border border-line bg-panel/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Latest activity</p>
            <p className="mt-2 text-2xl font-semibold text-white">{overviewStats.latestActivityAt ? formatDate(overviewStats.latestActivityAt) : '—'}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Most recent workflow or saved artifact timestamp.</p>
          </article>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {cards.map((card) => (
            <article key={card.id} className="rounded-3xl border border-line bg-panel/80 p-5 shadow-xl shadow-black/20">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{card.count}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
            </article>
          ))}
        </div>

        <section className="mt-6 rounded-3xl border border-line bg-panel/80 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Run history</p>
              <h2 className="mt-2 text-lg font-semibold text-white">Skill runs as auditable work units</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Status, duration, and observability signals for the workflows that feed Library and Recent activity.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-2xl border border-line bg-ink/50 px-3 py-2">
                <p className="uppercase tracking-[0.16em] text-slate-600">Total</p>
                <p className="mt-1 text-lg font-semibold text-white">{skillRunStats.totalRuns}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                <p className="uppercase tracking-[0.16em] text-amber-200/60">Active</p>
                <p className="mt-1 text-lg font-semibold text-amber-100">{skillRunStats.activeRuns}</p>
              </div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 px-3 py-2">
                <p className="uppercase tracking-[0.16em] text-rose-200/60">Failed</p>
                <p className="mt-1 text-lg font-semibold text-rose-100">{skillRunStats.failedRuns}</p>
              </div>
              <div className="rounded-2xl border border-line bg-ink/50 px-3 py-2">
                <p className="uppercase tracking-[0.16em] text-slate-600">Latest</p>
                <p className="mt-1 text-sm font-semibold text-white">{skillRunStats.latestRunAt ? formatDate(skillRunStats.latestRunAt) : '—'}</p>
              </div>
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
            {isLoadingArtifacts && !skillRunRows.length ? (
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

        <div className="mt-6 grid gap-6 2xl:grid-cols-[0.9fr_1.3fr]">
          <section className="rounded-3xl border border-line bg-panel/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Recent activity</h2>
                <p className="text-sm text-slate-500">A lightweight cockpit view of workflow runs and saved artifacts.</p>
              </div>
              <span className="rounded-full border border-line bg-ink/50 px-3 py-1 text-xs text-slate-400">{recentActivity.length} shown</span>
            </div>
            <div className="mt-4 space-y-2">
              {recentActivity.length ? recentActivity.map((activity) => (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => router.push(activity.href)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-line bg-ink/40 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-accent/5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${activity.kind === 'artifact' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}>
                        {activity.kind === 'artifact' ? 'Artifact' : 'Run'}
                      </span>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{activity.eyebrow}</p>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-white">{activity.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{activity.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(activity.timestamp)}</span>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                  No activity yet. Run a workflow or save an assistant answer to populate this cockpit feed.
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4 rounded-3xl border border-accent/20 bg-accent/5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
            <aside>
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Artifact shelf</p>
              <h2 className="mt-2 text-lg font-semibold text-white">Saved artifacts across conversations</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Persisted assistant outputs and generated artifacts that can be reused without digging through individual chat threads.
              </p>
              <label className="mt-4 block text-xs uppercase tracking-[0.2em] text-slate-500" htmlFor="artifact-search">
                Search library
              </label>
              <input
                id="artifact-search"
                value={artifactQuery}
                onChange={(event) => setArtifactQuery(event.target.value)}
                placeholder="Search title, mode, or content…"
                className="mt-2 w-full rounded-2xl border border-line bg-ink/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-accent"
              />
              <div className="mt-4 space-y-2">
                {isLoadingArtifacts && !artifactRows.length ? (
                  <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                    Loading saved artifacts…
                  </div>
                ) : artifactRows.length ? artifactRows.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => setSelectedArtifactId(artifact.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedArtifact?.id === artifact.id ? 'border-accent/70 bg-accent/10' : 'border-line bg-ink/50 hover:border-accent/60 hover:bg-accent/5'}`}
                  >
                    <p className="truncate text-sm font-medium text-white">{artifact.filename}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{artifact.subtitle}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{artifact.preview}</p>
                    <p className="mt-2 text-xs text-slate-600">{artifact.sizeLabel}</p>
                  </button>
                )) : (
                  <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                    {artifactQuery ? 'No artifacts match this search.' : 'No saved artifacts yet. Use “Save to Library” on an assistant answer to pin it here.'}
                  </div>
                )}
              </div>
            </aside>

            <article className="min-h-[420px] rounded-3xl border border-line bg-ink/60 p-5">
              {selectedArtifact ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-accent">Preview</p>
                      <h3 className="mt-2 truncate text-xl font-semibold text-white">{selectedArtifact.filename}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedArtifact.conversationTitle ?? 'Untitled output'} · {selectedArtifactMode?.replace('_', ' ') ?? 'Unknown mode'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/chats/${selectedArtifact.conversationId}`)}
                        className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 transition hover:border-accent"
                      >
                        Open chat
                      </button>
                      <button
                        type="button"
                        onClick={copySelectedArtifact}
                        className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 transition hover:border-accent"
                      >
                        Copy Markdown
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedArtifact}
                        className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-ink transition hover:bg-white"
                      >
                        Download .md
                      </button>
                    </div>
                  </div>
                  {copyStatus ? <p className="mt-3 text-xs text-accent">{copyStatus}</p> : null}
                  <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-line bg-black/20 p-4 text-sm leading-6 text-slate-200">
                    {selectedArtifact.content}
                  </pre>
                </>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                  Select an artifact to preview, copy, download, or open its source conversation.
                </div>
              )}
            </article>
          </section>
        </div>
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
