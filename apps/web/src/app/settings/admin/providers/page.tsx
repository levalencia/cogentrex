'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProviderConfigView } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { getProtectedRouteState } from '@/lib/protectedRoute';
import { useAppStore } from '@/store/appStore';

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
  return { name: '', baseUrl: '', apiKey: '', model: '', kind: 'OPENAI_COMPATIBLE', defaultForMode: '', supportsStreaming: true, supportsVision: false, supportsTools: false, supportsSearch: false, supportsImage: false, supportsVideo: false };
}

export default function AdminProvidersPage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const routeState = getProtectedRouteState(user, { requireAdmin: true });
  const redirectHref = routeState.status === 'redirect' ? routeState.href : undefined;

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (redirectHref) router.replace(redirectHref);
  }, [router, redirectHref]);

  useEffect(() => {
    if (routeState.status === 'authorized') loadProviders();
  }, [routeState.status]);

  async function loadProviders() {
    setLoading(true);
    try {
      const { providers: data } = await api.listAdminProviders();
      setProviders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }

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
    setEditingId(null);
    setError(undefined);
    setSuccess(undefined);
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
        await api.updateAdminProvider(editingId, payload);
        setSuccess('Global provider updated successfully');
        await loadProviders();
      } else {
        const payload = { ...form };
        if (!form.defaultForMode) {
          (payload as Record<string, unknown>).defaultForMode = null;
        }
        await api.createAdminProvider(payload as Parameters<typeof api.createAdminProvider>[0]);
        setSuccess('Global provider created successfully');
        setForm((current) => ({ ...current, apiKey: '' }));
        await loadProviders();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save provider');
    }
  }

  async function deleteGlobalProvider(id: string) {
    if (!confirm('Are you sure you want to delete this global provider?')) return;
    try {
      await api.deleteAdminProvider(id);
      setSuccess('Global provider deleted');
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (routeState.status === 'loading' || routeState.status === 'redirect') {
    return (
      <main className="flex h-screen items-center justify-center bg-ink text-slate-100">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-4 text-sm text-slate-400">Checking access…</p>
        </div>
      </main>
    );
  }

  if (routeState.status === 'forbidden') {
    return (
      <main className="min-h-screen bg-ink text-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-3xl border border-line bg-panel/70 p-8 text-center">
            <h1 className="text-2xl font-semibold">Access Denied</h1>
            <p className="mt-2 text-slate-400">You need admin privileges to view this page.</p>
            <a href="/settings/providers" className="mt-4 inline-block rounded-xl border border-line px-4 py-2 text-sm hover:border-accent">
              Back to Provider Settings
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Admin — Global Providers</h1>
            <p className="mt-2 text-slate-400">Manage shared providers available to all users</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/settings/admin/skills" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-accent hover:border-accent">
              Skills registry
            </a>
            <a href="/settings/admin/analytics" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-accent hover:border-accent">
              Workflow analytics
            </a>
            <a href="/settings/providers" className="rounded-xl border border-line bg-panel px-4 py-2 text-sm hover:border-accent">
              Back to Providers
            </a>
          </div>
        </div>

        {error ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {success ? <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</p> : null}

        <div className="rounded-3xl border border-line bg-panel/70 p-6">
          <h2 className="text-xl font-semibold">{editingId ? 'Edit Global Provider' : 'Add Global Provider'}</h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-slate-400">Provider Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., OpenAI Shared" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
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
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g., gpt-4o" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-slate-400">Endpoint URL</label>
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-accent" />
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
                {editingId ? 'Update Global Provider' : 'Add Global Provider'}
              </button>
              {editingId ? (
                <button type="button" onClick={startCreate} className="rounded-xl border border-line px-6 py-3 text-slate-300 hover:border-accent">
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="mt-6 rounded-3xl border border-line bg-panel/70 p-6">
          <h2 className="text-xl font-semibold">Global Providers ({providers.length})</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          ) : providers.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No global providers configured yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between rounded-2xl border border-line bg-ink/50 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{provider.name}</span>
                      <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">🌐 Shared</span>
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
                  </div>
                  <div className="flex flex-wrap gap-2 ml-4">
                    <button onClick={() => startEdit(provider)} className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:border-accent">
                      Edit
                    </button>
                    <button onClick={() => void deleteGlobalProvider(provider.id)} className="rounded-xl border border-line px-3 py-2 text-xs text-red-300 hover:border-red-400">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
