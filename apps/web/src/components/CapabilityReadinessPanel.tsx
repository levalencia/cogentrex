'use client';

import type { CapabilityReadinessItem, WorkflowReadiness } from '@cogentrex/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCapabilityId, getCapabilityAction, getCapabilitySummary, getReadinessTone } from '@/lib/capabilities';

export function CapabilityReadinessPanel() {
  const [workflows, setWorkflows] = useState<WorkflowReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.getCapabilities()
      .then(({ workflows: data }) => {
        if (!active) return;
        setWorkflows(data);
        setError(undefined);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load capability readiness');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mb-6 rounded-3xl border border-line bg-panel/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Workflow readiness</h2>
          <p className="mt-1 text-sm text-slate-400">
            Check whether each product workflow has the providers and tools it needs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(undefined);
            void api.getCapabilities()
              .then(({ workflows: data }) => setWorkflows(data))
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh capability readiness'))
              .finally(() => setLoading(false));
          }}
          className="rounded-xl border border-line px-3 py-2 text-xs text-accent hover:border-accent"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading readiness...</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {workflows.map((item) => (
            <WorkflowReadinessCard key={item.workflow.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function WorkflowReadinessCard({ item }: { item: WorkflowReadiness }) {
  const tone = getReadinessTone(item.status);
  return (
    <article className="rounded-2xl border border-line bg-ink/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">{item.workflow.label}</h3>
          <p className="mt-1 text-xs text-slate-400">{item.workflow.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone.className}`}>{tone.label}</span>
      </div>

      <p className="mt-3 text-sm text-slate-300">{getCapabilitySummary(item)}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CapabilityGroup title="Providers" items={item.providers} />
        <CapabilityGroup title="Tools" items={item.tools} />
      </div>
    </article>
  );
}

function CapabilityGroup({ title, items }: { title: string; items: CapabilityReadinessItem[] }) {
  if (items.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <p className="mt-2 text-xs text-slate-500">No requirements.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-2 space-y-2">
        {items.map((capability) => {
          const tone = getReadinessTone(capability.status);
          const action = getCapabilityAction(capability);
          return (
            <div key={`${capability.id}-${capability.adapterId ?? capability.status}`} className="rounded-xl border border-line bg-panel/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-200">{formatCapabilityId(capability.id)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tone.className}`}>{tone.label}</span>
              </div>
              {capability.adapterId ? <p className="mt-1 text-[11px] text-accent">{capability.adapterId}</p> : null}
              {capability.message ? <p className="mt-1 text-[11px] text-slate-500">{capability.message}</p> : null}
              {action ? (
                <Link href={action.href} className="mt-2 inline-flex rounded-lg border border-line px-2 py-1 text-[11px] text-accent hover:border-accent">
                  {action.label}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
