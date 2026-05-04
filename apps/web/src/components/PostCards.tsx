'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GeneratedPost, ProviderConfigView } from '@cogentrex/shared';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { ImageLightbox } from '@/components/ImageLightbox';

interface PostCardsProps {
  posts: GeneratedPost[];
  conversationId?: string;
}

interface PostState {
  imageUrl: string | null;
  imageArtifactId: string | null;
  isGenerating: boolean;
  isPosting: boolean;
  postError: string | null;
  isEditing: boolean;
  editedContent: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  'LinkedIn': 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  'X (Twitter)': 'bg-slate-500/10 border-slate-500/20 text-slate-300',
  'Medium': 'bg-green-500/10 border-green-500/20 text-green-300',
  'Reddit': 'bg-orange-500/10 border-orange-500/20 text-orange-300',
  'Substack': 'bg-red-500/10 border-red-500/20 text-red-300',
};

const IMAGE_TYPES = [
  { key: 'infographic', label: 'Infographic', icon: '📊' },
  { key: 'photo', label: 'Photo', icon: '📷' },
  { key: 'illustration', label: 'Illustration', icon: '🎨' },
  { key: 'diagram', label: 'Diagram', icon: '📈' },
  { key: 'meme', label: 'Meme', icon: '😂' },
];

const SIZE_OPTIONS = [
  { label: 'Square', value: '1024x1024' },
  { label: 'Landscape', value: '1792x1024' },
  { label: 'Portrait', value: '1024x1792' },
];

const STYLE_BOOSTS: Record<string, string> = {
  realistic: 'photorealistic, hyper-detailed, 8K resolution, cinematic lighting, lifelike textures',
  vibrant: 'vibrant saturated colors, high contrast, eye-catching, bold palette, dynamic lighting',
  professional: 'clean minimal corporate style, muted professional color palette, studio lighting, polished finish',
  detailed: 'extremely detailed, intricate textures, high fidelity, fine-grained elements, rich depth',
};

function isImageProvider(p: ProviderConfigView): boolean {
  return p.kind === 'IMAGE_GENERATION' || p.supportsImage;
}

function isTextProvider(p: ProviderConfigView): boolean {
  return p.kind !== 'IMAGE_GENERATION' && p.kind !== 'VIDEO_GENERATION';
}

