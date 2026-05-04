'use client';

import { useState, useEffect } from 'react';
import type { RequestMetric } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';

export function ViewLogsButton({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  const openLogsPanel = useAppStore((state) => state.openLogsPanel);

  return (
    <button
      onClick={() => openLogsPanel(conversationId, messageId)}
      className="mt-2 text-xs text-slate-500 hover:text-accent"
    >
      View Logs
    </button>
  );
}

export function LogsBottomPanel() {
  const logsPanelOpen = useAppStore((state) => state.logsPanelOpen);
  const logsPanelConversationId = useAppStore((state) => state.logsPanelConversationId);
  const logsPanelMessageId = useAppStore((state) => state.logsPanelMessageId);
  const closeLogsPanel = useAppStore((state) => state.closeLogsPanel);
  const [metrics, setMetrics] = useState<RequestMetric[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!logsPanelOpen || !logsPanelConversationId) return;
    setLoading(true);
    api.getMetrics(logsPanelConversationId)
      .then(({ metrics: data }) => {
        setMetrics(data.filter((m) => !logsPanelMessageId || m.messageId === logsPanelMessageId || !m.messageId));
      })
      .catch(() => setMetrics([]))
      .finally(() => setLoading(false));
  }, [logsPanelOpen, logsPanelConversationId, logsPanelMessageId]);

  if (!logsPanelOpen) return null;

  return (
    <div className="shrink-0 border-t border-line bg-ink/95 backdrop-blur" style={{ height: 280 }}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-panel/50 px-4 py-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">Request Logs</h3>
            {logsPanelMessageId ? <span className="text-[10px] text-slate-500">Message: {logsPanelMessageId.slice(0, 16)}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { if (logsPanelConversationId) { api.getMetrics(logsPanelConversationId).then(({ metrics: data }) => setMetrics(data)); } }} className="text-[10px] text-slate-500 hover:text-accent">
              Refresh
            </button>
            <button onClick={closeLogsPanel} className="text-xs text-slate-500 hover:text-white">Close</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-xs text-slate-500">Loading metrics...</p>
          ) : metrics.length === 0 ? (
            <p className="text-xs text-slate-500">No metrics recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {metrics.map((m) => (
                <div key={m.id} className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-accent capitalize">{m.step.replace(/_/g, ' ')}</span>
                    <span className="text-slate-500">{m.durationMs ? `${m.durationMs}ms` : ''}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-slate-400">
                    {m.model ? <span>Model: {m.model}</span> : null}
                    {m.totalTokens ? <span>Tokens: {m.totalTokens}</span> : null}
                    {m.ttftMs ? <span>TTFT: {m.ttftMs}ms</span> : null}
                    {m.tps ? <span>TPS: {Number(m.tps).toFixed(1)}</span> : null}
                  </div>
                  {m.metadata ? (
                    <pre className="mt-2 max-h-24 overflow-auto rounded bg-ink p-2 text-[10px] text-slate-500">
                      {JSON.stringify(m.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
