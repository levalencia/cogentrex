import type { AdminAnalyticsSummary, ArtifactItem, ChatMessage, ConversationSummary, MediaArtifact, ProjectSummary, ProviderConfigView, PublicUser, RequestMetric, StreamEvent, ImageGenerationOptions, GeneratedPost, SocialPlatformConfig, WorkflowReadiness, SkillDetail, SkillReadiness, SkillSummary, SkillFileSummary, CreateSkillInput, ImportSkillKitInput, UpdateSkillInput, UpdateSkillRouteInput, WorkflowRunDetailResponse, WorkflowRunEventsResponse, WorkflowRunListResponse } from '@cogentrex/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Request failed with ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string) => jsonRequest<{ user: PublicUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  login: (email: string, password: string) => jsonRequest<{ user: PublicUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  logout: () => jsonRequest<void>('/api/auth/logout', { method: 'POST' }),
  me: () => jsonRequest<{ user: PublicUser }>('/api/auth/me'),
  defaultProviderTemplate: () => jsonRequest<{ provider: { name: string; baseUrl: string; model: string; kind: ProviderConfigView['kind'] } }>('/api/default-provider-template'),
  listProviders: () => jsonRequest<{ providers: ProviderConfigView[] }>('/api/providers'),
  createProvider: (input: { name: string; baseUrl: string; apiKey: string; model: string; kind: ProviderConfigView['kind']; isDefault: boolean; defaultForMode?: 'CHAT' | 'DEEP_RESEARCH'; supportsStreaming?: boolean; supportsVision?: boolean; supportsTools?: boolean; supportsSearch?: boolean; supportsImage?: boolean; supportsVideo?: boolean }) =>
    jsonRequest<{ provider: ProviderConfigView }>('/api/providers', { method: 'POST', body: JSON.stringify(input) }),
  setDefaultProvider: (id: string) =>
    jsonRequest<{ provider: ProviderConfigView }>(`/api/providers/${id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }),
  testProvider: (id: string) => jsonRequest<{ ok: boolean; status: 'ok' | 'fail'; error?: string }>(`/api/providers/${id}/test`, { method: 'POST' }),
  getCatalog: () => jsonRequest<{ catalog: { id: string; name: string; description: string; kind: ProviderConfigView['kind']; baseUrl?: string; baseUrlTemplate?: string; models: string[]; features: { chat: boolean; vision: boolean; tools: boolean; image: boolean; video: boolean }; docsUrl: string }[] }>('/api/providers/catalog'),
  getCapabilities: () => jsonRequest<{ workflows: WorkflowReadiness[] }>('/api/capabilities'),
  getSkill: (slug: string) => jsonRequest<{ skill: SkillDetail }>(`/api/skills/${encodeURIComponent(slug)}`),
  getSkillReadiness: () => jsonRequest<{ skills: SkillReadiness[] }>('/api/skills/readiness'),
  listSkillRuns: () => jsonRequest<WorkflowRunListResponse>('/api/runs'),
  getSkillRun: (runId: string) => jsonRequest<WorkflowRunDetailResponse>(`/api/runs/${encodeURIComponent(runId)}`),
  listSkillRunEvents: (runId: string) => jsonRequest<WorkflowRunEventsResponse>(`/api/runs/${encodeURIComponent(runId)}/events`),
  getMetrics: (conversationId: string) => jsonRequest<{ metrics: RequestMetric[] }>(`/api/chat/conversations/${conversationId}/metrics`),
  getDiagnostics: (conversationId: string) => jsonRequest<{ metrics: RequestMetric[]; reasoning?: StreamEvent[] }>(`/api/chat/conversations/${conversationId}/diagnostics`),
  listConversations: (projectId?: string | null) => jsonRequest<{ conversations: ConversationSummary[] }>(`/api/chat/conversations${projectId !== undefined ? `?projectId=${projectId ?? 'null'}` : ''}`),
  listMessages: (conversationId: string) => jsonRequest<{ messages: ChatMessage[] }>(`/api/chat/conversations/${conversationId}/messages`),
  listArtifacts: (conversationId: string) => jsonRequest<{ artifacts: ArtifactItem[] }>(`/api/artifacts/conversation/${conversationId}`),
  listLibraryArtifacts: () => jsonRequest<{ artifacts: ArtifactItem[] }>('/api/artifacts'),
  saveArtifactFromMessage: (messageId: string) =>
    jsonRequest<{ artifact: ArtifactItem }>('/api/artifacts/from-message', { method: 'POST', body: JSON.stringify({ messageId }) }),
  renameConversation: (conversationId: string, title: string) => jsonRequest<void>(`/api/chat/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  setPinned: (conversationId: string, pinned: boolean) => jsonRequest<void>(`/api/chat/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ isPinned: pinned }) }),
  deleteConversation: (conversationId: string) => jsonRequest<void>(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' }),
  deleteAllConversations: () => jsonRequest<void>('/api/chat/conversations', { method: 'DELETE' }),
  setConversationProject: (conversationId: string, projectId: string | null) =>
    jsonRequest<void>(`/api/chat/conversations/${conversationId}/project`, { method: 'PATCH', body: JSON.stringify({ projectId }) }),
  planResearch: (content: string, providerId?: string, conversationId?: string, useSkills?: boolean, selectedSkillSlugs?: string[]) =>
    jsonRequest<{ plan: string[]; jobId: string; conversationId: string; priorSourceCount: number }>('/api/chat/plan', { method: 'POST', body: JSON.stringify({ content, providerId, conversationId, useSkills, selectedSkillSlugs }) }),
  startResearch: (jobId: string, plan: string[]) =>
    jsonRequest<{ started: boolean }>('/api/chat/research', { method: 'POST', body: JSON.stringify({ jobId, plan }) }),
  // Admin
  listAdminProviders: () => jsonRequest<{ providers: ProviderConfigView[] }>('/api/admin/providers'),
  listAdminAnalytics: () => jsonRequest<{ analytics: AdminAnalyticsSummary }>('/api/admin/analytics'),
  createAdminProvider: (input: { name: string; baseUrl: string; apiKey: string; model: string; kind: ProviderConfigView['kind']; defaultForMode?: 'CHAT' | 'DEEP_RESEARCH'; supportsStreaming?: boolean; supportsVision?: boolean; supportsTools?: boolean; supportsSearch?: boolean; supportsImage?: boolean; supportsVideo?: boolean }) =>
    jsonRequest<{ provider: ProviderConfigView }>('/api/admin/providers', { method: 'POST', body: JSON.stringify(input) }),
  updateAdminProvider: (id: string, input: Record<string, unknown>) =>
    jsonRequest<{ provider: ProviderConfigView }>(`/api/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteAdminProvider: (id: string) => jsonRequest<void>(`/api/admin/providers/${id}`, { method: 'DELETE' }),
  listAdminSkills: () => jsonRequest<{ skills: SkillSummary[]; admin: PublicUser }>('/api/admin/skills'),
  listAdminSkillFiles: (slug: string) => jsonRequest<{ files: SkillFileSummary[] }>(`/api/admin/skills/${slug}/files`),
  createAdminSkill: (input: CreateSkillInput) =>
    jsonRequest<{ skill: SkillSummary; files: SkillFileSummary[] }>(`/api/admin/skills`, { method: 'POST', body: JSON.stringify(input) }),
  importAdminSkillKit: (input: ImportSkillKitInput) =>
    jsonRequest<{ skill: SkillSummary; files: SkillFileSummary[]; warnings: string[] }>('/api/admin/skills/import-kit', { method: 'POST', body: JSON.stringify(input) }),
  updateAdminSkill: (slug: string, input: UpdateSkillInput) =>
    jsonRequest<{ skill: SkillSummary }>(`/api/admin/skills/${slug}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateAdminSkillRoute: (slug: string, input: UpdateSkillRouteInput) =>
    jsonRequest<{ route: SkillSummary['route'] }>(`/api/admin/skills/${slug}/route`, { method: 'PUT', body: JSON.stringify(input) }),
  // Media
  generateMedia: (input: { prompt: string; type: 'image' | 'video'; conversationId?: string | undefined; providerId?: string | undefined; options?: ImageGenerationOptions }) =>
    jsonRequest<{ messages: ChatMessage[]; conversationId: string; artifact: MediaArtifact }>('/api/media/generate', { method: 'POST', body: JSON.stringify(input) }),
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    return fetch(`${API_BASE_URL}/api/media/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Upload failed with ${res.status}`);
      }
      return res.json() as Promise<{ files: { filename: string; url: string }[] }>;
    });
  },
  analyzeImages: (filenames: string[]) =>
    jsonRequest<{ analysis: string }>('/api/media/analyze', { method: 'POST', body: JSON.stringify({ filenames }) }),
  enhancePrompt: (input: { prompt: string; style?: string; context?: string; providerId?: string; imageType?: string; targetProviderId?: string }) =>
    jsonRequest<{ prompt: string }>('/api/media/enhance-prompt', { method: 'POST', body: JSON.stringify(input) }),
  // Social Writing
  generateSocialPosts: (input: { topic: string; platforms: string[]; imageUrls?: string[]; useResearch?: boolean; researchSources?: number; providerId?: string }) =>
    jsonRequest<{ conversationId: string; posts: GeneratedPost[]; researchContext: string }>('/api/social/generate', { method: 'POST', body: JSON.stringify(input) }),
  getSocialConfig: () => jsonRequest<{ configs: SocialPlatformConfig[] }>('/api/social/config'),
  updateSocialConfig: (platform: string, input: { systemPrompt: string; isEnabled: boolean }) =>
    jsonRequest<void>(`/api/social/config/${platform}`, { method: 'PUT', body: JSON.stringify(input) }),
  // LinkedIn
  linkedinStatus: () => jsonRequest<{ connected: boolean; personUrn?: string | undefined; needsPersonUrn?: boolean | undefined }>('/api/linkedin/status'),
  linkedinDisconnect: () => jsonRequest<void>('/api/linkedin/disconnect', { method: 'POST' }),
  linkedinSetPersonUrn: (personUrn: string) => jsonRequest<void>('/api/linkedin/person-urn', { method: 'PUT', body: JSON.stringify({ personUrn }) }),
  postToLinkedIn: (input: { content: string; imageArtifactId?: string | undefined; visibility?: 'PUBLIC' | 'CONNECTIONS' }) =>
    jsonRequest<{ postId: string; posted: boolean }>('/api/linkedin/post', { method: 'POST', body: JSON.stringify(input) }),
  // Scheduled Posts
  listScheduledPosts: () => jsonRequest<{ posts: Array<{ id: string; platform: string; content: string; imageArtifactId: string | null; postAt: string; status: string; errorMessage: string | null; postedAt: string | null; createdAt: string }> }>('/api/scheduled-posts'),
  schedulePost: (input: { platform: string; content: string; imageArtifactId?: string | undefined; postAt: string }) =>
    jsonRequest<{ scheduled: boolean }>('/api/scheduled-posts', { method: 'POST', body: JSON.stringify(input) }),
  updateScheduledPost: (id: string, input: { content: string; imageArtifactId?: string | undefined; postAt?: string }) =>
    jsonRequest<void>(`/api/scheduled-posts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  cancelScheduledPost: (id: string) => jsonRequest<void>(`/api/scheduled-posts/${id}`, { method: 'DELETE' }),
  // Projects
  listProjects: () => jsonRequest<{ projects: ProjectSummary[] }>('/api/projects'),
  createProject: (name: string) => jsonRequest<{ project: ProjectSummary }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => jsonRequest<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  // Share
  shareConversation: (conversationId: string) =>
    jsonRequest<{ shareToken: string }>(`/api/chat/conversations/${conversationId}/share`, { method: 'POST' }),
  unshareConversation: (conversationId: string) =>
    jsonRequest<void>(`/api/chat/conversations/${conversationId}/share`, { method: 'DELETE' }),
  getSharedConversation: (token: string) =>
    fetch(`${API_BASE_URL}/api/chat/share/${token}`).then(async (res) => {
      if (!res.ok) throw new Error('Shared conversation not found');
      return res.json() as Promise<{ conversation: ConversationSummary; messages: ChatMessage[] }>;
    }),
};

export async function streamMessage(input: {
  content: string;
  mode: 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING';
  providerId?: string;
  conversationId?: string;
  useSkills?: boolean;
  selectedSkillSlug?: string;
  selectedSkillSlugs?: string[];
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) throw new Error('Could not start stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
      if (line) input.onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}

export async function streamResearch(jobId: string, onEvent: (event: StreamEvent) => void): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/research/${jobId}/stream`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok || !response.body) throw new Error('Could not start research stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}
