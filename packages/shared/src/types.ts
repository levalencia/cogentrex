export type UserRole = 'USER' | 'ADMIN';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type AppMode = 'CHAT' | 'DEEP_RESEARCH' | 'SOCIAL_WRITING' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION';
export type SkillAssistMode = 'auto' | 'hybrid' | 'manual' | 'off';

export type SkillStatus = 'DRAFT' | 'STAGED' | 'PUBLISHED' | 'DISABLED';
export type SkillVisibility = 'ADMIN_ONLY' | 'USER_VISIBLE';
export type SkillKind = 'NATIVE' | 'IMPORTED';
export type SkillFileKind = 'skill' | 'reference' | 'template' | 'asset' | 'script';

export type WorkflowId = 'CHAT' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION' | 'SOCIAL_WRITING' | 'DEEP_RESEARCH';
export type ProviderCapabilityId = 'text' | 'streaming' | 'vision' | 'tool-calling' | 'provider-search' | 'image' | 'video';
export type ToolCapabilityId = 'web.search' | 'web.fetch' | 'web.extract';
export type CapabilityStatus = 'ready' | 'degraded' | 'missing';

export type SkillId = 'chat-general' | 'deep-research-default' | 'social-writing-default' | 'image-prompt-default' | 'video-prompt-default';

export interface SkillDefinition {
  id: SkillId;
  label: string;
  workflowId: WorkflowId;
  description: string;
  requiredProviderCapabilities: ProviderCapabilityId[];
  optionalProviderCapabilities: ProviderCapabilityId[];
  requiredToolCapabilities: ToolCapabilityId[];
  optionalToolCapabilities: ToolCapabilityId[];
  systemPromptModule?: string | undefined;
}

export interface SkillToolRequirement {
  name: string;
  required: boolean;
  description?: string | undefined;
}

export interface PromptTemplate {
  id: string;
  label: string;
  prompt: string;
  description?: string | undefined;
  visibleToUsers?: boolean | undefined;
}

export interface SkillPublishGateLastTest {
  runId: string;
  completedAt: string;
  testedRouteUpdatedAt: string;
  providerId?: string | null | undefined;
  model?: string | undefined;
  durationMs?: number | null | undefined;
}

export interface SkillPublishGate {
  status: 'passing' | 'stale' | 'untested';
  lastChangedAt: string | null;
  lastSuccessfulTest: SkillPublishGateLastTest | null;
  message: string;
}

export interface SkillImportSource {
  sourceUrl: string;
  sourceRef: string;
  sourcePath: string;
  lastImportedAt?: string | undefined;
}

export interface SkillProviderRouteConfig extends Record<string, unknown> {
  promptTemplates?: PromptTemplate[] | undefined;
  adminTestGate?: SkillPublishGateLastTest | undefined;
  importedSkillKit?: SkillImportSource | undefined;
  importWarnings?: string[] | undefined;
}

