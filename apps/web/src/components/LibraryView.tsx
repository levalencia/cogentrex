'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ArtifactItem } from '@cogentrex/shared';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import {
  buildArtifactDownload,
  buildLibraryArtifactRows,
  buildLibraryModeCards,
  filterLibraryArtifacts,
} from '@/lib/libraryOutputs';
import { api } from '@/lib/api';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function findArtifact(artifacts: ArtifactItem[], artifactId: string | null): ArtifactItem | undefined {
  return artifacts.find((artifact) => artifact.id === artifactId) ?? artifacts[0];
}

export function LibraryView() {
  const router = useRouter();
  const conversations = useAppStore((state) => state.conversations);
  const [libraryArtifacts, setLibraryArtifacts] = useState<ArtifactItem[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(true);
  const [artifactQuery, setArtifactQuery] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const cards = buildLibraryModeCards(conversations);
  const filteredArtifacts = useMemo(
    () => filterLibraryArtifacts(libraryArtifacts, artifactQuery),
    [libraryArtifacts, artifactQuery],
  );
  const artifactRows = buildLibraryArtifactRows(filteredArtifacts);
  const selectedArtifact = findArtifact(filteredArtifacts, selectedArtifactId);
  const recent = conversations.slice(0, 6);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingArtifacts(true);
    api.listLibraryArtifacts()
      .then(({ artifacts }) => {
        if (!cancelled) setLibraryArtifacts(artifacts);
      })
      .catch(() => {
        if (!cancelled) setLibraryArtifacts([]);
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
        <div className="grid gap-3 md:grid-cols-4">
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
                <h2 className="text-lg font-semibold text-white">Recent outputs by conversation</h2>
                <p className="text-sm text-slate-500">Quick links back to the conversation context behind saved work.</p>
              </div>
              <span className="rounded-full border border-line bg-ink/50 px-3 py-1 text-xs text-slate-400">{conversations.length} total</span>
            </div>
            <div className="mt-4 space-y-2">
              {recent.length ? recent.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => router.push(`/chats/${conversation.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-ink/40 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-accent/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{conversation.title || 'Untitled output'}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{conversation.mode.replace('_', ' ')}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(conversation.updatedAt)}</span>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                  No saved conversations yet. Run a workflow and it will show up here.
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
                {isLoadingArtifacts ? (
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
                        {selectedArtifact.conversationTitle ?? 'Untitled output'} · {selectedArtifact.conversationMode?.replace('_', ' ') ?? 'Unknown mode'}
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
  );
}
