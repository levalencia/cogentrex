'use client';

import { useEffect, useState } from 'react';
import type { ArtifactItem } from '@cogentrex/shared';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { buildLibraryArtifactRows, buildLibraryModeCards } from '@/lib/libraryOutputs';
import { api } from '@/lib/api';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function LibraryView() {
  const router = useRouter();
  const conversations = useAppStore((state) => state.conversations);
  const [libraryArtifacts, setLibraryArtifacts] = useState<ArtifactItem[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(true);
  const cards = buildLibraryModeCards(conversations);
  const artifactRows = buildLibraryArtifactRows(libraryArtifacts);
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

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#17213b,#0b0f19_45%)]">
      <header className="border-b border-line bg-panel/70 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Output library</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Reusable work, not buried chat history.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              First pass for a dedicated outputs shelf: research briefs, social drafts, generated media, and artifacts that can graduate out of individual conversations.
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-line bg-panel/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Recent outputs by conversation</h2>
                <p className="text-sm text-slate-500">Uses existing conversation metadata first; global artifact indexing can come next.</p>
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

          <aside className="rounded-3xl border border-accent/20 bg-accent/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-accent">Artifact shelf</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Saved artifacts across conversations</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Persisted assistant outputs and generated artifacts that can be reused without digging through individual chat threads.
            </p>
            <div className="mt-4 space-y-2">
              {isLoadingArtifacts ? (
                <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                  Loading saved artifacts…
                </div>
              ) : artifactRows.length ? artifactRows.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => router.push(artifact.conversationHref)}
                  className="w-full rounded-2xl border border-line bg-ink/50 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-accent/5"
                >
                  <p className="truncate text-sm font-medium text-white">{artifact.filename}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{artifact.subtitle}</p>
                  <p className="mt-1 text-xs text-slate-600">{artifact.sizeLabel}</p>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-slate-500">
                  No saved artifacts yet. Use “Save to Library” on an assistant answer to pin it here.
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
