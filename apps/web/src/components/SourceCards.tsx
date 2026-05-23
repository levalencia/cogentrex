'use client';

import type { ResearchSource } from '@cogentrex/shared';

interface SourceCardsProps {
  sources: ResearchSource[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getChannelColor(channel: string): string {
  switch (channel) {
    case 'reddit': return 'bg-orange-500/20 text-orange-300';
    case 'youtube': return 'bg-red-500/20 text-red-300';
    case 'rss': return 'bg-blue-500/20 text-blue-300';
    default: return 'bg-slate-500/20 text-slate-400';
  }
}

export function SourceCards({ sources }: SourceCardsProps) {
  if (!sources.length) return null;

  return (
    <section className="rounded-3xl border border-line bg-panel/80 p-4" id="sources">
      <h2 className="font-semibold text-white">Referenced sources ({sources.length})</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            id={`source-${source.id}`}
            className="group rounded-2xl border border-line bg-ink/50 p-4 text-sm transition hover:border-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-accent">[{source.id}]</span>
              <div className="flex items-center gap-1.5">
                {source.channel ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${getChannelColor(source.channel)}`}>
                    {source.channel}
                  </span>
                ) : null}
                <span className="text-[11px] text-slate-500">{getDomain(source.url)}</span>
              </div>
            </div>
            <p className="mt-1 font-medium text-slate-200 group-hover:text-white">{source.title}</p>
            {source.snippet ? (
              <p className="mt-1.5 line-clamp-3 text-xs text-slate-400">{source.snippet}</p>
            ) : null}
          </a>
        ))}
      </div>
    </section>
  );
}
