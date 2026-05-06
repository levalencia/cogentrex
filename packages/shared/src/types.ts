export type UserRole = 'USER' | 'ADMIN';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type AppMode = 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION';

export interface ProviderConfigView {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  kind: 'OPENAI_COMPATIBLE' | 'ANTHROPIC' | 'GOOGLE' | 'AZURE_FOUNDRY' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION';
  isDefault: boolean;
  isGlobal: boolean;
  defaultForMode: 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | null;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsSearch: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  testStatus: 'ok' | 'fail' | null;
  testedAt: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: AppMode;
  isPinned: boolean;
  isPublic: boolean;
  shareToken: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type StreamEvent =
  | { type: 'start'; conversationId: string; messageId: string; mode: 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' }
  | { type: 'delta'; content: string }
  | { type: 'reasoning'; step: string; detail?: string; iteration?: number }
  | { type: 'source'; source: ResearchSource }
  | { type: 'artifact'; filename: string; language?: string; artifactType: string; content: string }
  | { type: 'done'; content: string; sources?: ResearchSource[]; title?: string }
  | { type: 'error'; code: string; message: string };

export interface ArtifactItem {
  id: string;
  conversationId: string;
  messageId: string;
  type: string;
  filename: string;
  language?: string | undefined;
  content: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ResearchSource {
  id: number;
  title: string;
  url: string;
  snippet?: string | undefined;
  channel?: string | undefined;
}

export interface RequestMetric {
  id: string;
  conversationId?: string | undefined;
  messageId?: string | undefined;
  providerId?: string | undefined;
  model?: string | undefined;
  mode?: string | undefined;
  step: string;
  durationMs?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
  ttftMs?: number | undefined;
  tps?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface MediaArtifact {
  id: string;
  userId: string;
  conversationId?: string | undefined;
  prompt: string;
  type: 'image' | 'video';
  providerId: string;
  blobUrl?: string | undefined;
  localPath?: string | undefined;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface ImageGenerationOptions {
  size?: string | undefined;
  quality?: 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto' | undefined;
  n?: number | undefined;
  style?: 'vivid' | 'natural' | undefined;
  responseFormat?: 'url' | 'b64_json' | undefined;
  inputImages?: string[] | undefined;
}

export interface ImageUploadResult {
  filename: string;
  url: string;
}

export interface SocialPlatformConfig {
  platform: 'linkedin' | 'x' | 'medium' | 'reddit' | 'substack';
  label: string;
  icon: string;
  systemPrompt: string;
  isEnabled: boolean;
}

export interface GeneratedPost {
  platform: string;
  content: string;
  characterCount: number;
}
