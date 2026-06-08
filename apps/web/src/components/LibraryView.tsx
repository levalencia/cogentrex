'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ArtifactItem, SkillRunSummary } from '@cogentrex/shared';
import { useAppStore } from '@/store/appStore';
import {
  buildArtifactDownload,
  buildLibraryArtifactHref,
  buildLibraryArtifactRows,
  buildLibraryArtifactRunHref,
  buildLibraryArtifactRunProvenance,
  buildLibraryModeCards,
  buildLibraryOverviewStats,
  buildRecentActivityItems,
  filterLibraryArtifacts,
  getLibraryArtifactMode,
  mergeLibraryArtifacts,
  resolveLibraryArtifactSelection,
} from '@/lib/libraryOutputs';
import { api } from '@/lib/api';
import { MarkdownMessage } from '@/components/MarkdownMessage';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function runStatusClass(tone: 'success' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (tone === 'danger') return 'border-rose-400/30 bg-rose-400/10 text-rose-100';
  return 'border-slate-600 bg-slate-800/60 text-slate-300';
}

export function LibraryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArtifactId = searchParams.get('artifact');
  const conversations = useAppStore((state) => state.conversations);
  const workspaceArtifacts = useAppStore((state) => state.artifacts);
  const [libraryArtifacts, setLibraryArtifacts] = useState<ArtifactItem[]>([]);
  const [skillRuns, setSkillRuns] = useState<SkillRunSummary[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(true);
  const [artifactQuery, setArtifactQuery] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [requestedArtifactMissing, setRequestedArtifactMissing] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const mergedArtifacts = useMemo(
    () => mergeLibraryArtifacts(libraryArtifacts, workspaceArtifacts),
    [libraryArtifacts, workspaceArtifacts],
  );
  const cards = buildLibraryModeCards(conversations, skillRuns, mergedArtifacts);
  const overviewStats = buildLibraryOverviewStats(conversations, mergedArtifacts, skillRuns);
  const filteredArtifacts = useMemo(
    () => filterLibraryArtifacts(mergedArtifacts, artifactQuery, skillRuns),
    [mergedArtifacts, artifactQuery, skillRuns],
  );
  const artifactRows = buildLibraryArtifactRows(filteredArtifacts, skillRuns);
  const selectedArtifact = selectedArtifactId ? filteredArtifacts.find((artifact) => artifact.id === selectedArtifactId) : undefined;
  const selectedArtifactHref = selectedArtifact ? buildLibraryArtifactHref(selectedArtifact.id) : null;
  const selectedArtifactRunHref = selectedArtifact ? buildLibraryArtifactRunHref(selectedArtifact, skillRuns) : null;
  const selectedArtifactRunProvenance = selectedArtifact ? buildLibraryArtifactRunProvenance(selectedArtifact, skillRuns) : null;
  const selectedArtifactMode = selectedArtifact ? getLibraryArtifactMode(selectedArtifact, skillRuns) : undefined;
  const recentActivity = buildRecentActivityItems(conversations, mergedArtifacts, skillRuns, 8);

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
    const nextSelection = resolveLibraryArtifactSelection(filteredArtifacts, selectedArtifactId, requestedArtifactId);
    setRequestedArtifactMissing(nextSelection.requestedArtifactMissing);
    if (selectedArtifactId !== nextSelection.selectedArtifactId) {
      setSelectedArtifactId(nextSelection.selectedArtifactId);
    }
  }, [filteredArtifacts, requestedArtifactId, selectedArtifactId]);

  async function copyTextToClipboard(text: string): Promise<boolean> {
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        // Fall back below for browser/automation contexts that block the async Clipboard API.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const didCopy = document.execCommand('copy');
    textarea.remove();
    return didCopy;
  }

  async function copySelectedArtifact() {
    if (!selectedArtifact) return;
    const didCopy = await copyTextToClipboard(selectedArtifact.content);
    setCopyStatus(didCopy ? 'Copied Markdown' : 'Copy failed');
  }

  async function copySelectedArtifactLink() {
    if (!selectedArtifactHref) return;
    const absoluteHref = `${window.location.origin}${selectedArtifactHref}`;
    const didCopy = await copyTextToClipboard(absoluteHref);
    setCopyStatus(didCopy ? 'Copied link' : `Link ready: ${absoluteHref}`);
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
                {requestedArtifactMissing ? (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
                    Artifact not found or not accessible. The Library is showing the closest available saved output instead.
                  </div>
                ) : null}
                {isLoadingArtifacts && !artifactRows.length ? (
                  <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                    Loading saved artifacts…
                  </div>
                ) : artifactRows.length ? artifactRows.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={artifact.href}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                      event.preventDefault();
                      setSelectedArtifactId(artifact.id);
                      router.push(artifact.href);
                    }}
                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${selectedArtifact?.id === artifact.id ? 'border-accent/70 bg-accent/10' : 'border-line bg-ink/50 hover:border-accent/60 hover:bg-accent/5'}`}
                  >
                    <p className="truncate text-sm font-medium text-white">{artifact.filename}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{artifact.subtitle}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{artifact.preview}</p>
                    <p className="mt-2 text-xs text-slate-600">{artifact.sizeLabel}</p>
                  </a>
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
                      {selectedArtifactRunHref ? (
                        <button
                          type="button"
                          onClick={() => router.push(selectedArtifactRunHref)}
                          className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 transition hover:border-accent"
                        >
                          Open origin run
                        </button>
                      ) : null}
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
                        onClick={copySelectedArtifactLink}
                        className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 transition hover:border-accent"
                      >
                        Copy link
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
                  {selectedArtifactRunProvenance ? (
                    <section className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-accent">Origin run</p>
                          <p className="mt-1 text-sm font-semibold text-white">{selectedArtifactRunProvenance.skillName}</p>
                          <p className="mt-1 text-xs text-slate-500">{selectedArtifactRunProvenance.modeLabel}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push(selectedArtifactRunProvenance.href)}
                          className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition hover:border-accent"
                        >
                          Inspect run
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${runStatusClass(selectedArtifactRunProvenance.statusTone)}`}>
                          {selectedArtifactRunProvenance.statusLabel}
                        </span>
                        <span className="rounded-full border border-line bg-ink/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          {selectedArtifactRunProvenance.durationLabel}
                        </span>
                        <span className="rounded-full border border-line bg-ink/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          {selectedArtifactRunProvenance.providerLabel}
                        </span>
                        <span className="rounded-full border border-line bg-ink/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          {selectedArtifactRunProvenance.sourceCountLabel}
                        </span>
                        <span className="rounded-full border border-line bg-ink/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          {selectedArtifactRunProvenance.savedOutputLabel}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-2xl border border-line bg-black/10 p-3">
                          <p className="uppercase tracking-[0.14em] text-slate-600">Artifact ID</p>
                          <p className="mt-1 break-all font-mono text-slate-200">{selectedArtifact.id}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push(selectedArtifactRunProvenance.href)}
                          className="rounded-2xl border border-line bg-black/10 p-3 text-left transition hover:border-accent"
                        >
                          <span className="block uppercase tracking-[0.14em] text-slate-600">Run ID</span>
                          <span className="mt-1 block break-all font-mono text-accent">{selectedArtifactRunProvenance.runId}</span>
                        </button>
                      </div>
                    </section>
                  ) : null}
                  <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-line bg-black/20 p-4 text-sm leading-6 text-slate-200">
                    <MarkdownMessage content={selectedArtifact.content} />
                  </div>
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

    </>
  );
}
