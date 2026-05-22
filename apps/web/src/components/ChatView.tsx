'use client';

import { useEffect, useState, useRef, useCallback, memo } from 'react';
import type { AppMode, ConversationSummary, ProjectSummary, ResearchSource } from '@cogentrex/shared';
import { useAppStore } from '@/store/appStore';
import { ReasoningPanel } from '@/components/ReasoningPanel';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { PlanEditor } from '@/components/PlanEditor';
import { SourceCards } from '@/components/SourceCards';
import { ExportButtons } from '@/components/ExportButtons';
import { ViewDiagnosticsButton } from '@/components/DiagnosticsPanel';
import { DiagnosticsBottomPanel } from '@/components/DiagnosticsPanel';
import { ProviderPicker } from '@/components/ProviderPicker';
import { ImageOptionsPanel } from '@/components/ImageOptionsPanel';
import { PostCards, tryParsePosts } from '@/components/PostCards';
import { api } from '@/lib/api';
import { ArtifactsPanel } from '@/components/ArtifactsPanel';
import { MessageReasoningBlock } from '@/components/MessageReasoningBlock';

// ── Helper ──────────────────────────────────────────
function extractImageFilenameFromMarkdown(content: string): string | null {
  const match = content.match(/\!\[.*?\]\(\s*(.*\/)?([^\/\s)]+)\s*\)/);
  return match && match[2] ? match[2] : null;
}

const WORKFLOW_META: Record<AppMode, { label: string; eyebrow: string; description: string; activeClass: string }> = {
  CHAT: {
    label: 'Chat',
    eyebrow: 'Fast answer',
    description: 'Provider-routed answers, files, and image context for quick work.',
    activeClass: 'bg-slate-100 text-ink',
  },
  DEEP_RESEARCH: {
    label: 'Deep Research',
    eyebrow: 'Evidence loop',
    description: 'Plan searches, gather sources, show reasoning, and synthesize citations.',
    activeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  },
  SOCIAL_WRITING: {
    label: 'Social',
    eyebrow: 'Drafting',
    description: 'Create platform-aware posts with optional mini research and image context.',
    activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  IMAGE_GENERATION: {
    label: 'Image',
    eyebrow: 'Visual',
    description: 'Generate or edit images with the configured image-capable provider.',
    activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  VIDEO_GENERATION: {
    label: 'Video',
    eyebrow: 'Motion',
    description: 'Generate short videos with the configured video-capable provider.',
    activeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
};

// ── MessageItem (memoised) ──────────────────────────
interface MessageItemProps {
  message: { id: string; conversationId: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; metadata?: Record<string, unknown> | null };
  onEditImage: (content: string) => void;
}

function processCitations(content: string, sources: ResearchSource[]): string {
  if (!sources.length) return content;
  const ids = new Set(sources.map((s) => s.id));
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const id = parseInt(num, 10);
    return ids.has(id) ? `[${id}](#source-${id})` : match;
  });
}

function getCitedSources(content: string, sources: ResearchSource[] | undefined): ResearchSource[] {
  if (!sources?.length) return [];
  const citedIds = new Set<number>();
  const regex = /\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const num = match[1];
    if (num) citedIds.add(parseInt(num, 10));
  }
  return sources.filter((s) => citedIds.has(s.id));
}

