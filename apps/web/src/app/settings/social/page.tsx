'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ConfigItem {
  platform: string;
  label: string;
  systemPrompt: string;
  isEnabled: boolean;
}

const DEFAULT_PROMPTS: Record<string, string> = {
  linkedin: `You are an expert LinkedIn content strategist. Write posts that:
- Start with a strong hook in the first line
- Use short paragraphs (1-3 sentences each) for readability
- Include a reflective question or call-to-action at the end
- Maintain a professional yet approachable tone
- Avoid hashtags unless specifically relevant
- Keep total length between 150-300 words`,
  x: `You are an expert X (Twitter) content creator. Write posts that:
- Are punchy, opinionated, and memorable
- Stay under 280 characters (or create a thread if needed)
- Use 1-2 relevant hashtags naturally
- Include a clear hook or controversial take
- Feel conversational and authentic`,
  medium: `You are an expert Medium writer. Draft articles that:
- Start with a compelling headline idea and subtitle
- Use clear section headers (H2/H3)
- Include practical examples and actionable takeaways
- Write 800-1,500 words in a thoughtful, authoritative tone
- End with a strong conclusion and call-to-action`,
  reddit: `You are a savvy Reddit contributor. Write posts that:
- Feel casual and conversational
- Ask thought-provoking questions to spark discussion
- Are short (2-4 sentences) and to the point
- Avoid marketing language or sales pitches
- Match the authentic community tone`,
  substack: `You are a warm, engaging Substack writer. Draft newsletter notes that:
- Feel personal and conversational, like writing to a friend
- Share insights with a clear lesson or takeaway
- Use 2-4 short paragraphs
- Include a friendly sign-off or question to readers`,
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  medium: 'Medium',
  reddit: 'Reddit',
  substack: 'Substack',
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  x: 'bg-slate-500/10 border-slate-500/20 text-slate-300',
  medium: 'bg-green-500/10 border-green-500/20 text-green-300',
  reddit: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
  substack: 'bg-red-500/10 border-red-500/20 text-red-300',
};

interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  imageArtifactId: string | null;
  postAt: string;
  status: string;
  errorMessage: string | null;
  postedAt: string | null;
  createdAt: string;
}

