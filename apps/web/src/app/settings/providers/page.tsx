'use client';

import { useEffect, useState } from 'react';
import type { ProviderConfigView } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { CapabilityReadinessPanel } from '@/components/CapabilityReadinessPanel';

interface FormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  kind: ProviderConfigView['kind'];
  defaultForMode: 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | '';
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsSearch: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
}

function emptyForm(): FormState {
  return { name: 'Microsoft Foundry Kimi', baseUrl: '', apiKey: '', model: 'Kimi 2.6', kind: 'AZURE_FOUNDRY', defaultForMode: '', supportsStreaming: true, supportsVision: false, supportsTools: false, supportsSearch: false, supportsImage: false, supportsVideo: false };
}

export default function ProvidersPage() {
  const providers = useAppStore((state) => state.providers);
  const user = useAppStore((state) => state.user);
  const createProvider = useAppStore((state) => state.createProvider);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof api.getCatalog>>['catalog']>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    void bootstrap();
    void api.defaultProviderTemplate().then(({ provider }) =>
      setForm((current) => ({ ...current, name: provider.name, baseUrl: provider.baseUrl, model: provider.model, kind: provider.kind }))
    );
    void api.getCatalog().then(({ catalog: data }) => {
      setCatalog(data);
      setCatalogLoading(false);
    });
  }, [bootstrap]);

  function startEdit(provider: ProviderConfigView) {
    setForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: '',
      model: provider.model,
      kind: provider.kind,
      defaultForMode: provider.defaultForMode ?? '',
      supportsStreaming: provider.supportsStreaming,
      supportsVision: provider.supportsVision,
      supportsTools: provider.supportsTools,
      supportsSearch: provider.supportsSearch,
      supportsImage: provider.supportsImage,
      supportsVideo: provider.supportsVideo,
    });
    setEditingId(provider.id);
    setError(undefined);
    setSuccess(undefined);
  }

  function startCreate() {
    setForm(emptyForm());
    void api.defaultProviderTemplate().then(({ provider }) =>
      setForm((current) => ({ ...current, name: provider.name, baseUrl: provider.baseUrl, model: provider.model, kind: provider.kind }))
    );
    setEditingId(null);
    setError(undefined);
    setSuccess(undefined);
  }

  async function setupFromCatalog(item: typeof catalog[number]) {
    setForm({
      name: item.name,
      baseUrl: item.baseUrl ?? '',
      apiKey: '',
      model: item.models[0] ?? '',
      kind: item.kind,
      defaultForMode: '',
      supportsStreaming: item.features.chat,
      supportsVision: item.features.vision,
      supportsTools: item.features.tools,
      supportsSearch: false,
      supportsImage: item.features.image,
      supportsVideo: item.features.video,
    });
    setEditingId(null);
    setError(undefined);
    setSuccess(undefined);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSuccess(undefined);
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          ...(form.name ? { name: form.name } : {}),
          ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          ...(form.model ? { model: form.model } : {}),
          kind: form.kind,
          supportsStreaming: form.supportsStreaming,
          supportsVision: form.supportsVision,
          supportsTools: form.supportsTools,
          supportsSearch: form.supportsSearch,
          supportsImage: form.supportsImage,
          supportsVideo: form.supportsVideo,
        };
        if (form.defaultForMode) payload.defaultForMode = form.defaultForMode;
        else payload.defaultForMode = null;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/api/providers/${editingId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Update failed');
        setSuccess('Provider updated successfully');
        await bootstrap();
      } else {
        const payload = {
          ...form,
          isDefault: providers.length === 0,
        };
        if (!form.defaultForMode) {
          (payload as Record<string, unknown>).defaultForMode = null;
        }
        await createProvider(payload as Parameters<typeof createProvider>[0]);
        setSuccess('Provider created successfully');
        setForm((current) => ({ ...current, apiKey: '' }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save provider');
    }
  }

  async function setDefault(id: string) {
    try {
      await api.setDefaultProvider(id);
      setSuccess('Default provider updated');
      await bootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set default');
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/api/providers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      setSuccess('Provider deleted');
      await bootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function testProvider(id: string) {
    setTestingId(id);
    setError(undefined);
    try {
      const result = await api.testProvider(id);
      if (result.ok) {
        setSuccess('Connection test passed');
      } else {
        setError(`Connection test failed: ${result.error ?? 'Unknown error'}`);
      }
      await bootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Provider Settings</h1>
            <p className="mt-2 text-slate-400">Manage your AI model providers and endpoints</p>
          </div>
          <div className="flex items-center gap-3">
            {user?.role === 'ADMIN' ? (
              <a href="/settings/admin/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-accent hover:border-accent">
                Admin Panel
              </a>
            ) : null}
            <a href="/" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Back to Chat
            </a>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {success ? <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</p> : null}

        <CapabilityReadinessPanel />

        {/* Provider Catalog */}
        <div className="mb-6 rounded-3xl border border-line bg-panel/70 p-6">
          <h2 className="text-xl font-semibold">Provider Catalog</h2>
          <p className="mt-1 text-sm text-slate-400">One-click setup from popular providers</p>
          {catalogLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading catalog...</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.map((item) => (
                <div key={item.id} className="rounded-2xl border border-line bg-ink/50 p-4 transition hover:border-accent/50">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{item.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.features.chat ? <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">Chat</span> : null}
                    {item.features.vision ? <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">Vision</span> : null}
                    {item.features.image ? <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] text-pink-300">Image</span> : null}
                    {item.features.video ? <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-300">Video</span> : null}
                  </div>
                  <button
                    onClick={() => setupFromCatalog(item)}
                    className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-xs text-accent hover:border-accent"
                  >
                    Quick Setup
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        <div className="rounded-3xl border border-line bg-panel/70 p-6">
          <h2 className="text-xl font-semibold">{editingId ? 'Edit Provider' : 'Add New Provider'}</h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-slate-400">Provider Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Microsoft Foundry Kimi" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Provider Type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderConfigView['kind'] })} className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent">
                <option value="AZURE_FOUNDRY">Azure / Microsoft Foundry</option>
                <option value="OPENAI_COMPATIBLE">OpenAI Compatible</option>
                <option value="ANTHROPIC">Anthropic</option>
                <option value="GOOGLE">Google</option>
                <option value="IMAGE_GENERATION">Image Generation</option>
                <option value="VIDEO_GENERATION">Video Generation</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Model / Deployment Name</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g., gpt-5.5" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-slate-400">Endpoint URL</label>
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://opencodelv-resource.services.ai.azure.com/openai/v1" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-slate-400">API Key</label>
              <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editingId ? 'Leave empty to keep current key' : 'Your API key'} type="password" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Default For Mode</label>
              <select value={form.defaultForMode} onChange={(e) => setForm({ ...form, defaultForMode: e.target.value as 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | '' })} className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent">
                <option value="">None (use global default)</option>
                <option value="CHAT">Chat</option>
                <option value="DEEP_RESEARCH">Deep Research</option>
                <option value="SOCIAL_WRITING">Social Writing</option>
                <option value="IMAGE_GENERATION">Image Generation</option>
                <option value="VIDEO_GENERATION">Video Generation</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-400">Capabilities</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'supportsStreaming', label: 'Streaming' },
                  { key: 'supportsVision', label: 'Vision' },
                  { key: 'supportsTools', label: 'Tools' },
                  { key: 'supportsSearch', label: 'Search' },
                  { key: 'supportsImage', label: 'Image Gen' },
                  { key: 'supportsVideo', label: 'Video Gen' },
                ].map((cap) => (
                  <label key={cap.key} className="flex items-center gap-2 rounded-xl border border-line bg-ink/50 px-3 py-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[cap.key as keyof FormState] as boolean}
                      onChange={(e) => setForm({ ...form, [cap.key]: e.target.checked })}
                      className="h-4 w-4 accent-accent"
                    />
                    {cap.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 md:col-span-2">
              <button type="submit" className="rounded-xl bg-accent px-6 py-3 font-semibold text-ink">
                {editingId ? 'Update Provider' : 'Add Provider'}
              </button>
              {editingId ? (
                <button type="button" onClick={startCreate} className="rounded-xl border border-line px-6 py-3 text-slate-300 hover:border-accent">
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Configured Providers List */}
        <div className="mt-6 rounded-3xl border border-line bg-panel/70 p-6">
          <h2 className="text-xl font-semibold">Configured Providers ({providers.length})</h2>
          <div className="mt-4 space-y-3">
            {providers.length === 0 ? (
              <p className="py-8 text-center text-slate-500">No providers configured yet. Add one above to get started.</p>
            ) : (
              providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between rounded-2xl border border-line bg-ink/50 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{provider.name}</span>
                      {provider.isGlobal ? <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">🌐 Shared</span> : null}
                      {provider.isDefault ? <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">Default</span> : null}
                      {provider.defaultForMode ? <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">{provider.defaultForMode}</span> : null}
                      {provider.supportsVision ? <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">Vision</span> : null}
                      {provider.supportsTools ? <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">Tools</span> : null}
                      {provider.supportsSearch ? <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-300">Search</span> : null}
                      {provider.supportsImage ? <span className="rounded bg-pink-500/20 px-2 py-0.5 text-xs text-pink-300">Image</span> : null}
                      {provider.supportsVideo ? <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300">Video</span> : null}
                      {provider.testStatus === 'ok' ? <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-300">Tested</span> : provider.testStatus === 'fail' ? <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Failed</span> : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      Model: {provider.model} · {provider.kind}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{provider.baseUrl}</div>
                    {provider.testedAt ? <div className="mt-0.5 text-xs text-slate-600">Last tested: {new Date(provider.testedAt).toLocaleString()}</div> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 ml-4">
                    {!provider.isDefault && !provider.isGlobal ? (
                      <button onClick={() => void setDefault(provider.id)} className="rounded-xl border border-line px-3 py-2 text-xs text-accent hover:border-accent">
                        Set Default
                      </button>
                    ) : null}
                    {!provider.isGlobal ? (
                      <button
                        onClick={() => void testProvider(provider.id)}
                        disabled={testingId === provider.id}
                        className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:border-accent disabled:opacity-50"
                      >
                        {testingId === provider.id ? 'Testing...' : 'Test'}
                      </button>
                    ) : null}
                    {!provider.isGlobal ? (
                      <button onClick={() => startEdit(provider)} className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:border-accent">
                        Edit
                      </button>
                    ) : null}
                    {!provider.isGlobal ? (
                      <button onClick={() => void deleteProvider(provider.id)} className="rounded-xl border border-line px-3 py-2 text-xs text-red-300 hover:border-red-400">
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