export interface SkillProviderRoute {
  id: string;
  skillId: string;
  mode: AppMode;
  defaultProviderId: string | null;
  searchProfile: string | null;
  maxBudgetCents: number | null;
  config: SkillProviderRouteConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: SkillKind;
  status: SkillStatus;
  visibility: SkillVisibility;
  category: string | null;
  icon: string | null;
  route: SkillProviderRoute | null;
  publishGate?: SkillPublishGate | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillSummary {
  inputSchema: Record<string, unknown> | null;
  outputContract: Record<string, unknown> | null;
  toolRequirements: SkillToolRequirement[];
}

export interface SkillFileSummary {
  id: string;
  skillId: string;
  path: string;
  kind: SkillFileKind;
  content: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  executable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillReadinessDependency {
  kind: 'provider' | 'tool';
  id: ProviderCapabilityId | ToolCapabilityId;
  label: string;
  required: boolean;
  status: CapabilityStatus;
  adapterId?: string | undefined;
  message?: string | undefined;
}

export interface SkillReadiness {
  skill: SkillSummary;
  status: CapabilityStatus;
  dependencies: SkillReadinessDependency[];
}

export type SkillRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SkillRunEvent {
  id: string;
  runId: string;
  userId: string;
  sequence: number;
  eventType: string;
  label: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SkillRunSummary {
  id: string;
  userId: string;
  skillId: string;
  skillSlug: string;
  skillName: string;
  mode: AppMode;
  status: SkillRunStatus;
  conversationId: string | null;
  jobId: string | null;
  providerId: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  observability: Record<string, unknown> | null;
  eventCount?: number;
}

export interface WorkflowRunListResponse {
  runs: SkillRunSummary[];
}

export interface WorkflowRunEventsResponse {
  events: SkillRunEvent[];
}

export interface WorkflowRunDetailResponse {
  run: SkillRunSummary;
  events: SkillRunEvent[];
}

export interface AdminAnalyticsTotals {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  activeRuns: number;
  successRate: number;
  averageDurationMs: number | null;
}

export interface AdminAnalyticsSkillRow {
  skillSlug: string;
  skillName: string;
  mode: AppMode;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  activeRuns: number;
  successRate: number;
  averageDurationMs: number | null;
  latestRunAt: string;
}

export interface AdminAnalyticsModeRow {
  mode: AppMode;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  activeRuns: number;
  successRate: number;
}

export interface AdminAnalyticsProviderRow {
  providerId: string;
  totalRuns: number;
  failedRuns: number;
  averageDurationMs: number | null;
  latestRunAt: string;
}

export interface AdminAnalyticsSummary {
  generatedAt: string;
  totals: AdminAnalyticsTotals;
  topSkills: AdminAnalyticsSkillRow[];
  modeBreakdown: AdminAnalyticsModeRow[];
  providerUsage: AdminAnalyticsProviderRow[];
  recentFailures: SkillRunSummary[];
}


export interface AdminSkillTestResponse {
  run: SkillRunSummary;
  output: string;
  prompt: string;
  skill: {
    slug: string;
    name: string;
  };
  provider: {
    id: string;
    name: string;
    model: string;
  };
  durationMs: number;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  label: string;
  description: string;
  requiredProviderCapabilities: ProviderCapabilityId[];
  optionalProviderCapabilities: ProviderCapabilityId[];
  requiredToolCapabilities: ToolCapabilityId[];
  optionalToolCapabilities: ToolCapabilityId[];
  defaultSkillId?: SkillId | undefined;
}

export interface CapabilityReadinessItem {
  id: ProviderCapabilityId | ToolCapabilityId;
  status: CapabilityStatus;
  adapterId?: string | undefined;
  message?: string | undefined;
}

export interface WorkflowReadiness {
  workflow: WorkflowDefinition;
  status: CapabilityStatus;
  providers: CapabilityReadinessItem[];
  tools: CapabilityReadinessItem[];
}

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
  | { type: 'diagnostic'; name: string; message?: string; iteration?: number; metadata?: Record<string, unknown> }
  | { type: 'source'; source: ResearchSource; iteration?: number; channel?: string }
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
  tags?: string[] | undefined;
  projectId?: string | null | undefined;
  projectName?: string | undefined;
  conversationTitle?: string | undefined;
  conversationMode?: AppMode | undefined;
  baseConversationMode?: AppMode | undefined;
  effectiveMode?: AppMode | undefined;
  skillRunId?: string | undefined;
  skillRunName?: string | undefined;
  skillRunStatus?: SkillRunStatus | undefined;
}

export interface ResearchSource {
  id: number;
  title: string;
  url: string;
  snippet?: string | undefined;
  channel?: string | undefined;
}

export interface SearchIteration {
  id: number;
  channel: string;
  query: string;
  status: 'searching' | 'found';
  resultCount: number;
  results: ResearchSource[];
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
