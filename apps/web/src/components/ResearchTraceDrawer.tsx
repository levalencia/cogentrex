'use client';

import { useState, memo } from 'react';
import type { ResearchSource, SearchIteration } from '@cogentrex/shared';
import { useAppStore } from '@/store/appStore';

const CHANNEL_ICONS: Record<string, string> = {
  web: '🌐',
  reddit: '🟠',
  youtube: '📺',
  rss: '📡',
  twitter: '🐦',
  hackernews: '🟧',
  github: '⚡',
  arxiv: '📄',
  exa: '🔍',
  default: '🔎',
};

function getChannelIcon(channel: string): string {
  const icon = CHANNEL_ICONS[channel.toLowerCase()] ?? CHANNEL_ICONS.default;
  return icon ?? '🔎';
}

function getDomain(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const SourceCard = memo(function SourceCard({ source }: { source: ResearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-line bg-panel/50 p-2.5 hover:border-accent/40 transition-colors"
    >
      <p className="text-xs font-medium text-slate-200 line-clamp-1">{source.title}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{getDomain(source.url)}</p>
      {source.snippet ? (
        <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{source.snippet}</p>
      ) : null}
    </a>
  );
});

function IterationCard({ iteration }: { iteration: SearchIteration }) {
  const [expanded, setExpanded] = useState(true);
  const icon = getChannelIcon(iteration.channel);

  return (
    <div className="border-b border-line last:border-0">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-panel/50 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">
            {iteration.channel}: "{iteration.query}"
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {iteration.status === 'searching' ? (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
          <span className="text-[10px] text-slate-400">{iteration.resultCount}</span>
          <svg
            className={`h-3.5 w-3.5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded ? (
        <div className="px-4 pb-3 space-y-1.5">
          {iteration.results.slice(0, 50).map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
          {iteration.results.length > 50 ? (
            <p className="text-[10px] text-slate-500 px-1">+ {iteration.results.length - 50} more sources</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ResearchTraceDrawer() {
  const searchIterations = useAppStore((state) => state.searchIterations);
  const researchDrawerOpen = useAppStore((state) => state.researchDrawerOpen);
  const toggleResearchDrawer = useAppStore((state) => state.toggleResearchDrawer);

  if (!researchDrawerOpen || searchIterations.length === 0) return null;

  const totalSources = searchIterations.reduce((sum, iter) => sum + iter.resultCount, 0);

  return (
    <aside className="hidden xl:flex w-80 flex-col border-l border-line bg-panel h-full overflow-hidden shrink-0">
      <header className="flex items-center justify-between border-b border-line bg-panel/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Research Trace</h3>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
            {totalSources} sources
          </span>
        </div>
        <button
          onClick={toggleResearchDrawer}
          className="text-xs text-slate-500 hover:text-white"
          title="Hide trace"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {searchIterations.map((iteration) => (
          <IterationCard key={iteration.id} iteration={iteration} />
        ))}
      </div>
    </aside>
  );
}

export function ShowTraceButton() {
  const searchIterations = useAppStore((state) => state.searchIterations);
  const researchDrawerOpen = useAppStore((state) => state.researchDrawerOpen);
  const toggleResearchDrawer = useAppStore((state) => state.toggleResearchDrawer);

  if (searchIterations.length === 0 || researchDrawerOpen) return null;

  return (
    <button
      onClick={toggleResearchDrawer}
      className="flex items-center gap-1.5 rounded-xl border border-line bg-accent/10 px-3 py-1.5 text-sm text-accent hover:border-accent transition-colors"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      Show trace
    </button>
  );
}