export default function SocialSettingsPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string>();
  const [linkedinStatus, setLinkedinStatus] = useState<{ connected: boolean; personUrn?: string | undefined; needsPersonUrn?: boolean | undefined } | null>(null);
  const [personUrnInput, setPersonUrnInput] = useState('');
  const [allPosts, setAllPosts] = useState<ScheduledPost[]>([]);
  const [activePlatform, setActivePlatform] = useState<string>('linkedin');
  const [activeTab, setActiveTab] = useState<'scheduled' | 'posted' | 'failed'>('scheduled');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPostAt, setEditPostAt] = useState('');

  useEffect(() => {
    void api.getSocialConfig()
      .then(({ configs: data }) => {
        setConfigs(data);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : 'Could not load social settings');
      })
      .finally(() => setLoading(false));
    void loadLinkedInStatus();
    void loadScheduledPosts();

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'linkedin:connected') {
        void loadLinkedInStatus();
        setMessage('LinkedIn connected successfully!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function loadLinkedInStatus() {
    try {
      const status = await api.linkedinStatus();
      setLinkedinStatus(status);
    } catch {
      setLinkedinStatus(null);
    }
  }

  async function loadScheduledPosts() {
    try {
      const { posts } = await api.listScheduledPosts();
      setAllPosts(posts);
    } catch {
      setAllPosts([]);
    }
  }

  async function disconnectLinkedIn() {
    try {
      await api.linkedinDisconnect();
      await loadLinkedInStatus();
      setMessage('LinkedIn disconnected.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Disconnect failed');
    }
  }

  async function savePersonUrn() {
    const value = personUrnInput.trim();
    if (!value) return;
    try {
      await api.linkedinSetPersonUrn(value);
      setPersonUrnInput('');
      await loadLinkedInStatus();
      setMessage('LinkedIn Person URN saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save Person URN');
    }
  }

  async function cancelScheduledPost(id: string) {
    try {
      await api.cancelScheduledPost(id);
      await loadScheduledPosts();
      setMessage('Scheduled post cancelled.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cancel failed');
    }
  }

  async function updateScheduledPost(id: string) {
    try {
      await api.updateScheduledPost(id, { content: editContent, postAt: editPostAt });
      setEditingPostId(null);
      await loadScheduledPosts();
      setMessage('Scheduled post updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const updatePrompt = (platform: string, value: string) => {
    setConfigs((prev) => prev.map((c) => (c.platform === platform ? { ...c, systemPrompt: value } : c)));
  };

  const toggleEnabled = (platform: string) => {
    setConfigs((prev) => prev.map((c) => (c.platform === platform ? { ...c, isEnabled: !c.isEnabled } : c)));
  };

  const savePlatform = async (platform: string) => {
    const config = configs.find((c) => c.platform === platform);
    if (!config) return;
    setSaving(platform);
    setMessage(undefined);
    try {
      await api.updateSocialConfig(platform, { systemPrompt: config.systemPrompt, isEnabled: config.isEnabled });
      setMessage(`${config.label} settings saved.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const resetToDefault = (platform: string) => {
    const defaultPrompt = DEFAULT_PROMPTS[platform];
    if (!defaultPrompt) return;
    setConfigs((prev) => prev.map((c) => (c.platform === platform ? { ...c, systemPrompt: defaultPrompt } : c)));
  };

  const platformLabel = PLATFORM_LABELS[activePlatform] ?? activePlatform;
  const platformColor = PLATFORM_COLORS[activePlatform] ?? '';
  const platformPosts = allPosts.filter((p) => p.platform === activePlatform);
  const scheduledPosts = platformPosts.filter((p) => p.status === 'pending');
  const postedPosts = platformPosts.filter((p) => p.status === 'posted');
  const failedPosts = platformPosts.filter((p) => p.status === 'failed');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Social Prompts</h1>
        <a href="/" className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-accent">← Back to Chat</a>
      </div>
      {message ? <p className="mb-4 rounded-xl bg-accent/10 px-4 py-2 text-sm text-accent">{message}</p> : null}

      {/* LinkedIn Connection */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">LinkedIn Connection</h2>
            <p className="text-sm text-slate-400">
              {linkedinStatus?.connected
                ? `Connected ✅` + (linkedinStatus.personUrn ? ' (Profile linked)' : '')
                : 'Not connected. Connect your LinkedIn to post and schedule directly.'}
            </p>
          </div>
          {linkedinStatus?.connected ? (
            <button
              onClick={() => void disconnectLinkedIn()}
              className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => {
                const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
                const popup = window.open(`${apiBase}/api/linkedin/connect`, 'linkedin_auth', 'width=600,height=700');
                if (!popup) {
                  setMessage('Popup blocked. Please allow popups for this site.');
                }
              }}
              className="rounded-xl bg-blue-500/20 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/30"
            >
              Connect LinkedIn
            </button>
          )}
        </div>
        {linkedinStatus?.connected && linkedinStatus.needsPersonUrn && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            <p className="mb-2 font-semibold">LinkedIn token saved, but profile ID is missing.</p>
            <p className="mb-3 text-yellow-100/80">
              Your app currently only has <code>w_member_social</code>. To post, LinkedIn also requires the author URN.
              Add the <strong>Sign In with LinkedIn using OpenID Connect</strong> product in the Developer Portal, or paste your Person URN/member ID below.
            </p>
            <div className="flex gap-2">
              <input
                value={personUrnInput}
                onChange={(e) => setPersonUrnInput(e.target.value)}
                placeholder="urn:li:person:xxxx or just xxxx"
                className="flex-1 rounded-xl border border-yellow-500/30 bg-ink px-3 py-2 text-sm text-white outline-none"
              />
              <button
                onClick={() => void savePersonUrn()}
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Social Platform Dashboards */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Social Dashboards</h2>

        {/* Platform Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.keys(PLATFORM_LABELS).map((key) => (
            <button
              key={key}
              onClick={() => { setActivePlatform(key); setActiveTab('scheduled'); setEditingPostId(null); }}
              className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                activePlatform === key
                  ? `border-accent bg-accent/20 text-accent`
                  : 'border-line text-slate-400 hover:border-slate-500'
              }`}
            >
              {PLATFORM_LABELS[key]}
            </button>
          ))}
        </div>

        {/* LinkedIn Dashboard */}
        {activePlatform === 'linkedin' && (
          <>
            {/* Status Tabs */}
            <div className="mb-4 flex gap-2 border-b border-line pb-2">
              {[
                { key: 'scheduled', label: `Scheduled (${scheduledPosts.length})` },
                { key: 'posted', label: `Posted (${postedPosts.length})` },
                ...(failedPosts.length ? [{ key: 'failed', label: `Failed (${failedPosts.length})` }] : []),
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key as 'scheduled' | 'posted'); setEditingPostId(null); }}
                  className={`px-3 py-2 text-sm transition-colors ${
                    activeTab === tab.key
                      ? 'border-b-2 border-accent text-accent'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scheduled Posts */}
            {activeTab === 'scheduled' && (
              <>
                {scheduledPosts.length === 0 ? (
                  <div className="rounded-xl bg-ink/50 py-8 text-center text-sm text-slate-500">
                    No scheduled posts. Generate posts from the chat and schedule them!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scheduledPosts.map((post) => (
                      <div key={post.id} className={`rounded-xl border p-4 ${platformColor}`}>
                        {editingPostId === post.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={4}
                              className="w-full resize-none rounded-xl border border-line bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="datetime-local"
                                value={editPostAt}
                                onChange={(e) => setEditPostAt(e.target.value)}
                                className="rounded-xl border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-accent"
                              />
                              <button
                                onClick={() => void updateScheduledPost(post.id)}
                                className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-ink hover:bg-accent/90"
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={() => setEditingPostId(null)}
                                className="rounded-xl border border-line px-3 py-2 text-xs text-slate-400 hover:border-slate-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wider">Scheduled for {new Date(post.postAt).toLocaleString()}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setEditingPostId(post.id); setEditContent(post.content); setEditPostAt(new Date(post.postAt).toISOString().slice(0, 16)); }}
                                  className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => void cancelScheduledPost(post.id)}
                                  className="rounded-lg border border-line px-2 py-1 text-[11px] text-slate-400 hover:border-red-500/30 hover:text-red-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-slate-200">{post.content}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Posted Posts */}
            {activeTab === 'posted' && (
              <>
                {postedPosts.length === 0 ? (
                  <div className="rounded-xl bg-ink/50 py-8 text-center text-sm text-slate-500">
                    No posted content yet. Posts will appear here after they are published.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postedPosts.map((post) => (
                      <div key={post.id} className={`rounded-xl border p-4 ${platformColor}`}>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Posted {post.postedAt ? new Date(post.postedAt).toLocaleString() : '—'}
                          </span>
                          <span className="rounded bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400">✓ Posted</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-200">{post.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Failed Posts */}
            {activeTab === 'failed' && (
              <div className="space-y-3">
                {failedPosts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-red-400">Failed</span>
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">Error</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-200">{post.content}</p>
                    {post.errorMessage ? (
                      <p className="mt-2 text-xs text-red-400">{post.errorMessage}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Placeholder dashboards for other platforms */}
        {activePlatform !== 'linkedin' && (
          <div className="flex flex-col items-center justify-center rounded-xl bg-ink/50 py-12 text-center">
            <div className="mb-4 text-4xl">🚧</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-300">{platformLabel} Dashboard</h3>
            <p className="max-w-md text-sm text-slate-500">
              {platformLabel} integration is coming soon. We're working on OAuth authentication, post scheduling, and analytics for this platform.
            </p>
          </div>
        )}
      </div>

      {/* Social Prompts Configuration */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">Social Prompts</h2>
          <p className="text-sm text-slate-400">
            Customize the system prompts for each social platform. These prompts guide how the AI writes posts.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : (
          <div className="space-y-6">
            {configs.map((config) => (
              <div key={config.platform} className="rounded-2xl border border-line bg-ink p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-white">{config.label}</h3>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={config.isEnabled}
                        onChange={() => toggleEnabled(config.platform)}
                        className="rounded border-line bg-panel text-accent"
                      />
                      Enabled
                    </label>
                  </div>
                  <button onClick={() => resetToDefault(config.platform)} className="text-xs text-slate-500 hover:text-slate-300">
                    Reset to Default
                  </button>
                </div>
                <textarea
                  value={config.systemPrompt}
                  onChange={(e) => updatePrompt(config.platform, e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-xl border border-line bg-panel px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => savePlatform(config.platform)}
                    disabled={saving === config.platform}
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {saving === config.platform ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