export function PostCards({ posts, conversationId }: PostCardsProps) {
  const providers = useAppStore((state) => state.providers);
  const lastResearchContext = useAppStore((state) => state.lastResearchContext);
  const imageProviders = providers.filter(isImageProvider);
  const textProviders = providers.filter(isTextProvider);

  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [postStates, setPostStates] = useState<Record<number, PostState>>({});
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [activePostIndex, setActivePostIndex] = useState<number | null>(null);
  const [imageType, setImageType] = useState('infographic');
  const [imagePrompt, setImagePrompt] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedEnhanceProviderId, setSelectedEnhanceProviderId] = useState<string>('');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [imageQuality, setImageQuality] = useState<'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd'>('auto');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    void api.linkedinStatus().then((status) => setLinkedinConnected(status.connected));
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'linkedin:connected') {
        setLinkedinConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const getPostState = (index: number): PostState =>
    postStates[index] ?? { imageUrl: null, imageArtifactId: null, isGenerating: false, isPosting: false, postError: null, isEditing: false, editedContent: '' };

  const updatePostState = (index: number, patch: Partial<PostState>) => {
    setPostStates((prev) => ({ ...prev, [index]: { ...getPostState(index), ...patch } }));
  };

  const openImageModal = (index: number) => {
    const post = posts[index];
    if (!post) return;
    setActivePostIndex(index);
    setGeneratedImageUrl(null);
    setImageError(null);
    const suggested = generateSuggestedPrompt(post.content, imageType);
    setImagePrompt(suggested);
    setImageSize('1024x1024');
    setImageQuality('auto');
    if (imageProviders.length > 0 && !selectedProviderId) {
      setSelectedProviderId(imageProviders[0]!.id);
    }
    // Default to CHAT or DEEP_RESEARCH default provider for prompt enhancement
    if (!selectedEnhanceProviderId) {
      const chatDefault = textProviders.find((p) => p.defaultForMode === 'CHAT') || textProviders.find((p) => p.isDefault) || textProviders[0];
      if (chatDefault) setSelectedEnhanceProviderId(chatDefault.id);
    }

    // If FLUX is the target provider, enhance the initial suggested prompt with FLUX-specific rules
    const targetProvider = imageProviders.find((p) => p.id === (selectedProviderId || imageProviders[0]?.id));
    if (targetProvider && targetProvider.kind === 'IMAGE_GENERATION' && targetProvider.model.toLowerCase().includes('flux')) {
      void enhancePromptWithFLUX(suggested, targetProvider.id);
    }
  };

  const enhancePromptWithFLUX = async (promptToEnhance: string, targetProviderId: string) => {
    if (!promptToEnhance.trim()) return;
    setIsEnhancing(true);
    try {
      const context = lastResearchContext ? `Post: ${posts[activePostIndex ?? 0]?.content ?? ''}\nResearch context: ${lastResearchContext}` : undefined;
      const enhancePayload: { prompt: string; context?: string; imageType: string; targetProviderId: string } = {
        prompt: promptToEnhance,
        imageType,
        targetProviderId,
      };
      if (context) enhancePayload.context = context;
      const { prompt: enhanced } = await api.enhancePrompt(enhancePayload);
      setImagePrompt(enhanced);
    } catch {
      // Fallback to the original suggested prompt
    } finally {
      setIsEnhancing(false);
    }
  };

  const applyStyle = (styleKey: string) => {
    const boost = STYLE_BOOSTS[styleKey];
    if (!boost) return;
    setImagePrompt((prev) => {
      if (prev.toLowerCase().includes(boost.toLowerCase())) return prev;
      return `${prev}. ${boost}.`;
    });
  };

  const regeneratePromptWithAI = async () => {
    if (!imagePrompt.trim()) return;
    setIsEnhancing(true);
    try {
      const context = lastResearchContext ? `Post: ${posts[activePostIndex ?? 0]?.content ?? ''}\nResearch context: ${lastResearchContext}` : undefined;
      const enhancePayload: { prompt: string; context?: string; providerId?: string; imageType: string; targetProviderId?: string } = {
        prompt: imagePrompt,
        imageType,
      };
      if (context) enhancePayload.context = context;
      if (selectedEnhanceProviderId) enhancePayload.providerId = selectedEnhanceProviderId;
      if (selectedProviderId) enhancePayload.targetProviderId = selectedProviderId;
      const { prompt: enhanced } = await api.enhancePrompt(enhancePayload);
      setImagePrompt(enhanced);
    } catch {
      // silently fail
    } finally {
      setIsEnhancing(false);
    }
  };

  const generateImage = async () => {
    if (activePostIndex === null) return;
    const index = activePostIndex;
    setGeneratedImageUrl(null);
    setImageError(null);
    updatePostState(index, { isGenerating: true, postError: null });
    try {
      const providerId = selectedProviderId || undefined;
      const { artifact } = await api.generateMedia({
        prompt: imagePrompt,
        type: 'image',
        ...(providerId ? { providerId } : {}),
        ...(conversationId ? { conversationId } : {}),
        options: { size: imageSize, quality: imageQuality, n: 1 },
      });
      const url = artifact.localPath
        ? `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/api/media/files/${artifact.localPath}`
        : artifact.blobUrl ?? null;
      updatePostState(index, {
        imageUrl: url,
        imageArtifactId: artifact.id,
        isGenerating: false,
      });
      setGeneratedImageUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image generation failed';
      updatePostState(index, { isGenerating: false, postError: msg });
      setImageError(msg);
    }
  };

  const postToLinkedIn = async (index: number) => {
    const post = posts[index];
    if (!post) return;
    const state = getPostState(index);
    const contentToPost = state.editedContent || post.content;
    if (!linkedinConnected) {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
      window.open(`${apiBase}/api/linkedin/connect`, 'linkedin_auth', 'width=600,height=700');
      return;
    }
    updatePostState(index, { isPosting: true, postError: null });
    try {
      await api.postToLinkedIn({
        content: contentToPost,
        ...(state.imageArtifactId ? { imageArtifactId: state.imageArtifactId } : {}),
      });
      updatePostState(index, { isPosting: false });
      alert('Posted to LinkedIn successfully!');
    } catch (err) {
      updatePostState(index, { isPosting: false, postError: err instanceof Error ? err.message : 'Post failed' });
    }
  };

  const schedulePost = async (index: number) => {
    const post = posts[index];
    if (!post) return;
    const state = getPostState(index);
    const contentToPost = state.editedContent || post.content;
    if (!scheduleAt) return;
    try {
      await api.schedulePost({
        platform: 'linkedin',
        content: contentToPost,
        ...(state.imageArtifactId ? { imageArtifactId: state.imageArtifactId } : {}),
        postAt: new Date(scheduleAt).toISOString(),
      });
      setShowScheduleModal(null);
      setScheduleAt('');
      alert('Post scheduled!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Schedule failed');
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">Generated Posts</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((post, index) => {
          const colorClass = PLATFORM_COLORS[post.platform] ?? 'bg-slate-500/10 border-slate-500/20 text-slate-300';
          const state = getPostState(index);
          const isLinkedIn = post.platform === 'LinkedIn';

          return (
            <div key={index} className={`rounded-2xl border p-4 ${colorClass}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider">{post.platform}</span>
                <span className="text-xs tabular-nums opacity-70">{post.characterCount} chars</span>
              </div>

              {state.imageUrl ? (
                <img
                  src={state.imageUrl}
                  alt="Post image"
                  className="mb-3 w-full cursor-zoom-in rounded-xl object-cover transition hover:opacity-90"
                  onClick={() => setLightboxUrl(state.imageUrl)}
                />
              ) : null}

              {state.isEditing ? (
                <>
                  <textarea
                    value={state.editedContent}
                    onChange={(e) => updatePostState(index, { editedContent: e.target.value })}
                    rows={Math.max(6, Math.ceil(state.editedContent.length / 50))}
                    className="mb-2 w-full resize-none rounded-xl border border-line bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updatePostState(index, { isEditing: false })}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent/90"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => updatePostState(index, { isEditing: false, editedContent: '' })}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{state.editedContent || post.content}</div>
              )}

              {state.postError ? (
                <p className="mt-2 text-xs text-red-300">{state.postError}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => handleCopy(state.editedContent || post.content)} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">
                  Copy
                </button>
                <button onClick={() => updatePostState(index, { isEditing: true, editedContent: post.content })} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors">
                  ✏️ Edit
                </button>

                {!state.imageUrl ? (
                  <button onClick={() => openImageModal(index)} className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 transition-colors">
                    ✨ Add Image
                  </button>
                ) : null}

                {isLinkedIn ? (
                  <>
                    <button
                      onClick={() => postToLinkedIn(index)}
                      disabled={state.isPosting}
                      className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
                    >
                      {state.isPosting ? 'Posting...' : linkedinConnected ? '🚀 Post to LinkedIn' : '🔗 Connect LinkedIn'}
                    </button>
                    <button
                      onClick={() => setShowScheduleModal(index)}
                      disabled={!linkedinConnected}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
                    >
                      📅 Schedule
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Image Generation Modal — wider */}
      {activePostIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setActivePostIndex(null)}>
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-white">Generate Image for {posts[activePostIndex]?.platform ?? ''}</h3>

            <label className="mb-1 block text-xs text-slate-500">Image Provider</label>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="mb-4 w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white outline-none focus:border-accent"
            >
              {imageProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.model}
                </option>
              ))}
              {imageProviders.length === 0 && <option value="">No image providers configured</option>}
            </select>

            <label className="mb-1 block text-xs text-slate-500">Image Type</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {IMAGE_TYPES.map((type) => (
                <button
                  key={type.key}
                  onClick={() => {
                    setImageType(type.key);
                    const post = posts[activePostIndex];
                    if (post) {
                      const suggested = generateSuggestedPrompt(post.content, type.key);
                      setImagePrompt(suggested);
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                    imageType === type.key ? 'border-accent bg-accent/20 text-accent' : 'border-line text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {type.icon} {type.label}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">Size</label>
                <div className="flex gap-2">
                  {SIZE_OPTIONS.map((sz) => (
                    <button
                      key={sz.value}
                      onClick={() => setImageSize(sz.value)}
                      className={`flex-1 rounded-xl border py-2 text-xs transition-colors ${
                        imageSize === sz.value ? 'border-accent bg-accent/20 text-accent' : 'border-line text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">Quality</label>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Auto', value: 'auto', desc: 'Provider default' },
                    { label: 'Low', value: 'low', desc: 'Faster / cheaper' },
                    { label: 'High', value: 'high', desc: 'Better detail' },
                  ].map((q) => (
                    <button
                      key={q.value}
                      title={q.desc}
                      onClick={() => setImageQuality(q.value as typeof imageQuality)}
                      className={`flex-1 rounded-xl border py-2 text-xs transition-colors ${
                        imageQuality === q.value ? 'border-accent bg-accent/20 text-accent' : 'border-line text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="mb-1 block text-xs text-slate-500">Style Boosts</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.keys(STYLE_BOOSTS).map((key) => (
                <button
                  key={key}
                  onClick={() => applyStyle(key)}
                  className="rounded-lg border border-line bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-accent transition-colors"
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-slate-500">Image Prompt</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedEnhanceProviderId}
                    onChange={(e) => setSelectedEnhanceProviderId(e.target.value)}
                    className="rounded-lg border border-line bg-ink px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-accent"
                    title="Select provider for AI prompt enhancement"
                  >
                    {textProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {textProviders.length === 0 && <option value="">No text providers</option>}
                  </select>
                  <button
                    onClick={regeneratePromptWithAI}
                    disabled={isEnhancing || textProviders.length === 0}
                    className="rounded-lg bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50"
                  >
                    {isEnhancing ? '✨ Enhancing...' : '✨ AI Regenerate'}
                  </button>
                </div>
              </div>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-xl border border-line bg-ink px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </div>

            {imageError ? (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                ❌ {imageError}
              </div>
            ) : null}

            {generatedImageUrl ? (
              <div className="mb-4">
                <p className="mb-2 text-xs text-green-400">✅ Image generated successfully</p>
                <img
                  src={generatedImageUrl}
                  alt="Generated"
                  className="w-full cursor-zoom-in rounded-xl border border-line object-cover"
                  onClick={() => setLightboxUrl(generatedImageUrl)}
                />
              </div>
            ) : null}

            {getPostState(activePostIndex).isGenerating ? (
              <div className="mb-4 flex items-center justify-center rounded-xl border border-line bg-ink py-8">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <p className="text-xs text-slate-400">Generating image... (this may take a minute)</p>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              {generatedImageUrl ? (
                <button
                  onClick={() => generateImage()}
                  disabled={!imagePrompt.trim()}
                  className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
                >
                  🔄 Regenerate
                </button>
              ) : (
                <button
                  onClick={() => generateImage()}
                  disabled={getPostState(activePostIndex).isGenerating || !imagePrompt.trim() || imageProviders.length === 0}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  Generate Image
                </button>
              )}
              <button onClick={() => setActivePostIndex(null)} className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
                {generatedImageUrl ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowScheduleModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-white">Schedule LinkedIn Post</h3>
            <label className="mb-1 block text-xs text-slate-500">Date & Time</label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="mb-4 w-full rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={() => schedulePost(showScheduleModal)}
                disabled={!scheduleAt}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
              >
                Schedule
              </button>
              <button onClick={() => setShowScheduleModal(null)} className="rounded-xl border border-line px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageLightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function generateSuggestedPrompt(postContent: string, type: string): string {
  const base = postContent.slice(0, 200);
  const map: Record<string, string> = {
    infographic: `A clean, professional infographic visualizing the key points: "${base}". Flat design, corporate style, readable text elements, light background, modern color palette.`,
    photo: `A high-quality professional photograph that visually represents: "${base}". Natural lighting, clean composition, suitable for a LinkedIn post.`,
    illustration: `A modern vector illustration representing the concept: "${base}". Flat 2D style, vibrant but professional colors, clean lines, minimal detail.`,
    diagram: `A clear process diagram or flowchart visualizing: "${base}". Professional corporate style, clean typography, arrows and boxes, light background.`,
    meme: `A funny, relatable meme image about: "${base}". Bold text overlay, recognizable meme format, workplace humor, high contrast.`,
  };
  return map[type] ?? `A professional image representing: "${base}"`;
}

export function tryParsePosts(content: string): GeneratedPost[] | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((p) => typeof p === 'object' && p !== null && 'platform' in p && 'content' in p && 'characterCount' in p)) return null;
    return parsed as GeneratedPost[];
  } catch {
    return null;
  }
}
