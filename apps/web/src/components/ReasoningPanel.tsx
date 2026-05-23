'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { getReasoningPanelSummary } from '@/lib/reasoningPanel';

const STEP_ICONS: Record<string, string> = {
  'Planning research': '💡',
  'Reviewing findings': '✅',
  'Synthesizing answer': '✍️',
  default: '🔍',
};

function getStepIcon(step: string): string {
  if (step.startsWith('Searching ')) return '🔍';
  const icon = STEP_ICONS[step] ?? STEP_ICONS.default;
  return icon ?? '🔍';
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SourceChip({ title, url }: { title: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-[200px] items-center gap-1.5 rounded-lg border border-line bg-panel/60 px-2 py-1 text-[11px] hover:border-accent/40 transition-colors"
      title={title}
    >
      <span className="truncate text-slate-300">{title}</span>
      <span className="shrink-0 text-slate-600">{getDomain(url)}</span>
    </a>
  );
}

export function ReasoningPanel() {
  const reasoning = useAppStore((state) => state.reasoning);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const searchIterations = useAppStore((state) => state.searchIterations);

  const [expanded, setExpanded] = useState(isStreaming);

  // Auto-expand while streaming, auto-collapse when done
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
    } else if (!isStreaming && expanded) {
      // Small delay before collapsing so user can see final state
      const timer = setTimeout(() => setExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  if (!reasoning.length) return null;

  const latestStep = reasoning[reasoning.length - 1];
  const summary = getReasoningPanelSummary({ isStreaming, latestStep: latestStep?.step });

  return (
    <section className="rounded-2xl border border-accent/20 bg-accent/5 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/5 transition-colors"
      >
        {summary.isActive ? (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
        )}
        <span className="text-sm font-medium text-accent">
          {summary.statusLabel}
        </span>
        <span className="text-xs text-slate-400">
          {summary.stepLabel}
        </span>
        <svg
          className={`ml-auto h-4 w-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded ? (
        <div className="space-y-0 border-t border-accent/10">
          {reasoning.map((item, index) => {
            const isSearch = item.step?.startsWith('Searching ');
            const channel = isSearch ? item.step!.replace('Searching ', '') : '';
            const iteration = item.iteration;
            const matchingIteration = iteration !== undefined
              ? searchIterations.find((si) => si.id === iteration)
              : undefined;

            return (
              <div
                key={item.id}
                className={`flex gap-3 px-4 py-2.5 ${index < reasoning.length - 1 ? 'border-b border-accent/5' : ''}`}
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs">
                  {getStepIcon(item.step ?? '')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    {item.step}
                  </p>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {item.detail}
                    </p>
                  ) : null}

                  {/* Inline source chips for search steps */}
                  {isSearch && matchingIteration && matchingIteration.results.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {matchingIteration.results.slice(0, 8).map((source) => (
                        <SourceChip key={source.id} title={source.title} url={source.url} />
                      ))}
                      {matchingIteration.results.length > 8 ? (
                        <span className="inline-flex items-center rounded-lg border border-line bg-panel/40 px-2 py-1 text-[11px] text-slate-500">
                          +{matchingIteration.results.length - 8} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Status indicator */}
                <div className="shrink-0 pt-0.5">
                  {index === reasoning.length - 1 && isStreaming ? (
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  ) : (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400/60" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
