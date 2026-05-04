'use client';

import { useEffect, useState } from 'react';
import type { ProviderConfigView } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';

interface FormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  kind: ProviderConfigView['kind'];
}

function emptyForm(): FormState {
  return { name: 'Microsoft Foundry Kimi', baseUrl: '', apiKey: '', model: 'Kimi 2.6', kind: 'AZURE_FOUNDRY' };
}

export function SettingsPanel() {
  const providers = useAppStore((state) => state.providers);
  const activeProviderId = useAppStore((state) => state.activeProviderId);
  const setActiveProvider = useAppStore((state) => state.setActiveProvider);
  const createProvider = useAppStore((state) => state.createProvider);
  const [isOpen, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api.defaultProviderTemplate().then(({ provider }) =>
      setForm((current) => ({ ...current, ...provider }))
    );
  }, []);

  function startEdit(provider: ProviderConfigView) {
    setForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: '',
      model: provider.model,
      kind: provider.kind,
    });
    setEditingId(provider.id);
    setOpen(true);
    setError(undefined);
  }

  function startCreate() {
    setForm(emptyForm());
    void api.defaultProviderTemplate().then(({ provider }) =>
      setForm((current) => ({ ...current, ...provider }))
    );
    setEditingId(null);
    setOpen(true);
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      if (editingId) {
        await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/api/providers/${editingId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(form.name ? { name: form.name } : {}),
            ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
            ...(form.model ? { model: form.model } : {}),
            kind: form.kind,
          }),
        });
        window.location.reload();
      } else {
        await createProvider({ ...form, isDefault: providers.length === 0 });
        setForm((current) => ({ ...current, apiKey: '' }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save provider');
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this provider?')) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/api/providers/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    window.location.reload();
  }

  return (
    <div className="border-b border-line bg-panel/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={activeProviderId ?? ''} onChange={(event) => setActiveProvider(event.target.value)} className="rounded-xl border border-line bg-ink px-3 py-2 text-sm text-slate-100">
          <option value="" disabled>No provider configured</option>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}
        </select>
        <button onClick={() => setOpen((value) => !value)} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-200 hover:border-accent">
          {isOpen ? 'Close settings' : 'Provider settings'}
        </button>
      </div>
      {isOpen ? (
        <div className="mt-4">
          <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-ink/70 p-4 md:grid-cols-2">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Provider name" className="rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent" />
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ProviderConfigView['kind'] })} className="rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent">
              <option value="AZURE_FOUNDRY">Azure / Microsoft Foundry</option>
              <option value="OPENAI_COMPATIBLE">OpenAI compatible</option>
              <option value="ANTHROPIC">Anthropic</option>
              <option value="GOOGLE">Google</option>
            </select>
            <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="Endpoint / base URL" className="rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent md:col-span-2" />
            <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="Model or deployment name" className="rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent" />
            <input value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={editingId ? 'API key (leave empty to keep current)' : 'API key'} type="password" className="rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent" />
            {error ? <p className="text-sm text-red-200 md:col-span-2">{error}</p> : null}
            <button className="rounded-xl bg-accent px-4 py-2 font-semibold text-ink md:col-span-2">
              {editingId ? 'Update provider' : 'Save encrypted provider'}
            </button>
          </form>
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Configured providers</p>
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-xl border border-line bg-ink/50 px-3 py-2">
                <div className="text-sm text-slate-200">
                  {provider.name} · <span className="text-slate-400">{provider.model}</span>
                  {provider.isDefault ? <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">Default</span> : null}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(provider)} className="rounded-lg border border-line px-2 py-1 text-xs text-slate-300 hover:border-accent">Edit</button>
                  <button onClick={() => void deleteProvider(provider.id)} className="rounded-lg border border-line px-2 py-1 text-xs text-red-300 hover:border-red-400">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