const MessageItem = memo(function MessageItem({ message, onEditImage }: MessageItemProps) {
  if (message.role === 'user') {
    // Detect if this user message was for social generation
    const state = useAppStore.getState();
    const isSocialGen = state.messages.some((m) => m.role === 'assistant' && m.content === message.content && message.content.length < 200);
    return (
      <article className="flex justify-end">
        <div className="max-w-[85%] cursor-text select-text rounded-3xl bg-accent px-5 py-4 leading-7 text-ink whitespace-pre-wrap">
          {message.content}
        </div>
      </article>
    );
  }

  const parsedPosts = tryParsePosts(message.content);
  if (parsedPosts) {
    return (
      <div className="w-full py-2">
        <div className="rounded-2xl border border-line bg-panel p-4 md:p-6">
          <PostCards posts={parsedPosts} conversationId={message.conversationId} />
        </div>
        {message.id ? (
          <ViewDiagnosticsButton conversationId={message.conversationId} messageId={message.id} />
        ) : null}
      </div>
    );
  }

  const isError = message.content?.includes('❌') || message.content?.includes('Generation failed') || message.content?.includes('timed out');
  const isLoading = message.content?.includes('Generating image') || message.content?.includes('Generating video');
  const hasGeneratedImage = message.content?.includes('![Generated Image]');
  const messageSources = message.metadata?.sources as ResearchSource[] | undefined;
  const citedSources = getCitedSources(message.content, messageSources);
  const processedContent = citedSources.length ? processCitations(message.content, citedSources) : message.content;
  const messageReasoning = message.metadata?.reasoning as Array<{ step: string; detail?: string; iteration?: number }> | undefined;

  return (
    <article className="flex justify-start">
      <div className="max-w-[85%] cursor-text select-text rounded-3xl border border-line bg-panel px-5 py-4 leading-7 text-slate-100">
        {message.content ? (
          isError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-200">{message.content}</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">{message.content}</p>
              <div className="h-64 w-full animate-pulse rounded-2xl border border-line bg-slate-800/50 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
                  <p className="mt-2 text-xs text-slate-500">This may take 2-5 minutes...</p>
                </div>
              </div>
            </div>
          ) : (
            <MarkdownMessage content={processedContent} sources={citedSources} />
          )
        ) : (
          'Thinking...'
        )}
        {citedSources.length ? (
          <div className="mt-3">
            <SourceCards sources={citedSources} />
          </div>
        ) : null}
        {messageReasoning && messageReasoning.length ? (
          <MessageReasoningBlock reasoning={messageReasoning} />
        ) : null}
        {message.id && !message.content?.startsWith('Thinking') ? (
          <ViewDiagnosticsButton conversationId={message.conversationId} messageId={message.id} />
        ) : null}
        {hasGeneratedImage ? (
          <button
            onClick={() => onEditImage(message.content)}
            className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-300 hover:bg-purple-500/20"
          >
            ✎ Edit Image
          </button>
        ) : null}
      </div>
    </article>
  );
});

