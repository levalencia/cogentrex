'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import type { AppMode, ProviderConfigView } from '@cogentrex/shared';

function providerKeyForMode(mode: AppMode): string {
  return `cogentrex:last-provider:${mode}`;
}

function getLastProviderId(mode: AppMode): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(providerKeyForMode(mode));
}

function setLastProviderId(mode: AppMode, providerId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(providerKeyForMode(mode), providerId);
}

function isProviderValidForMode(provider: ProviderConfigView, mode: AppMode): boolean {
  if (mode === 'IMAGE_GENERATION') {
    return provider.kind === 'IMAGE_GENERATION' || provider.supportsImage;
  }
  if (mode === 'VIDEO_GENERATION') {
    return provider.kind === 'VIDEO_GENERATION' || provider.supportsVideo;
  }
  if (mode === 'SOCIAL_WRITING') {
    // Social writing needs text providers only
    const textKinds: ProviderConfigView['kind'][] = ['AZURE_FOUNDRY', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE'];
    return textKinds.includes(provider.kind);
  }
  // CHAT or DEEP_RESEARCH: any text provider
  const textKinds: ProviderConfigView['kind'][] = ['AZURE_FOUNDRY', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE'];
  return textKinds.includes(provider.kind) || provider.supportsStreaming;
}

function pickDefaultProvider(providers: ProviderConfigView[], mode: AppMode, currentId?: string): string | undefined {
  // First try to keep the current if it's valid
  if (currentId) {
    const current = providers.find((p) => p.id === currentId);
    if (current && isProviderValidForMode(current, mode)) return currentId;
  }
  // Try last used for this mode
  const lastId = getLastProviderId(mode);
  if (lastId) {
    const last = providers.find((p) => p.id === lastId);
    if (last && isProviderValidForMode(last, mode)) return lastId;
  }
  // Try per-mode default
  const modeDefault = providers.find((p) => p.defaultForMode === mode);
  if (modeDefault && isProviderValidForMode(modeDefault, mode)) return modeDefault.id;
  // Try global default
  const globalDefault = providers.find((p) => p.isDefault);
  if (globalDefault && isProviderValidForMode(globalDefault, mode)) return globalDefault.id;
  // Fallback to first valid provider
  const firstValid = providers.find((p) => isProviderValidForMode(p, mode));
  return firstValid?.id;
}

export function ProviderPicker() {
  const mode = useAppStore((state) => state.mode);
  const providers = useAppStore((state) => state.providers);
  const activeProviderId = useAppStore((state) => state.activeProviderId);
  const setActiveProvider = useAppStore((state) => state.setActiveProvider);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Auto-switch provider when mode changes
  useEffect(() => {
    if (providers.length === 0) return;
    const bestId = pickDefaultProvider(providers, mode, activeProviderId);
    if (bestId && bestId !== activeProviderId) {
      setActiveProvider(bestId);
    }
  }, [mode, providers.length]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const validProviders = providers.filter((p) => isProviderValidForMode(p, mode));
  const activeProvider = providers.find((p) => p.id === activeProviderId);

  const handleSelect = useCallback((provider: ProviderConfigView) => {
    setActiveProvider(provider.id);
    setLastProviderId(mode, provider.id);
    setOpen(false);
  }, [mode, setActiveProvider]);

  if (providers.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line bg-ink/50 px-3 py-2 text-sm transition hover:border-accent"
        title={activeProvider ? `${activeProvider.name} — ${activeProvider.baseUrl}` : 'Select provider'}
      >
        <span className="truncate max-w-[140px] text-slate-200">
          {activeProvider ? activeProvider.name : 'Select provider'}
        </span>
        <span className="text-[10px] text-slate-500">
          {activeProvider ? activeProvider.model.slice(0, 12) : ''}
        </span>
        <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-2xl border border-line bg-panel shadow-2xl shadow-black/50">
          <div className="p-2">
            <div className="px-3 py-1.5 text-xs font-medium text-slate-500">
              Available for {mode.replace(/_/g, ' ').toLowerCase()}
            </div>
            {validProviders.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-500">
                No providers support this mode
                <br />
                <a href="/settings/providers" className="mt-1 inline-block text-xs text-accent hover:underline">
                  Add one in settings
                </a>
              </div>
            ) : (
              <div className="space-y-0.5">
                {validProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleSelect(provider)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                      provider.id === activeProviderId
                        ? 'bg-accent/15 border border-accent/20'
                        : 'hover:bg-white/5'
                    }`}
                    title={provider.baseUrl}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">
                          {provider.name}
                        </span>
                        {provider.isGlobal ? <span className="shrink-0 text-[10px] text-cyan-400">🌐</span> : null}
                        {provider.isDefault ? <span className="shrink-0 rounded bg-accent/20 px-1 py-0 text-[10px] text-accent">Default</span> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="truncate">{provider.model}</span>
                        <span className="text-slate-600">·</span>
                        <span>{provider.kind}</span>
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 flex-wrap gap-1">
                      {provider.supportsImage ? <span className="rounded bg-pink-500/10 px-1 text-[9px] text-pink-300">Img</span> : null}
                      {provider.supportsVideo ? <span className="rounded bg-orange-500/10 px-1 text-[9px] text-orange-300">Vid</span> : null}
                      {provider.supportsVision ? <span className="rounded bg-purple-500/10 px-1 text-[9px] text-purple-300">Vis</span> : null}
                      {provider.supportsTools ? <span className="rounded bg-yellow-500/10 px-1 text-[9px] text-yellow-300">Tool</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
