'use client';

import { useState, useEffect } from 'react';
import type { RequestMetric, StreamEvent } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';

export function ViewDiagnosticsButton({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  const openDiagnosticsPanel = useAppStore((state) => state.openDiagnosticsPanel);

  return (
    <button
      onClick={() => openDiagnosticsPanel(conversationId, messageId)}
      className="mt-2 text-xs text-slate-500 hover:text-accent"
    >
      View Diagnostics
    </button>
  );
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function MetricCard({ metric }: { metric: RequestMetric }) {
  return (
    <div className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-accent capitalize">{metric.step.replace(/_/g, ' ')}</span>
        <span className="text-slate-500">{formatDuration(metric.durationMs)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-slate-400">
        {metric.model ? <span>Model: {metric.model}</span> : null}
        {metric.totalTokens ? <span>Tokens: {metric.totalTokens}</span> : null}
        {metric.ttftMs ? <span>TTFT: {metric.ttftMs}ms</span> : null}
        {metric.tps ? <span>TPS: {Number(metric.tps).toFixed(1)}</span> : null}
      </div>
    </div>
  );
}

function formatDiagnosticValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function DiagnosticCard({ event }: { event: Extract<StreamEvent, { type: 'diagnostic' }> }) {
  const metadata = Object.entries(event.metadata ?? {}).filter(([, value]) => value !== undefined);
  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-accent capitalize">{event.name.replace(/_/g, ' ')}</span>
        {event.iteration !== undefined ? <span className="text-[10px] text-slate-500">Iteration {event.iteration}</span> : null}
      </div>
      {event.message ? <p className="mt-1 text-slate-400">{event.message}</p> : null}
      {metadata.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {metadata.map(([key, value]) => (
            <span key={key} className="rounded-lg border border-line/70 bg-ink/40 px-2 py-1 text-[10px] text-slate-400">
              <span className="text-slate-500">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>{' '}
              <span className="text-slate-300">{formatDiagnosticValue(value)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResearchTraceSummary({ reasoning }: { reasoning: StreamEvent[] }) {
  const reasoningEvents = reasoning.filter((r): r is Extract<StreamEvent, { type: 'reasoning' }> => r.type === 'reasoning');
  const diagnosticEvents = reasoning.filter((r): r is Extract<StreamEvent, { type: 'diagnostic' }> => r.type === 'diagnostic');
  const planning = reasoningEvents.find((r) => r.step === 'Planning research');
  const searches = reasoningEvents.filter((r) => r.step?.startsWith('Searching '));
  const reviews = reasoningEvents.filter((r) => r.step === 'Reviewing findings');
  const synthesis = reasoningEvents.find((r) => r.step === 'Synthesizing answer');

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Research Trace</h4>
      {planning ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-accent">●</span>
          <span className="text-slate-200">Planning:</span>
          <span className="text-slate-400">{searches.length} queries generated</span>
        </div>
      ) : null}
      {searches.map((search, i) => (
        <div key={i} className="flex items-center gap-2 text-xs ml-1">
          <span className="text-slate-500">└</span>
          <span className="text-slate-200">Searching {search.step?.replace('Searching ', '')}:</span>
          <span className="text-slate-400 truncate max-w-[200px]">"{search.detail}"</span>
          {reviews[i] ? (
            <span className="text-slate-400">→ {reviews[i].detail}</span>
          ) : (
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-accent" />
          )}
        </div>
      ))}
      {synthesis ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-400">●</span>
          <span className="text-slate-200">Synthesis:</span>
          <span className="text-slate-400">Writing final response</span>
        </div>
      ) : null}
      {diagnosticEvents.length ? (
        <div className="mt-3 space-y-2">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Provider / fetch diagnostics</h5>
          {diagnosticEvents.map((event, index) => (
            <DiagnosticCard key={`${event.name}-${event.iteration ?? 'run'}-${index}`} event={event} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DiagnosticsBottomPanel() {
  const diagnosticsPanelOpen = useAppStore((state) => state.diagnosticsPanelOpen);
  const diagnosticsConversationId = useAppStore((state) => state.diagnosticsConversationId);
  const diagnosticsMessageId = useAppStore((state) => state.diagnosticsMessageId);
  const closeDiagnosticsPanel = useAppStore((state) => state.closeDiagnosticsPanel);

  const [metrics, setMetrics] = useState<RequestMetric[]>([]);
  const [reasoning, setReasoning] = useState<StreamEvent[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [showRawMetrics, setShowRawMetrics] = useState(false);

  useEffect(() => {
    if (!diagnosticsPanelOpen || !diagnosticsConversationId) return;
    setLoading(true);
    api.getDiagnostics(diagnosticsConversationId)
      .then(({ metrics: data, reasoning: r }) => {
        setMetrics(data.filter((m) => !diagnosticsMessageId || m.messageId === diagnosticsMessageId || !m.messageId));
        setReasoning(r);
      })
      .catch(() => {
        setMetrics([]);
        setReasoning(undefined);
      })
      .finally(() => setLoading(false));
  }, [diagnosticsPanelOpen, diagnosticsConversationId, diagnosticsMessageId]);

  if (!diagnosticsPanelOpen) return null;

  const isDeepResearch = reasoning && reasoning.length > 0;

  return (
    <div className="shrink-0 border-t border-line bg-ink/95 backdrop-blur" style={{ height: 280 }}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-panel/50 px-4 py-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">Diagnostics</h3>
            {diagnosticsMessageId ? <span className="text-[10px] text-slate-500">Message: {diagnosticsMessageId.slice(0, 16)}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (diagnosticsConversationId) { api.getDiagnostics(diagnosticsConversationId).then(({ metrics: data, reasoning: r }) => { setMetrics(data); setReasoning(r); }); } }}
              className="text-[10px] text-slate-500 hover:text-accent"
            >
              Refresh
            </button>
            <button onClick={closeDiagnosticsPanel} className="text-xs text-slate-500 hover:text-white">Close</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-xs text-slate-500">Loading diagnostics...</p>
          ) : metrics.length === 0 && !reasoning?.length ? (
            <p className="text-xs text-slate-500">No diagnostics recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {isDeepResearch && reasoning ? (
                <ResearchTraceSummary reasoning={reasoning} />
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Metrics</h4>
                  <button
                    onClick={() => setShowRawMetrics((prev) => !prev)}
                    className="text-[10px] text-slate-500 hover:text-accent"
                  >
                    {showRawMetrics ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {showRawMetrics ? (
                  <div className="space-y-2">
                    {metrics.map((m) => (
                      <MetricCard key={m.id} metric={m} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {metrics.slice(0, 3).map((m) => (
                      <div key={m.id} className="rounded-lg border border-line bg-panel/30 px-2.5 py-1 text-[10px] text-slate-400">
                        <span className="text-slate-300">{m.step.replace(/_/g, ' ')}</span>
                        {' · '}
                        {m.model ?? ''}
                        {m.totalTokens ? ` · ${m.totalTokens} tokens` : ''}
                        {m.durationMs ? ` · ${formatDuration(m.durationMs)}` : ''}
                      </div>
                    ))}
                    {metrics.length > 3 ? (
                      <span className="rounded-lg border border-line bg-panel/30 px-2.5 py-1 text-[10px] text-slate-500">
                        +{metrics.length - 3} more
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-slate-600">Sensitive server-side logs are not exposed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