// ── MessageList (subscribes to store independently) ──
function MessageList({ onEditImage }: { onEditImage: (content: string) => void }) {
  const messages = useAppStore((state) => state.messages);
  const mode = useAppStore((state) => state.mode);
  const reasoning = useAppStore((state) => state.reasoning);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const error = useAppStore((state) => state.error);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll -- only when new content arrives, never on typing
  const prevLastContent = useRef<string>('');
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const lastContent = last?.content ?? '';
    if (lastContent === prevLastContent.current) return;
    prevLastContent.current = lastContent;

    const threshold = 120;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const lastAssistant = messages.filter((m) => m.role === 'assistant').pop();

  // Find the index of the last user message (for positioning reasoning panel)
  const lastUserIndex = messages.map((m, i) => m.role === 'user' ? i : -1).filter((i) => i >= 0).pop();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
        {!messages.length ? (
          <section className="my-auto py-16">
            <p className="text-sm uppercase tracking-[0.3em] text-accent">Research & workflow cockpit</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-7xl">What should Cogentrex operate?</h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-300">
              Route quick answers, deep research, social drafts, and media generation through the same provider-aware workspace.
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {(['CHAT', 'DEEP_RESEARCH', 'SOCIAL_WRITING', 'IMAGE_GENERATION'] as AppMode[]).map((workflow) => (
                <div key={workflow} className="rounded-2xl border border-line bg-panel/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{WORKFLOW_META[workflow].eyebrow}</p>
                  <h2 className="mt-2 text-base font-semibold text-white">{WORKFLOW_META[workflow].label}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{WORKFLOW_META[workflow].description}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="space-y-5">
          {messages.map((message, index) => (
            <div key={message.id}>
              <MessageItem message={message} onEditImage={onEditImage} />
              {/* Show reasoning panel inline after the last user message when research is active */}
              {reasoning.length > 0 && index === lastUserIndex ? (
                <div className="mt-2">
                  <ReasoningPanel />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {lastAssistant && !isStreaming ? (
          <div className="flex items-center justify-between">
            <ExportButtons content={lastAssistant.content} sources={getCitedSources(lastAssistant.content, (lastAssistant.metadata?.sources as ResearchSource[] | undefined) ?? [])} />
          </div>
        ) : null}
        {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        <div className="h-4 shrink-0" />
      </div>
    </div>
  );
}

// ── ChatInput (handles all local state) ─────────────
interface UploadedFile {
  name: string;
  type: string;
  content?: string;
}

const PLATFORM_OPTIONS = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'medium', label: 'Medium' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'substack', label: 'Substack' },
];

function WorkflowModeRail({ mode, setMode }: { mode: AppMode; setMode: (mode: AppMode) => void }) {
  const workflows: AppMode[] = ['CHAT', 'DEEP_RESEARCH', 'SOCIAL_WRITING', 'IMAGE_GENERATION', 'VIDEO_GENERATION'];

  return (
    <div className="grid w-full gap-2 lg:grid-cols-5">
      {workflows.map((workflow) => {
        const meta = WORKFLOW_META[workflow];
        const active = mode === workflow;
        return (
          <button
            key={workflow}
            type="button"
            onClick={() => setMode(workflow)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              active ? meta.activeClass : 'border-line bg-panel/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            <span className="block text-[10px] uppercase tracking-[0.18em] opacity-70">{meta.eyebrow}</span>
            <span className="mt-1 block text-sm font-semibold">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChatInput({ onSend, onGenerateSocial }: { onSend: (content: string) => void; onGenerateSocial: (input: { topic: string; platforms: string[]; imageUrls?: string[]; useResearch?: boolean }) => void }) {
  const mode = useAppStore((state) => state.mode);
  const providers = useAppStore((state) => state.providers);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const pendingPlan = useAppStore((state) => state.pendingPlan);
  const imageOptions = useAppStore((state) => state.imageOptions);
  const setImageOptions = useAppStore((state) => state.setImageOptions);
  const setMode = useAppStore((state) => state.setMode);
  const setActiveProvider = useAppStore((state) => state.setActiveProvider);
  const editingImages = useAppStore((state) => state.editingImages);
  const exitEditMode = useAppStore((state) => state.exitEditMode);
  const addEditingImage = useAppStore((state) => state.addEditingImage);
  const removeEditingImage = useAppStore((state) => state.removeEditingImage);

  const [input, setInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Image states
  const [socialImages, setSocialImages] = useState<string[]>([]);
  const [chatImages, setChatImages] = useState<string[]>([]); // For CHAT/DEEP_RESEARCH
  const [analyzing, setAnalyzing] = useState(false);

  // Social writing state
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin', 'x']);
  const [useResearch, setUseResearch] = useState(false);
  const [researchSources, setResearchSources] = useState(5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const chatImageUploadRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

  // Auto-switch provider for social mode: plain social = chat default, research = deep research default
  useEffect(() => {
    if (mode !== 'SOCIAL_WRITING') return;
    const targetMode = useResearch ? 'DEEP_RESEARCH' : 'CHAT';
    const modeDefault = providers.find((p) => p.defaultForMode === targetMode);
    if (modeDefault) {
      setActiveProvider(modeDefault.id);
    } else {
      // Fallback to global default if no mode-specific default
      const globalDefault = providers.find((p) => p.isDefault);
      if (globalDefault) setActiveProvider(globalDefault.id);
    }
  }, [mode, useResearch, providers, setActiveProvider]);

  // ── Helpers ────────────────────────────────────

  const addImageFiles = useCallback(async (files: File[], target: 'social' | 'chat' | 'edit') => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    try {
      const { files: uploaded } = await api.uploadImages(imageFiles);
      uploaded.forEach((f) => {
        if (target === 'social') {
          setSocialImages((prev) => (prev.length < 4 ? [...prev, f.filename] : prev));
        } else if (target === 'chat') {
          setChatImages((prev) => (prev.length < 4 ? [...prev, f.filename] : prev));
        } else {
          addEditingImage(f.filename);
        }
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image upload failed');
    }
  }, [addEditingImage]);

  const extractImageFilesFromEvent = useCallback((event: React.ClipboardEvent | React.DragEvent): File[] => {
    const dataTransfer = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
    if (!dataTransfer) return [];
    const files: File[] = [];
    // Check items first
    if (dataTransfer.items) {
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    // Fallback to files
    if (!files.length && dataTransfer.files) {
      for (const file of Array.from(dataTransfer.files)) {
        if (file.type.startsWith('image/')) files.push(file);
      }
    }
    return files;
  }, []);

  // ── Handlers ───────────────────────────────────

  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = extractImageFilesFromEvent(event);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    console.log('[paste]', 'detected', imageFiles.length, 'image(s), mode=', mode);
    if (mode === 'SOCIAL_WRITING') {
      await addImageFiles(imageFiles, 'social');
    } else if (mode === 'CHAT' || mode === 'DEEP_RESEARCH') {
      await addImageFiles(imageFiles, 'chat');
    } else if (mode === 'IMAGE_GENERATION') {
      await addImageFiles(imageFiles, 'edit');
    }
  }, [mode, extractImageFilesFromEvent, addImageFiles]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const imageFiles = extractImageFilesFromEvent(event);
    if (!imageFiles.length) return;
    if (mode === 'SOCIAL_WRITING') {
      await addImageFiles(imageFiles, 'social');
    } else if (mode === 'CHAT' || mode === 'DEEP_RESEARCH') {
      await addImageFiles(imageFiles, 'chat');
    } else if (mode === 'IMAGE_GENERATION') {
      await addImageFiles(imageFiles, 'edit');
    }
  }, [mode, extractImageFilesFromEvent, addImageFiles]);

  const submit = useCallback(async () => {
    const value = input.trim();
    if ((!value && uploadedFiles.length === 0 && chatImages.length === 0) || isStreaming) return;

    let fullContent = value;

    // Attach text files
    if (uploadedFiles.length > 0) {
      const fileContext = uploadedFiles.map(f =>
        f.content ? `[File: ${f.name}]\n${f.content}` : `[File: ${f.name}]`
      ).join('\n\n');
      fullContent = value ? `${value}\n\n${fileContext}` : fileContext;
    }

    // Analyze attached images with vision model before sending
    if (chatImages.length > 0) {
      setAnalyzing(true);
      try {
        const { analysis } = await api.analyzeImages(chatImages);
        if (analysis) {
          fullContent = fullContent ? `${fullContent}\n\n[Image context: ${analysis}]` : `[Image context: ${analysis}]`;
        }
      } catch (err) {
        console.error('[vision-analysis]', err);
      } finally {
        setAnalyzing(false);
        setChatImages([]);
      }
    }

    setInput('');
    setUploadedFiles([]);
    onSend(fullContent);
  }, [input, uploadedFiles, chatImages, isStreaming, onSend]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (mode === 'SOCIAL_WRITING') return; // social uses button submit
      submit();
    }
  }, [submit, mode]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
        const content = await file.text();
        newFiles.push({ name: file.name, type: file.type, content });
      } else {
        newFiles.push({ name: file.name, type: file.type });
      }
    }
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const togglePlatform = useCallback((key: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const submitSocial = useCallback(() => {
    const topic = input.trim();
    if (!topic || isStreaming || selectedPlatforms.length === 0) return;
    const payload: { topic: string; platforms: string[]; imageUrls?: string[]; useResearch?: boolean; researchSources?: number } = {
      topic,
      platforms: selectedPlatforms,
    };
    if (socialImages.length > 0) {
      payload.imageUrls = socialImages.map((f) => `${API_BASE}/api/media/files/${f}`);
    }
    if (useResearch) {
      payload.useResearch = true;
      payload.researchSources = researchSources;
    }
    onGenerateSocial(payload);
  }, [input, isStreaming, selectedPlatforms, socialImages, useResearch, researchSources, onGenerateSocial]);

  return (
    <div className="shrink-0 border-t border-line bg-ink/90 p-4 backdrop-blur">
      <div
        ref={containerRef}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-3xl border border-line bg-panel p-3 shadow-2xl shadow-black/30 transition-colors ${isDragOver ? 'border-accent bg-accent/5' : ''}`}
      >
        {/* Drag overlay */}
        {isDragOver ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-accent/10">
            <p className="text-lg font-semibold text-accent">Drop images here</p>
          </div>
        ) : null}

        {/* Editing images (IMAGE_GENERATION mode) */}
        {editingImages.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-2">
            <span className="text-xs font-medium text-purple-300">Editing:</span>
            {editingImages.map((filename) => (
              <div key={filename} className="group relative">
                <img
                  src={`${API_BASE}/api/media/files/${filename}`}
                  alt="Edit source"
                  className="h-14 w-14 rounded-xl object-cover border border-purple-500/30"
                />
                <button
                  onClick={() => removeEditingImage(filename)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {editingImages.length < 8 ? (
              <button
                onClick={() => imageUploadRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-purple-400 hover:text-purple-300"
              >
                +
              </button>
            ) : null}
            <button onClick={exitEditMode} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Clear</button>
            <input ref={imageUploadRef} type="file" multiple accept="image/*" onChange={(e) => addImageFiles(Array.from(e.target.files ?? []), 'edit')} className="hidden" />
          </div>
        ) : null}

        {/* Chat/Deep Research attached images */}
        {(mode === 'CHAT' || mode === 'DEEP_RESEARCH') && (chatImages.length > 0 || analyzing) ? (
          <div className="flex flex-wrap items-center gap-2 px-2">
            <span className="text-xs font-medium text-teal-300">Images:</span>
            {chatImages.map((filename) => (
              <div key={filename} className="group relative">
                <img
                  src={`${API_BASE}/api/media/files/${filename}`}
                  alt="Attached"
                  className="h-14 w-14 rounded-xl object-cover border border-teal-500/30"
                />
                <button
                  onClick={() => setChatImages((prev) => prev.filter((f) => f !== filename))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {analyzing ? (
              <span className="text-xs text-teal-300 animate-pulse">Analyzing with vision model...</span>
            ) : null}
            {chatImages.length < 4 && !analyzing ? (
              <button
                onClick={() => chatImageUploadRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-teal-400 hover:text-teal-300"
              >
                +
              </button>
            ) : null}
            <button onClick={() => setChatImages([])} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Clear</button>
            <input ref={chatImageUploadRef} type="file" multiple accept="image/*" onChange={(e) => addImageFiles(Array.from(e.target.files ?? []), 'chat')} className="hidden" />
          </div>
        ) : null}

        {/* Social Writing images */}
        {mode === 'SOCIAL_WRITING' ? (
          <div className="flex flex-wrap items-center gap-2 px-2">
            <span className="text-xs font-medium text-blue-300">Images:</span>
            {socialImages.map((filename) => (
              <div key={filename} className="group relative">
                <img
                  src={`${API_BASE}/api/media/files/${filename}`}
                  alt="Social source"
                  className="h-14 w-14 rounded-xl object-cover border border-blue-500/30"
                />
                <button
                  onClick={() => setSocialImages((prev) => prev.filter((f) => f !== filename))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {socialImages.length < 4 ? (
              <button
                onClick={() => chatImageUploadRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-blue-400 hover:text-blue-300"
              >
                +
              </button>
            ) : null}
            {socialImages.length > 0 ? (
              <button onClick={() => setSocialImages([])} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Clear</button>
            ) : (
              <span className="text-xs text-slate-600">Paste, drag, or click + to add images as visual context</span>
            )}
            <input ref={chatImageUploadRef} type="file" multiple accept="image/*" onChange={(e) => addImageFiles(Array.from(e.target.files ?? []), 'social')} className="hidden" />
          </div>
        ) : null}

        {/* Text file attachments */}
        {uploadedFiles.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-2">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-1.5 text-sm text-accent">
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button onClick={() => removeFile(index)} className="text-accent hover:text-white">×</button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Social writing platform selector */}
        {mode === 'SOCIAL_WRITING' ? (
          <>
            <div className="flex flex-wrap gap-2 px-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => togglePlatform(p.key)}
                  className={`rounded-xl border px-3 py-1.5 text-xs transition-colors ${
                    selectedPlatforms.includes(p.key)
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-line text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 px-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={useResearch}
                onChange={(e) => setUseResearch(e.target.checked)}
                className="rounded border-line bg-panel text-accent"
              />
              Run mini deep research before writing
            </label>
            {useResearch ? (
              <div className="flex items-center gap-3 px-2">
                <span className="text-xs text-slate-400">Sources:</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={researchSources}
                  onChange={(e) => setResearchSources(Number(e.target.value))}
                  className="w-32 accent-accent"
                />
                <span className="min-w-[1.5rem] text-xs font-medium text-accent">{researchSources}</span>
              </div>
            ) : null}
          </>
        ) : null}

        {mode === 'SOCIAL_WRITING' ? (
          <p className="px-2 text-xs text-slate-500">
            Tip: Edit your topic above and click Generate again to iterate on results. Previous posts will be saved in the conversation.
          </p>
        ) : null}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            providers.length === 0
              ? 'Configure a provider first...'
              : editingImages.length > 0
              ? 'Describe what you want to change...'
              : mode === 'IMAGE_GENERATION'
              ? 'Describe the image you want to generate...'
              : mode === 'VIDEO_GENERATION'
              ? 'Describe the video you want to generate...'
              : mode === 'SOCIAL_WRITING'
              ? 'Topic or idea for your social posts...'
              : 'Ask Cogentrex... (Press Enter to send)'
          }
          disabled={isStreaming || providers.length === 0 || !!pendingPlan || analyzing}
          className="min-h-24 resize-none rounded-2xl bg-transparent px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
        />
        {mode === 'IMAGE_GENERATION' ? (
          <ImageOptionsPanel options={imageOptions} onChange={setImageOptions} />
        ) : null}
        <div className="flex flex-col gap-3">
          <WorkflowModeRail mode={mode} setMode={setMode} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <ProviderPicker />
              {mode !== 'IMAGE_GENERATION' && mode !== 'VIDEO_GENERATION' && mode !== 'SOCIAL_WRITING' ? (
                <>
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isStreaming} className="rounded-xl border border-line px-3 py-2 text-sm text-slate-300 hover:border-accent disabled:opacity-50">📎 Attach Files</button>
                </>
              ) : null}
            </div>
            {mode === 'SOCIAL_WRITING' ? (
              <button
                onClick={submitSocial}
                disabled={isStreaming || !input.trim() || selectedPlatforms.length === 0 || providers.length === 0}
                className="rounded-2xl bg-accent px-5 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStreaming ? 'Generating...' : 'Generate Posts'}
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={isStreaming || (!input.trim() && uploadedFiles.length === 0 && chatImages.length === 0) || providers.length === 0 || !!pendingPlan || analyzing}
                className="rounded-2xl bg-accent px-5 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? 'Analyzing images...' : pendingPlan ? 'Reviewing Plan...' : isStreaming ? 'Working...' : editingImages.length > 0 ? 'Edit Image' : mode === 'IMAGE_GENERATION' ? 'Generate Image' : mode === 'VIDEO_GENERATION' ? 'Generate Video' : 'Send'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CockpitHeader({
  activeProject,
  activeConversation,
  artifactCount,
  artifactPanelOpen,
  toggleArtifactPanel,
  shareUrl,
  isSharing,
  handleShare,
  handleUnshare,
}: {
  activeProject: ProjectSummary | undefined;
  activeConversation: ConversationSummary | undefined;
  artifactCount: number;
  artifactPanelOpen: boolean;
  toggleArtifactPanel: () => void;
  shareUrl: string | null;
  isSharing: boolean;
  handleShare: () => void;
  handleUnshare: () => void;
}) {
  const contextLabel = activeProject ? `Project: ${activeProject.name}` : 'All conversations';
  const sessionLabel = activeConversation ? activeConversation.title : 'New session';

  return (
    <div className="border-b border-line bg-panel/70 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm">
              <img src="/logo" alt="Cogentrex" className="h-5 w-5 object-contain" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-[0.12em] text-accent">Cogentrex</span>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Research cockpit</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-line bg-ink/50 px-3 py-1 text-slate-300">{contextLabel}</span>
            <span className="max-w-md truncate rounded-full border border-line bg-ink/50 px-3 py-1 text-slate-400">{sessionLabel}</span>
            {artifactCount > 0 ? (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">{artifactCount} artifact{artifactCount === 1 ? '' : 's'}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {artifactCount > 0 && !artifactPanelOpen ? (
            <button
              onClick={toggleArtifactPanel}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-accent/10 px-3 py-1.5 text-sm text-accent transition-colors hover:border-accent"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Artifacts
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink">{artifactCount}</span>
            </button>
          ) : null}
          {activeConversation ? (
            shareUrl || activeConversation.shareToken ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400">Link copied!</span>
                <button
                  onClick={handleUnshare}
                  disabled={isSharing}
                  className="rounded-xl border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            ) : (
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="rounded-xl border border-line px-3 py-1.5 text-sm text-slate-300 hover:border-accent disabled:opacity-50"
              >
                {isSharing ? '...' : 'Share'}
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── ChatView (layout shell only) ────────────────────
export function ChatView() {
  const enterEditMode = useAppStore((state) => state.enterEditMode);
  const artifacts = useAppStore((state) => state.artifacts);
  const artifactPanelOpen = useAppStore((state) => state.artifactPanelOpen);
  const toggleArtifactPanel = useAppStore((state) => state.toggleArtifactPanel);
  const conversations = useAppStore((state) => state.conversations);
  const projects = useAppStore((state) => state.projects);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeProject = activeProjectId ? projects.find((project) => project.id === activeProjectId) : undefined;

  const handleShare = async () => {
    if (!activeConversation) return;
    setIsSharing(true);
    try {
      const token = activeConversation.shareToken
        ? activeConversation.shareToken
        : (await api.shareConversation(activeConversation.id)).shareToken;
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!activeConversation) return;
    setIsSharing(true);
    try {
      await api.unshareConversation(activeConversation.id);
      setShareUrl(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke share');
    } finally {
      setIsSharing(false);
    }
  };

  useEffect(() => {
    setShareUrl(null);
  }, [activeConversationId]);

  const handleEditImage = useCallback((content: string) => {
    const filename = extractImageFilenameFromMarkdown(content);
    if (filename) enterEditMode([filename]);
  }, [enterEditMode]);

  const handleSend = useCallback((content: string) => {
    useAppStore.getState().send(content);
  }, []);

  const handleGenerateSocial = useCallback((input: { topic: string; platforms: string[]; imageUrls?: string[]; useResearch?: boolean; researchSources?: number }) => {
    useAppStore.getState().generateSocialPosts(input);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#152238,#0b0f19_45%)]">
      <PlanEditor />
      <CockpitHeader
        activeProject={activeProject}
        activeConversation={activeConversation}
        artifactCount={artifacts.length}
        artifactPanelOpen={artifactPanelOpen}
        toggleArtifactPanel={toggleArtifactPanel}
        shareUrl={shareUrl}
        isSharing={isSharing}
        handleShare={() => void handleShare()}
        handleUnshare={() => void handleUnshare()}
      />

      <MessageList onEditImage={handleEditImage} />
      <ChatInput onSend={handleSend} onGenerateSocial={handleGenerateSocial} />
      <DiagnosticsBottomPanel />
    </main>
    <ArtifactsPanel />
    </div>
  );
}
