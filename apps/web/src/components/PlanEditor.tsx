'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';

export function PlanEditor() {
  const pendingPlan = useAppStore((state) => state.pendingPlan);
  const startResearch = useAppStore((state) => state.startResearch);
  const cancelPlan = useAppStore((state) => state.cancelPlan);
  const [plan, setPlan] = useState<string[]>([]);

  useEffect(() => {
    if (pendingPlan?.plan && pendingPlan.plan.length > 0) setPlan(pendingPlan.plan);
  }, [pendingPlan?.plan]);

  if (!pendingPlan) return null;

  if (pendingPlan.isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-xl rounded-3xl border border-line bg-panel p-8 shadow-2xl flex flex-col items-center text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <h2 className="mt-4 text-lg font-semibold text-white">{pendingPlan.loadingMessage ?? 'Planning your research...'}</h2>
          <p className="mt-2 text-sm text-slate-400 line-clamp-2">{pendingPlan.question}</p>
        </div>
      </div>
    );
  }

  function updateQuery(index: number, value: string) {
    const next = [...plan];
    next[index] = value;
    setPlan(next);
  }

  function removeQuery(index: number) {
    setPlan((prev) => prev.filter((_, i) => i !== index));
  }

  function addQuery() {
    setPlan((prev) => [...prev, '']);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl border border-line bg-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Research Plan</h2>
        <p className="mt-1 text-sm text-slate-400">Review or edit the search queries before starting deep research.</p>

        <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
          {plan.map((query, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-6">{index + 1}</span>
              <input
                value={query}
                onChange={(e) => updateQuery(index, e.target.value)}
                className="flex-1 rounded-xl border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
              <button
                onClick={() => removeQuery(index)}
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addQuery}
          className="mt-3 rounded-xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-accent"
        >
          + Add Query
        </button>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => void startResearch(plan)}
            className="rounded-2xl bg-accent px-6 py-2.5 font-semibold text-ink"
          >
            Start Research
          </button>
          <button
            onClick={() => {
              setPlan(pendingPlan.plan);
              void startResearch(pendingPlan.plan);
            }}
            className="rounded-2xl border border-line px-6 py-2.5 text-sm text-slate-300 hover:border-accent"
          >
            Use Original Plan
          </button>
          <button
            onClick={cancelPlan}
            className="ml-auto rounded-2xl border border-line px-6 py-2.5 text-sm text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
