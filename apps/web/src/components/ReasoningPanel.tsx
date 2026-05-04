'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/appStore';

export function ReasoningPanel() {
  const reasoning = useAppStore((state) => state.reasoning);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const [expanded, setExpanded] = useState(false);

  if (!reasoning.length) return null;

  const latestStep = reasoning[reasoning.length - 1];
  if (!latestStep) return null;
  const searchCount = reasoning.filter((r) => r.step === 'Searching web').length;
  const foundCount = reasoning.filter((r) => r.step === 'Reviewing findings').length;

  return (
    <section className="rounded-3xl border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-accent">Research trace</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            {searchCount} searches · {foundCount} reviewed
          </span>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {latestStep.step}
            </span>
          ) : null}
        </div>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-xl border border-line px-3 py-1 text-xs text-slate-300 hover:border-accent"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-2">
          {reasoning.map((item) => (
            <div key={item.id} className="rounded-2xl border border-line bg-ink/50 p-3">
              <p className="text-sm font-medium text-slate-100">
                {item.iteration ? `Iteration ${item.iteration}: ` : ''}
                {item.step}
              </p>
              {item.detail ? <p className="mt-1 text-sm text-slate-400">{item.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-400">
          {isStreaming ? (
            <p>{latestStep.iteration ? `Iteration ${latestStep.iteration}: ` : ''}{latestStep.step} — {latestStep.detail}</p>
          ) : (
            <p>Research complete. {reasoning.length} steps performed.</p>
          )}
        </div>
      )}
    </section>
  );
}
