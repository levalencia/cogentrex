'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SkillReadiness } from '@cogentrex/shared';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { buildSkillCockpitModel } from '@/lib/skillCockpit';
import { buildWorkflowSelectionGroups, getLauncherToneClasses, getReadinessBadgeClasses, type LauncherItem } from '@/lib/workflowLauncher';
import { useAppStore } from '@/store/appStore';

function StartCard({ card, onLaunch }: { card: LauncherItem; onLaunch: (item: LauncherItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onLaunch(card)}
      className={`rounded-2xl border p-4 text-left transition ${getLauncherToneClasses(card.tone, false)} hover:-translate-y-0.5`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">{card.eyebrow}</span>
      <span className="mt-2 flex items-start justify-between gap-3 text-base font-semibold">
        {card.label}
        {card.readiness ? (
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${getReadinessBadgeClasses(card.readiness.status)}`}>
            {card.readiness.label}
          </span>
        ) : null}
      </span>
      <span className="mt-2 block text-sm leading-5 opacity-75">{card.description}</span>
      {card.readiness && card.readiness.status !== 'ready' ? <span className="mt-3 block text-xs leading-4 opacity-70">{card.readiness.message}</span> : null}
      <span className="mt-4 inline-flex rounded-full border border-current/20 px-3 py-1 text-xs font-medium opacity-90">{card.kind === 'mode' ? 'Open mode' : 'Use template'}</span>
    </button>
  );
}

export function SkillCockpitView() {
  const router = useRouter();
  const clearChat = useAppStore((state) => state.clearChat);
  const setMode = useAppStore((state) => state.setMode);
  const setSelectedWorkflowLauncher = useAppStore((state) => state.setSelectedWorkflowLauncher);
  const [readiness, setReadiness] = useState<SkillReadiness[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api.getSkillReadiness()
      .then((result) => {
        if (!cancelled) setReadiness(result.skills);
      })
      .catch(() => {
        if (!cancelled) setReadiness([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cockpit = useMemo(() => buildSkillCockpitModel(readiness, []), [readiness]);
  const workflowGroups = useMemo(() => buildWorkflowSelectionGroups(cockpit.cards), [cockpit.cards]);

  function openLauncher(item: LauncherItem) {
    setMode(item.mode);
    setSelectedWorkflowLauncher(item.id);
    clearChat();
    router.push('/chats');
  }

  function openChat() {
    setMode('CHAT');
    setSelectedWorkflowLauncher(undefined);
    clearChat();
    router.push('/chats');
  }

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#16233d,#0b0f19_45%)]">
      <header className="border-b border-line bg-panel/50 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-accent">Start</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Start with Chat or a template</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Chat is the default workspace. Templates are optional shortcuts that open a mode with a prefilled prompt and suggested Skill Assist settings.
            </p>
          </div>
          <button
            type="button"
            onClick={openChat}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sky-300"
          >
            Open Chat
          </button>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-3xl border border-accent/20 bg-accent/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent">Default path</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Most work should start in Chat</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Ask Cogentrex directly, then let Skill Assist, Runs, and Library support the work without forcing users through an internal dashboard first.
                </p>
              </div>
              <button
                type="button"
                onClick={openChat}
                className="rounded-2xl border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                Ask Cogentrex
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Modes</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Choose a workspace only when it helps</h2>
                <p className="mt-1 text-sm text-slate-500">Modes change the UI/runtime path: research, social writing, images, or video.</p>
              </div>
              {isLoading ? <span className="rounded-full border border-line px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">Checking live config</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workflowGroups.modes.filter((card) => card.id !== 'ask-chat').map((card) => (
                <StartCard key={card.id} card={card} onLaunch={openLauncher} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Templates</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Reusable shortcuts</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Templates do not create a new product surface. They open Chat or a mode with useful defaults.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {workflowGroups.taskTemplates.map((card) => (
                <StartCard key={card.id} card={card} onLaunch={openLauncher} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Skill Assist</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Skill Assist stays inside the composer: Auto lets Cogentrex choose relevant skills, Hybrid combines your picks with suggestions, Manual uses only selected skills, and Off keeps the run plain.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
