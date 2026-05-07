'use client';

import { create } from 'zustand';
import type { AppMode, ChatMessage, ConversationSummary, GeneratedPost, ImageGenerationOptions, ProjectSummary, ProviderConfigView, PublicUser, ResearchSource, StreamEvent, ArtifactItem, SearchIteration } from '@cogentrex/shared';
import { api, streamMessage, streamResearch } from '@/lib/api';
import { ApiError } from '@/lib/api';

interface ReasoningItem {
  id: string;
  step: string;
  detail: string | undefined;
  iteration: number | undefined;
}

interface PendingPlan {
  jobId: string;
  conversationId: string;
  plan: string[];
  question: string;
  isLoading: boolean;
  loadingMessage?: string | undefined;
  priorSourceCount?: number;
}

interface AppState {
  user: PublicUser | null | undefined;
  providers: ProviderConfigView[];
  conversations: ConversationSummary[];
  projects: ProjectSummary[];
  activeProjectId: string | null | undefined;
  messages: ChatMessage[];
  activeConversationId: string | undefined;
  activeProviderId: string | undefined;
  mode: AppMode;
  reasoning: ReasoningItem[];
  sources: ResearchSource[];
  searchIterations: SearchIteration[];
  researchDrawerOpen: boolean;
  isStreaming: boolean;
  isWarmingUp: boolean;
  error: string | undefined;
  pendingPlan: PendingPlan | null;
  imageOptions: ImageGenerationOptions;
  editingImages: string[];
  lastResearchContext: string;
  diagnosticsPanelOpen: boolean;
  diagnosticsConversationId: string | undefined;
  diagnosticsMessageId: string | undefined;
  artifacts: ArtifactItem[];
  selectedArtifactId: string | undefined;
  artifactPanelOpen: boolean;
  bootstrap: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  loadArtifacts: (conversationId: string) => Promise<void>;
  createProvider: (input: { name: string; baseUrl: string; apiKey: string; model: string; kind: ProviderConfigView['kind']; isDefault: boolean; defaultForMode?: 'CHAT' | 'DEEP_RESEARCH'; supportsStreaming?: boolean; supportsVision?: boolean; supportsTools?: boolean; supportsSearch?: boolean; supportsImage?: boolean; supportsVideo?: boolean }) => Promise<void>;
  send: (content: string) => Promise<void>;
  generateSocialPosts: (input: { topic: string; platforms: string[]; imageUrls?: string[] | undefined; useResearch?: boolean | undefined; researchSources?: number | undefined }) => Promise<void>;
  startResearch: (plan: string[]) => Promise<void>;
  cancelPlan: () => void;
  setMode: (mode: AppMode) => void;
  setActiveProvider: (id: string) => void;
  setImageOptions: (options: ImageGenerationOptions) => void;
  enterEditMode: (filenames: string[]) => void;
  exitEditMode: () => void;
  addEditingImage: (filename: string) => void;
  removeEditingImage: (filename: string) => void;
  openDiagnosticsPanel: (conversationId: string, messageId?: string) => void;
  closeDiagnosticsPanel: () => void;
  toggleResearchDrawer: () => void;
  selectArtifact: (id: string | undefined) => void;
  toggleArtifactPanel: () => void;
  closeArtifactPanel: () => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePinConversation: (id: string, pinned: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteAllConversations: () => Promise<void>;
  setActiveProject: (id: string | null | undefined) => Promise<void>;
  assignConversationToProject: (conversationId: string, projectId: string | null) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  clearChat: () => void;
}

function isMediaMode(mode: AppMode): mode is 'IMAGE_GENERATION' | 'VIDEO_GENERATION' {
  return mode === 'IMAGE_GENERATION' || mode === 'VIDEO_GENERATION';
}

export const useAppStore = create<AppState>((set, get) => ({
  user: undefined,
  providers: [],
  conversations: [],
  projects: [],
  activeProjectId: undefined,
  messages: [],
  activeConversationId: undefined,
  activeProviderId: undefined,
  mode: 'CHAT',
  reasoning: [],
  sources: [],
  searchIterations: [],
  researchDrawerOpen: false,
  isStreaming: false,
  isWarmingUp: false,
  error: undefined,
  pendingPlan: null,
  imageOptions: { size: '1024x1024', quality: 'auto', n: 1 },
  editingImages: [],
  lastResearchContext: '',
  diagnosticsPanelOpen: false,
  diagnosticsConversationId: undefined,
  diagnosticsMessageId: undefined,
  artifacts: [],
  selectedArtifactId: undefined,
  artifactPanelOpen: false,
  async bootstrap() {
    const maxRetries = 6;
    const retryDelay = 3000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const [{ user }, { providers }, { conversations }, { projects }] = await Promise.all([
          api.me(),
          api.listProviders(),
          api.listConversations(get().activeProjectId),
          api.listProjects(),
        ]);
        set({
          user,
          providers,
          conversations,
          projects,
          activeProviderId: providers.find((provider) => provider.isDefault)?.id ?? providers[0]?.id,
          isWarmingUp: false,
        });
        return;
      } catch (err) {
        const isUnauthorized = err instanceof ApiError && err.status === 401;
        const isServerError = err instanceof ApiError && (err.status === 502 || err.status === 503 || err.status === 504);
        const isNetworkError = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));

        if (isUnauthorized) {
          set({ user: null, isWarmingUp: false });
          return;
        }

        if ((isServerError || isNetworkError) && attempt < maxRetries) {
          set({ isWarmingUp: true });
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // Unknown or persistent error — fall back to login
        set({ user: null, isWarmingUp: false });
        return;
      }
    }
  },
  async register(email, password) {
    const { user } = await api.register(email, password);
    set({ user });
    await get().bootstrap();
  },
  async login(email, password) {
    const { user } = await api.login(email, password);
    set({ user });
    await get().bootstrap();
  },
  async logout() {
    await api.logout();
    set({ user: null, messages: [], conversations: [], providers: [] });
  },
  async loadMessages(conversationId) {
    const { messages } = await api.listMessages(conversationId);
    const assistantWithSources = messages.find((m) => m.role === 'assistant' && m.metadata && Array.isArray(m.metadata.sources));
    const restoredSources = assistantWithSources ? (assistantWithSources.metadata!.sources as ResearchSource[]) : [];
    set({ activeConversationId: conversationId, messages, reasoning: [], sources: restoredSources, pendingPlan: null });
    await get().loadArtifacts(conversationId);
  },
  async loadArtifacts(conversationId) {
    try {
      const { artifacts } = await api.listArtifacts(conversationId);
      set({ artifacts });
      // If there are artifacts and panel is closed, open it
      if (artifacts.length > 0) {
        set({ artifactPanelOpen: true, selectedArtifactId: artifacts[0]?.id });
      }
    } catch {
      // Non-critical: silently fail if artifacts endpoint isn't available
    }
  },
  async createProvider(input) {
    await api.createProvider(input);
    const { providers } = await api.listProviders();
    set({ providers, activeProviderId: providers.find((provider) => provider.isDefault)?.id ?? providers[0]?.id });
  },
  async send(content) {
    const state = get();
    if (!content.trim() || state.isStreaming) return;

    if (state.mode === 'DEEP_RESEARCH') {
      set({ pendingPlan: { jobId: '', conversationId: state.activeConversationId ?? '', plan: [], question: content, isLoading: true, loadingMessage: 'Reading linked sources...' } });
      try {
        const { plan, jobId, conversationId, priorSourceCount } = await api.planResearch(content, state.activeProviderId, state.activeConversationId);
        set({ pendingPlan: { jobId, conversationId, plan, question: content, isLoading: false, priorSourceCount } });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Planning failed', pendingPlan: null });
      }
      return;
    }

    if (isMediaMode(state.mode)) {
      const typeLabel = state.mode === 'IMAGE_GENERATION' ? 'image' : 'video';
      const activeProvider = state.providers.find((p) => p.id === state.activeProviderId);
      const optimisticUserId = `local-user-${Date.now()}`;
      const optimisticAssistantId = `local-assistant-${Date.now()}`;
      const optimisticMessages: ChatMessage[] = [
        {
          id: optimisticUserId,
          conversationId: state.activeConversationId ?? 'pending',
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        },
        {
          id: optimisticAssistantId,
          conversationId: state.activeConversationId ?? 'pending',
          role: 'assistant',
          content: `Generating ${typeLabel} with **${activeProvider?.name ?? 'provider'}** (**${activeProvider?.model ?? ''}**)...`,
          createdAt: new Date().toISOString(),
        },
      ];
      set({
        messages: [...state.messages, ...optimisticMessages],
        reasoning: [],
        sources: [],
        isStreaming: true,
        error: undefined,
      });

      try {
        const { messages, conversationId } = await api.generateMedia({
          prompt: content,
          type: state.mode === 'IMAGE_GENERATION' ? 'image' : 'video',
          conversationId: state.activeConversationId ?? undefined,
          ...(state.activeProviderId ? { providerId: state.activeProviderId } : {}),
          ...(state.mode === 'IMAGE_GENERATION' ? {
            options: {
              ...state.imageOptions,
              inputImages: state.editingImages.length > 0 ? state.editingImages : undefined,
            }
          } : {}),
        });
        // Replace optimistic messages with real messages while keeping any earlier messages
        set((current) => ({
          messages: [
            ...current.messages.filter((m) => m.id !== optimisticUserId && m.id !== optimisticAssistantId),
            ...messages.filter((m) => !current.messages.some((cm) => cm.id === m.id)),
          ],
          activeConversationId: conversationId,
        }));
        const { conversations } = await api.listConversations();
        set({ conversations });
      } catch (error) {
        set((current) => ({
          messages: current.messages.map((m) =>
            m.id === optimisticAssistantId
              ? {
                  ...m,
                  content: `❌ **Generation failed:** ${error instanceof Error ? error.message : 'Unknown error'}`,
                }
              : m
          ),
        }));
      } finally {
        set({ isStreaming: false });
      }
      return;
    }

    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: state.activeConversationId ?? 'pending',
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    set({
      messages: [...state.messages, optimisticUser],
      reasoning: [],
      sources: [],
      isStreaming: true,
      error: undefined,
    });

    let assistantId = `local-assistant-${Date.now()}`;
    let assistantContent = '';
    const handleEvent = (event: StreamEvent) => {
      if (event.type === 'start') {
        assistantId = event.messageId;
        set((current) => ({
          activeConversationId: event.conversationId,
          messages: [...current.messages, {
            id: assistantId,
            conversationId: event.conversationId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          }],
          researchDrawerOpen: event.mode === 'DEEP_RESEARCH' ? true : current.researchDrawerOpen,
          searchIterations: event.mode === 'DEEP_RESEARCH' ? [] : current.searchIterations,
        }));
      }
      if (event.type === 'delta') {
        assistantContent += event.content;
        set((current) => ({
          messages: current.messages.map((message) => message.id === assistantId ? { ...message, content: assistantContent } : message),
        }));
      }
      if (event.type === 'reasoning') {
        set((current) => ({ reasoning: [...current.reasoning, { id: `${Date.now()}-${current.reasoning.length}`, step: event.step, detail: event.detail, iteration: event.iteration }] }));
        const step = event.step;
        const iteration = event.iteration;
        const detail = event.detail;
        if (step?.startsWith('Searching ') && iteration !== undefined && detail) {
          set((current) => {
            const channel = step.replace('Searching ', '');
            if (current.searchIterations.some((si) => si.id === iteration)) return current;
            return {
              searchIterations: [...current.searchIterations, {
                id: iteration,
                channel,
                query: detail,
                status: 'searching' as const,
                resultCount: 0,
                results: [],
              }],
            };
          });
        }
        if (step === 'Reviewing findings' && iteration !== undefined) {
          set((current) => ({
            searchIterations: current.searchIterations.map((si) =>
              si.id === iteration ? { ...si, status: 'found' as const } : si
            ),
          }));
        }
      }
      if (event.type === 'source') {
        set((current) => {
          const updatedSources = [...current.sources, event.source];
          const updatedMessages = current.messages.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    sources: [...((msg.metadata?.sources as ResearchSource[] | undefined) ?? []), event.source],
                  },
                }
              : msg
          );
          return { sources: updatedSources, messages: updatedMessages };
        });
        const sourceIteration = event.iteration;
        if (sourceIteration !== undefined) {
          set((current) => ({
            searchIterations: current.searchIterations.map((si) =>
              si.id === sourceIteration
                ? { ...si, results: [...si.results, event.source], resultCount: si.resultCount + 1 }
                : si
            ),
          }));
        }
      }
      if (event.type === 'artifact') {
        set((current) => {
          const newArtifact: ArtifactItem = {
            id: `live-${Date.now()}-${current.artifacts.length}`,
            conversationId: current.activeConversationId ?? '',
            messageId: assistantId,
            type: event.artifactType,
            filename: event.filename,
            language: event.language,
            content: event.content,
            sizeBytes: event.content.length,
            createdAt: new Date().toISOString(),
          };
          return {
            artifacts: [...current.artifacts, newArtifact],
            artifactPanelOpen: true,
            selectedArtifactId: newArtifact.id,
          };
        });
      }
      if (event.type === 'done') {
        set((current) => {
          const updatedConversations = event.title
            ? current.conversations.map((c) =>
                c.id === current.activeConversationId ? { ...c, title: event.title! } : c
              )
            : current.conversations;
          const updatedMessages = event.sources
            ? current.messages.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, metadata: { ...msg.metadata, sources: event.sources } }
                  : msg
              )
            : current.messages;
          return { sources: event.sources ?? current.sources, isStreaming: false, conversations: updatedConversations, messages: updatedMessages };
        });
      }
      if (event.type === 'error') {
        set({ error: event.message });
      }
    };

    try {
      await streamMessage({
        content,
        mode: state.mode,
        ...(state.activeProviderId ? { providerId: state.activeProviderId } : {}),
        ...(state.activeConversationId ? { conversationId: state.activeConversationId } : {}),
        onEvent: handleEvent,
      });
      const { conversations } = await api.listConversations();
      set({ conversations });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Message failed' });
    } finally {
      set({ isStreaming: false });
    }
  },
  async generateSocialPosts(input) {
    const state = get();
    if (state.isStreaming) return;
    set({ isStreaming: true, error: undefined });

    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: state.activeConversationId ?? 'pending',
      role: 'user',
      content: input.topic,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistant: ChatMessage = {
      id: `local-assistant-${Date.now()}`,
      conversationId: state.activeConversationId ?? 'pending',
      role: 'assistant',
      content: `Generating social posts for ${input.platforms.join(', ')}...`,
      createdAt: new Date().toISOString(),
    };

    const reasoningSteps: ReasoningItem[] = [];
    function pushReasoning(step: string, detail?: string) {
      reasoningSteps.push({ id: `r-${Date.now()}-${reasoningSteps.length}`, step, detail, iteration: undefined });
      set({ reasoning: [...reasoningSteps] });
    }

    set({
      messages: [...state.messages, optimisticUser, optimisticAssistant],
      reasoning: reasoningSteps,
      sources: [],
    });

    try {
      if (input.imageUrls?.length) {
        pushReasoning('image_analysis', `Analyzing ${input.imageUrls.length} uploaded image(s)...`);
      }
      if (input.useResearch) {
        pushReasoning('research', `Running mini deep research (${input.researchSources ?? 5} sources)...`);
      }
      input.platforms.forEach((p) => {
        pushReasoning('writing', `Writing ${p.charAt(0).toUpperCase() + p.slice(1)} post...`);
      });

      const payload: { topic: string; platforms: string[]; imageUrls?: string[]; useResearch?: boolean; researchSources?: number; providerId?: string } = {
        topic: input.topic,
        platforms: input.platforms,
      };
      if (input.imageUrls) payload.imageUrls = input.imageUrls;
      if (input.useResearch !== undefined) payload.useResearch = input.useResearch;
      if (input.researchSources !== undefined) payload.researchSources = input.researchSources;
      if (state.activeProviderId) payload.providerId = state.activeProviderId;
      const result = await api.generateSocialPosts(payload);
      const posts = result.posts;
      const assistantMessage: ChatMessage = {
        id: `social-${Date.now()}`,
        conversationId: result.conversationId,
        role: 'assistant',
        content: JSON.stringify(posts),
        metadata: { type: 'social_posts' },
        createdAt: new Date().toISOString(),
      };
      set((current) => ({
        messages: [
          ...current.messages.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistant.id),
          optimisticUser,
          assistantMessage,
        ],
        activeConversationId: result.conversationId,
        lastResearchContext: result.researchContext ?? '',
      }));
      const { conversations } = await api.listConversations();
      set({ conversations });
    } catch (error) {
      set((current) => ({
        messages: current.messages.map((m) =>
          m.id === optimisticAssistant.id
            ? { ...m, content: `\u274c **Social generation failed:** ${error instanceof Error ? error.message : 'Unknown error'}` }
            : m
        ),
      }));
    } finally {
      set({ isStreaming: false });
    }
  },
  async startResearch(plan) {
    const state = get();
    if (!state.pendingPlan) return;
    const { jobId, conversationId, question } = state.pendingPlan;
    set({ pendingPlan: null, isStreaming: true, reasoning: [], sources: [], error: undefined });

    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId,
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
    };
    set((current) => ({
      messages: [...current.messages, optimisticUser],
      activeConversationId: conversationId,
    }));

    await api.startResearch(jobId, plan);

    let assistantId = jobId;
    let assistantContent = '';
    const handleEvent = (event: StreamEvent) => {
      if (event.type === 'start') {
        assistantId = event.messageId;
        set((current) => ({
          activeConversationId: event.conversationId,
          messages: [...current.messages, {
            id: assistantId,
            conversationId: event.conversationId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          }],
          researchDrawerOpen: true,
          searchIterations: [],
        }));
      }
      if (event.type === 'delta') {
        assistantContent += event.content;
        set((current) => ({
          messages: current.messages.map((message) => message.id === assistantId ? { ...message, content: assistantContent } : message),
        }));
      }
      if (event.type === 'reasoning') {
        set((current) => ({ reasoning: [...current.reasoning, { id: `${Date.now()}-${current.reasoning.length}`, step: event.step, detail: event.detail, iteration: event.iteration }] }));
        const step = event.step;
        const iteration = event.iteration;
        const detail = event.detail;
        if (step?.startsWith('Searching ') && iteration !== undefined && detail) {
          set((current) => {
            const channel = step.replace('Searching ', '');
            if (current.searchIterations.some((si) => si.id === iteration)) return current;
            return {
              searchIterations: [...current.searchIterations, {
                id: iteration,
                channel,
                query: detail,
                status: 'searching' as const,
                resultCount: 0,
                results: [],
              }],
            };
          });
        }
        if (step === 'Reviewing findings' && iteration !== undefined) {
          set((current) => ({
            searchIterations: current.searchIterations.map((si) =>
              si.id === iteration ? { ...si, status: 'found' as const } : si
            ),
          }));
        }
      }
      if (event.type === 'source') {
        set((current) => {
          const updatedSources = [...current.sources, event.source];
          const updatedMessages = current.messages.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    sources: [...((msg.metadata?.sources as ResearchSource[] | undefined) ?? []), event.source],
                  },
                }
              : msg
          );
          return { sources: updatedSources, messages: updatedMessages };
        });
        const sourceIteration = event.iteration;
        if (sourceIteration !== undefined) {
          set((current) => ({
            searchIterations: current.searchIterations.map((si) =>
              si.id === sourceIteration
                ? { ...si, results: [...si.results, event.source], resultCount: si.resultCount + 1 }
                : si
            ),
          }));
        }
      }
      if (event.type === 'done') {
        set((current) => {
          const updatedMessages = event.sources
            ? current.messages.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, metadata: { ...msg.metadata, sources: event.sources } }
                  : msg
              )
            : current.messages;
          return { sources: event.sources ?? current.sources, isStreaming: false, messages: updatedMessages };
        });
      }
      if (event.type === 'error') {
        set({ error: event.message });
      }
    };

    try {
      await streamResearch(jobId, handleEvent);
      const { conversations } = await api.listConversations();
      set({ conversations });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Research failed' });
    } finally {
      set({ isStreaming: false });
    }
  },
  cancelPlan() {
    set({ pendingPlan: null });
  },
  setMode(mode) {
    set({ mode });
  },
  setActiveProvider(id) {
    set({ activeProviderId: id });
  },
  setImageOptions(options) {
    set({ imageOptions: options });
  },
  async renameConversation(id, title) {
    await api.renameConversation(id, title);
    const { conversations } = await api.listConversations();
    set({ conversations });
  },
  async togglePinConversation(id, pinned) {
    await api.setPinned(id, pinned);
    const { conversations } = await api.listConversations();
    set({ conversations });
  },
  async deleteConversation(id) {
    await api.deleteConversation(id);
    const { conversations } = await api.listConversations(get().activeProjectId);
    set((current) => ({
      conversations,
      activeConversationId: current.activeConversationId === id ? undefined : current.activeConversationId,
      messages: current.activeConversationId === id ? [] : current.messages,
    }));
  },
  async deleteAllConversations() {
    if (!confirm('Are you sure you want to delete ALL conversations? This cannot be undone.')) return;
    await api.deleteAllConversations();
    set({ conversations: [], messages: [], activeConversationId: undefined });
  },
  async setActiveProject(id) {
    set({ activeProjectId: id });
    const { conversations } = await api.listConversations(id);
    set({ conversations });
  },
  async assignConversationToProject(conversationId, projectId) {
    await api.setConversationProject(conversationId, projectId);
    const { conversations } = await api.listConversations(get().activeProjectId);
    set({ conversations });
  },
  async createProject(name) {
    const { project } = await api.createProject(name);
    set((current) => ({ projects: [...current.projects, project] }));
  },
  async deleteProject(id) {
    if (!confirm('Delete this project? Conversations will remain but be unassigned.')) return;
    await api.deleteProject(id);
    set((current) => ({
      projects: current.projects.filter((p) => p.id !== id),
      activeProjectId: current.activeProjectId === id ? undefined : current.activeProjectId,
    }));
    const { conversations } = await api.listConversations(get().activeProjectId);
    set({ conversations });
  },
  enterEditMode(filenames) {
    set({ editingImages: filenames, mode: 'IMAGE_GENERATION' });
  },
  exitEditMode() {
    set({ editingImages: [] });
  },
  addEditingImage(filename) {
    set((current) => ({
      editingImages: current.editingImages.length < 8 ? [...current.editingImages, filename] : current.editingImages,
    }));
  },
  removeEditingImage(filename) {
    set((current) => ({
      editingImages: current.editingImages.filter((f) => f !== filename),
    }));
  },
  openDiagnosticsPanel(conversationId, messageId) {
    set({ diagnosticsPanelOpen: true, diagnosticsConversationId: conversationId, diagnosticsMessageId: messageId });
  },
  closeDiagnosticsPanel() {
    set({ diagnosticsPanelOpen: false });
  },
  toggleResearchDrawer() {
    set((current) => ({ researchDrawerOpen: !current.researchDrawerOpen }));
  },
  selectArtifact(id) {
    set({ selectedArtifactId: id });
  },
  toggleArtifactPanel() {
    set((current) => ({ artifactPanelOpen: !current.artifactPanelOpen }));
  },
  closeArtifactPanel() {
    set({ artifactPanelOpen: false, selectedArtifactId: undefined });
  },
  clearChat() {
    set({ messages: [], activeConversationId: undefined, reasoning: [], sources: [], searchIterations: [], researchDrawerOpen: false, pendingPlan: null, artifacts: [], artifactPanelOpen: false, selectedArtifactId: undefined, diagnosticsPanelOpen: false });
  },
}));
