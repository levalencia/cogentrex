'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { buildSkillCockpitModel } from '@/lib/skillCockpit';
import { getLauncherToneClasses, getReadinessBadgeClasses, type LauncherItem } from '@/lib/workflowLauncher';
import { useAppStore } from '@/store/appStore';

const readinessPills = [
  { id: 'ready', label: 'Ready' },
  { id: 'degraded', label: 'Limited' },
  { id: 'missing', label: 'Needs setup' },
  { id: 'unconfigured', label: 'Unpublished' },
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function runStatusClass(tone: string): string {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  if (tone === 'danger') return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

export function SkillCockpitView() {
  const router = useRouter();
  const clearChat = useAppStore((state) => state.clearChat);
  const setMode = useAppStore((state) => state.setMode);
  const [readiness, setReadiness] = useState<SkillReadiness[] | null>(null);
  const [skillRuns, setSkillRuns] = useState<SkillRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      api.getSkillReadiness().catch(() => ({ skills: [] })),
      api.listSkillRuns().catch(() => ({ runs: [] })),
    ])
      .then(([readinessResult, runsResult]) => {
        if (!cancelled) {
          setReadiness(readinessResult.skills);
          setSkillRuns(runsResult.runs);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cockpit = useMemo(() => buildSkillCockpitModel(readiness, skillRuns), [readiness, skillRuns]);

  function launchWorkflow(item: LauncherItem) {
    setMode(item.mode);
    clearChat();
    router.push('/chats');
  }

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#16233d,#0b0f19_45%)]">
      <header className="border-b border-line bg-panel/50 px-6 py-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-accent">Skill cockpit</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Launch and monitor focused AI workflows</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Pick a workflow, see readiness before launch, then follow real run history in the auditable runs ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/runs')}
            className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300 transition hover:border-accent hover:text-accent"
          >
            View all runs
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {readinessPills.map((pill) => (
            <div key={pill.id} className={`rounded-2xl border px-4 py-3 ${getReadinessBadgeClasses(pill.id)}`}>
              <p className="text-2xl font-semibold">{cockpit.readinessSummary[pill.id]}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-80">{pill.label}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workflow launcher</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Choose the smallest useful loop</h2>
              </div>
              {isLoading ? <span className="rounded-full border border-line px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">Checking live config</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {cockpit.cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => launchWorkflow(card)}
                  className={`rounded-3xl border p-4 text-left transition ${getLauncherToneClasses(card.tone, false)} hover:-translate-y-0.5`}
                >
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">{card.eyebrow}</span>
                  <span className="mt-2 flex items-start justify-between gap-3 text-lg font-semibold">
                    {card.label}
                    {card.readiness ? (
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${getReadinessBadgeClasses(card.readiness.status)}`}>
                        {card.readiness.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-sm leading-6 opacity-75">{card.description}</span>
                  {card.readiness ? <span className="mt-3 block text-xs leading-5 opacity-70">{card.readiness.message}</span> : null}
                  <span className="mt-4 inline-flex rounded-full border border-current/20 px-3 py-1 text-xs font-medium opacity-90">Open composer</span>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-line bg-panel/70 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Run health</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-line bg-ink/50 p-3">
                  <p className="text-2xl font-semibold text-white">{cockpit.health.totalRuns}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-3">
                  <p className="text-2xl font-semibold text-accent">{cockpit.health.activeRuns}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-3">
                  <p className="text-2xl font-semibold text-emerald-300">{cockpit.health.completedRuns}</p>
                  <p className="text-xs text-slate-500">Completed</p>
                </div>
                <div className="rounded-2xl border border-line bg-ink/50 p-3">
                  <p className="text-2xl font-semibold text-rose-300">{cockpit.health.failedRuns}</p>
                  <p className="text-xs text-slate-500">Failed</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-panel/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent runs</p>
                <button type="button" onClick={() => router.push('/runs')} className="text-xs text-accent hover:text-white">Ledger</button>
              </div>
              <div className="mt-4 space-y-3">
                {cockpit.recentRuns.length ? cockpit.recentRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => router.push('/runs')}
                    className="w-full rounded-2xl border border-line bg-ink/50 p-3 text-left transition hover:border-accent"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{run.skillName}</p>
                        <p className="mt-1 text-xs text-slate-500">{run.modeLabel} · {formatDate(run.timestamp)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${runStatusClass(run.statusTone)}`}>{run.statusLabel}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{run.summary}</p>
                  </button>
                )) : (
                  <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-slate-500">No runs yet. Launch a workflow to start the audit trail.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
