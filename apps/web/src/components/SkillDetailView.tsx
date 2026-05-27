'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SkillDetail, SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { api, ApiError } from '@/lib/api';
import { buildSkillManifestModel, readinessToneClasses } from '@/lib/skillManifest';
import { formatSkillMode, getSkillIconGlyph } from '@/lib/skills';
import { useAppStore } from '@/store/appStore';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusClasses(status: SkillRunSummary['status']): string {
  if (status === 'completed') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (status === 'failed') return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  if (status === 'running') return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

function labelForStatus(status: SkillRunSummary['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  return 'Pending';
}

export function SkillDetailView() {
  const params = useParams();
  const router = useRouter();
  const setMode = useAppStore((state) => state.setMode);
  const clearChat = useAppStore((state) => state.clearChat);
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [readiness, setReadiness] = useState<SkillReadiness | null>(null);
  const [runs, setRuns] = useState<SkillRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([
      api.getSkill(slug),
      api.getSkillReadiness().catch(() => ({ skills: [] })),
      api.listSkillRuns().catch(() => ({ runs: [] })),
    ])
      .then(([skillResult, readinessResult, runsResult]) => {
        if (cancelled) return;
        setSkill(skillResult.skill);
        setReadiness(readinessResult.skills.find((item) => item.skill.slug === skillResult.skill.slug) ?? null);
        setRuns(runsResult.runs);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        const message = requestError instanceof ApiError && requestError.status === 404
          ? 'This skill is not published or no longer exists.'
          : 'Could not load this skill manifest.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const model = useMemo(() => skill ? buildSkillManifestModel(skill, readiness, runs) : null, [skill, readiness, runs]);

  function launchSkill() {
    if (!model) return;
    setMode(model.mode);
    clearChat();
    router.push(model.launchPath);
  }

  if (isLoading) {
    return (
      <main className="flex h-full flex-1 items-center justify-center bg-[radial-gradient(circle_at_top_right,#16233d,#0b0f19_45%)]">
        <div className="text-center text-slate-400">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-4 text-sm">Loading skill manifest…</p>
        </div>
      </main>
    );
  }

  if (error || !model || !skill) {
    return (
      <main className="flex h-full flex-1 items-center justify-center bg-ink px-6">
        <section className="max-w-md rounded-3xl border border-line bg-panel/70 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Skill manifest</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Skill unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{error ?? 'Could not load this skill.'}</p>
          <button type="button" onClick={() => router.push('/skills')} className="mt-5 rounded-2xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent">
            Back to Skills
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#16233d,#0b0f19_45%)]">
      <header className="border-b border-line bg-panel/50 px-6 py-5 backdrop-blur">
        <button type="button" onClick={() => router.push('/skills')} className="text-sm text-slate-400 hover:text-accent">← Back to Skills</button>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-accent">Skill Manifest v1</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink/60 text-2xl">{getSkillIconGlyph(skill.icon)}</span>
              <div>
                <h1 className="text-3xl font-semibold text-white">{model.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{model.category} · {formatSkillMode(model.mode)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{model.description}</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:min-w-64">
            <div className={`rounded-2xl border px-4 py-3 ${readinessToneClasses(model.readiness.tone)}`}>
              <p className="text-[10px] uppercase tracking-[0.16em] opacity-75">Readiness</p>
              <p className="mt-1 text-lg font-semibold">{model.readiness.label}</p>
              <p className="mt-1 text-xs leading-5 opacity-80">{model.readiness.message}</p>
            </div>
            <button type="button" onClick={launchSkill} className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white">
              Run skill
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <section className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-3xl border border-line bg-panel/70 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inputs</p>
                <div className="mt-4 space-y-3">
                  {model.inputs.map((input) => (
                    <div key={input.name} className="rounded-2xl border border-line bg-ink/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{input.label}</p>
                        <span className="rounded-full border border-slate-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">{input.type}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{input.required ? 'Required' : 'Optional'} · `{input.name}`</p>
                      {input.helpText ? <p className="mt-2 text-sm leading-6 text-slate-400">{input.helpText}</p> : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-line bg-panel/70 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Outputs</p>
                <div className="mt-4 space-y-2">
                  {model.outputs.map((output) => (
                    <div key={output} className="rounded-2xl border border-line bg-ink/50 px-4 py-3 text-sm text-slate-300">{output}</div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-3xl border border-line bg-panel/70 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Required capabilities</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <CapabilityList title="Required" items={model.requiredCapabilities} empty="No explicit required capabilities." />
                <CapabilityList title="Optional" items={model.optionalCapabilities} empty="No optional capabilities advertised." />
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-line bg-panel/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Latest run</p>
                <button type="button" onClick={() => router.push('/runs')} className="text-xs text-accent hover:text-white">Ledger</button>
              </div>
              {model.latestRun ? (
                <div className="mt-4 rounded-2xl border border-line bg-ink/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{model.latestRun.skillName}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(model.latestRun.startedAt)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusClasses(model.latestRun.status)}`}>{labelForStatus(model.latestRun.status)}</span>
                  </div>
                  <button type="button" onClick={() => router.push(`/runs?run=${model.latestRun?.id}`)} className="mt-4 rounded-full border border-line px-3 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent">
                    Inspect run
                  </button>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-slate-500">No runs yet for this skill. Run it once to start the audit trail.</p>
              )}
            </section>

            <section className="rounded-3xl border border-line bg-panel/70 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Product loop</p>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                <li><span className="text-white">1.</span> Fill the skill input in the composer.</li>
                <li><span className="text-white">2.</span> Follow execution in Runs.</li>
                <li><span className="text-white">3.</span> Save durable outputs to Library.</li>
              </ol>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function CapabilityList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink/50 p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item} className="rounded-xl border border-slate-700/70 px-3 py-2 text-sm text-slate-300">{item}</div>
        )) : <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}
