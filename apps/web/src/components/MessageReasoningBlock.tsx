'use client';

import { useState } from 'react';

interface ReasoningEntry {
  step: string;
  detail?: string | undefined;
  iteration?: number | undefined;
}

const STEP_ICONS: Record<string, string> = {
  'Planning research': '💡',
  'Reviewing findings': '✅',
  'Synthesizing answer': '✍️',
  default: '🔍',
};

function getStepIcon(step: string): string {
  if (step.startsWith('Searching ')) return '🔍';
  return (STEP_ICONS[step] ?? STEP_ICONS.default) || '🔍';
}

interface MessageReasoningBlockProps {
  reasoning: ReasoningEntry[];
}

export function MessageReasoningBlock({ reasoning }: MessageReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  if (!reasoning.length) return null;

  return (
    <div className="mt-2 rounded-xl border border-accent/15 bg-accent/5 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-accent/5 transition-colors"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-green-400/70" />
        <span className="text-xs font-medium text-accent">Thinking</span>
        <span className="truncate text-xs text-slate-400">
          {reasoning.length} steps
        </span>
        <svg
          className={`ml-auto h-3.5 w-3.5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded ? (
        <div className="border-t border-accent/10 px-4 py-2 space-y-1">
          {reasoning.map((item, idx) => (
            <div key={idx} className="flex gap-2.5">
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[11px]">
                {getStepIcon(item.step)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-slate-300">{item.step}</p>
                {item.detail ? (
                  <p className="text-[11px] text-slate-500">{item.detail}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
