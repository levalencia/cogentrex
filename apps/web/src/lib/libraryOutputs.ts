import type { AppMode, ArtifactItem, SkillRunSummary } from '@cogentrex/shared';

interface ConversationLike {
  id?: string;
  title?: string;
  mode: AppMode;
  updatedAt?: string;
}

export interface LibraryArtifactRow {
  id: string;
  filename: string;
  subtitle: string;
  sizeLabel: string;
  conversationHref: string;
  preview: string;
}

export interface LibraryModeCard {
  id: 'research' | 'social' | 'media' | 'chat';
  label: string;
  count: number;
  description: string;
}

export interface LibraryOverviewStats {
  totalWorkflows: number;
  savedArtifacts: number;
  savedPerWorkflowLabel: string;
  latestActivityAt: string | null;
}

export interface ArtifactDownload {
  filename: string;
  content: string;
  mimeType: string;
}

export interface RecentActivityItem {
  id: string;
  kind: 'workflow' | 'artifact';
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  timestamp: string;
  mode?: AppMode | undefined;
}

export interface SkillRunHealthStats {
  totalRuns: number;
  completedRuns: number;
  activeRuns: number;
  failedRuns: number;
  latestRunAt: string | null;
}

export interface SkillRunHistoryRow {
  id: string;
  skillName: string;
  modeLabel: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'danger' | 'neutral';
  summary: string;
  durationLabel: string;
  timestamp: string;
  href: string;
  metrics: string[];
}

export interface SkillRunDetail {
  id: string;
  skillName: string;
  skillSlug: string;
  modeLabel: string;
  statusLabel: string;
  statusTone: SkillRunHistoryRow['statusTone'];
  summary: string;
  startedAt: string;
  completedAt: string | null;
  durationLabel: string;
  conversationHref: string | null;
  jobId: string | null;
  providerId: string | null;
  errorMessage: string | null;
  metrics: string[];
  observabilityEntries: Array<{ key: string; value: string }>;
}

export type SkillRunStatusFilter = 'all' | 'active' | SkillRunSummary['status'];

export interface SkillRunFilterInput {
  query: string;
  status: SkillRunStatusFilter;
  mode: AppMode | 'all';
}

function buildSkillRunModeByConversationId(skillRuns: SkillRunSummary[], completedOnly = false): Map<string, AppMode> {
  const byConversationId = new Map<string, { mode: AppMode; timestamp: string }>();

  for (const run of skillRuns) {
    if (!run.conversationId) continue;
    if (completedOnly && run.status !== 'completed') continue;
    const timestamp = run.completedAt ?? run.startedAt;
    const existing = byConversationId.get(run.conversationId);
    if (!existing || new Date(timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      byConversationId.set(run.conversationId, { mode: run.mode, timestamp });
    }
  }

  return new Map(Array.from(byConversationId.entries()).map(([conversationId, value]) => [conversationId, value.mode]));
}

function effectiveConversationMode(conversation: ConversationLike, skillRunsByConversationId: Map<string, AppMode>): AppMode {
  return conversation.id ? skillRunsByConversationId.get(conversation.id) ?? conversation.mode : conversation.mode;
}

function effectiveArtifactMode(artifact: ArtifactItem, skillRunsByConversationId: Map<string, AppMode>): AppMode | undefined {
  return artifact.effectiveMode ?? skillRunsByConversationId.get(artifact.conversationId) ?? artifact.conversationMode;
}

function artifactProvenanceLabel(artifact: ArtifactItem, mode: AppMode | undefined): string {
  const labels = [artifact.conversationTitle ?? 'Untitled output', modeLabel(mode)];
  if (artifact.skillRunName && artifact.skillRunStatus) {
    labels.push(`${artifact.skillRunName} ${artifact.skillRunStatus}`);
  } else if (artifact.skillRunName) {
    labels.push(artifact.skillRunName);
  }
  return labels.join(' · ');
}

export function buildLibraryModeCards(conversations: ConversationLike[], skillRuns: SkillRunSummary[] = []): LibraryModeCard[] {
  const skillRunsByConversationId = buildSkillRunModeByConversationId(skillRuns);
  const conversationModes = conversations.map((conversation) => effectiveConversationMode(conversation, skillRunsByConversationId));
  const linkedConversationIds = new Set(conversations.map((conversation) => conversation.id).filter((id): id is string => Boolean(id)));
  const standaloneRunModes = skillRuns
    .filter((run) => !run.conversationId || !linkedConversationIds.has(run.conversationId))
    .map((run) => run.mode);
  const modes = [...conversationModes, ...standaloneRunModes];
  const research = modes.filter((mode) => mode === 'DEEP_RESEARCH').length;
  const social = modes.filter((mode) => mode === 'SOCIAL_WRITING').length;
  const media = modes.filter((mode) => mode === 'IMAGE_GENERATION' || mode === 'VIDEO_GENERATION').length;
  const chat = modes.filter((mode) => mode === 'CHAT').length;

  return [
    {
      id: 'research',
      label: 'Research briefs',
      count: research,
      description: 'Deep research answers, sources, citations, and traceable reasoning.',
    },
    {
      id: 'social',
      label: 'Social drafts',
      count: social,
      description: 'LinkedIn, X, Medium, Reddit, and Substack drafts from chat workflows.',
    },
    {
      id: 'media',
      label: 'Media outputs',
      count: media,
      description: 'Generated image and video conversations ready to reuse.',
    },
    {
      id: 'chat',
      label: 'Chat artifacts',
      count: chat,
      description: 'General answers and reusable notes that do not fit a specialist workflow.',
    },
  ];
}

export function buildLibraryOverviewStats(conversations: ConversationLike[], artifacts: ArtifactItem[], skillRuns: SkillRunSummary[] = []): LibraryOverviewStats {
  const timestampValues = [
    ...conversations.map((conversation) => conversation.updatedAt),
    ...artifacts.map((artifact) => artifact.createdAt),
    ...skillRuns.map((run) => run.completedAt ?? run.startedAt),
  ].filter((value): value is string => Boolean(value));
  const totalWorkflows = conversations.length + skillRuns.filter((run) => !run.conversationId).length;
  const latestActivityAt = timestampValues.length ? sortTimestampDesc(timestampValues.map((timestamp) => ({ timestamp })))[0]?.timestamp ?? null : null;
  const savedPerWorkflow = totalWorkflows ? (artifacts.length / totalWorkflows).toFixed(1) : '0.0';

  return {
    totalWorkflows,
    savedArtifacts: artifacts.length,
    savedPerWorkflowLabel: savedPerWorkflow,
    latestActivityAt,
  };
}

function modeLabel(mode: AppMode | undefined): string {
  return mode ? mode.replace('_', ' ') : 'UNKNOWN MODE';
}

function readNumericMetric(observability: Record<string, unknown> | null, key: string): number | null {
  const value = observability?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function durationLabel(durationMs: number | null | undefined): string {
  if (durationMs == null) return '—';
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function compactNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function skillRunStatusLabel(status: SkillRunSummary['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  return 'Pending';
}

function skillRunStatusTone(status: SkillRunSummary['status']): SkillRunHistoryRow['statusTone'] {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'warning';
  return 'neutral';
}

function skillRunMetrics(observability: Record<string, unknown> | null): string[] {
  const metrics: string[] = [];
  const sourceCount = readNumericMetric(observability, 'sourceCount');
  const newSourceCount = readNumericMetric(observability, 'newSourceCount');
  const planLength = readNumericMetric(observability, 'planLength');
  const estimatedTokens = readNumericMetric(observability, 'estimatedTokens');
  const synthesisDurationMs = readNumericMetric(observability, 'synthesisDurationMs');
  const postCount = readNumericMetric(observability, 'postCount');
  const promptLength = readNumericMetric(observability, 'promptLength');
  const savedArtifactCount = readNumericMetric(observability, 'savedArtifactCount');

  if (sourceCount != null) metrics.push(`${sourceCount} sources`);
  if (newSourceCount != null) metrics.push(`${newSourceCount} new`);
  if (planLength != null) metrics.push(`${planLength} plan steps`);
  if (estimatedTokens != null) metrics.push(`${compactNumber(estimatedTokens)} tokens`);
  if (synthesisDurationMs != null) metrics.push(`${durationLabel(synthesisDurationMs)} synthesis`);
  if (postCount != null) metrics.push(`${postCount} posts`);
  if (promptLength != null) metrics.push(`${promptLength} prompt chars`);

  const platforms = observability?.platforms;
  if (Array.isArray(platforms) && platforms.length) metrics.push(`${platforms.length} platforms`);
  if (savedArtifactCount != null) metrics.push(`${savedArtifactCount} saved ${savedArtifactCount === 1 ? 'artifact' : 'artifacts'}`);

  return metrics;
}

function formatObservabilityValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatObservabilityValue).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function skillRunObservabilityEntries(observability: Record<string, unknown> | null): SkillRunDetail['observabilityEntries'] {
  if (!observability) return [];
  return Object.entries(observability)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value: formatObservabilityValue(value) }));
}

export function buildSkillRunDetail(run: SkillRunSummary): SkillRunDetail {
  return {
    id: run.id,
    skillName: run.skillName,
    skillSlug: run.skillSlug,
    modeLabel: modeLabel(run.mode),
    statusLabel: skillRunStatusLabel(run.status),
    statusTone: skillRunStatusTone(run.status),
    summary: skillRunSummary(run),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationLabel: durationLabel(run.durationMs),
    conversationHref: run.conversationId ? `/chats/${run.conversationId}` : null,
    jobId: run.jobId,
    providerId: run.providerId,
    errorMessage: run.errorMessage,
    metrics: skillRunMetrics(run.observability),
    observabilityEntries: skillRunObservabilityEntries(run.observability),
  };
}

function skillRunSummary(run: SkillRunSummary): string {
  if (run.status === 'failed') return run.errorMessage ?? 'Run failed before producing an output.';
  if (run.status === 'running') return 'Run is currently in progress.';
  if (run.status === 'pending') return 'Run is queued and waiting to start.';
  const sourceCount = readNumericMetric(run.observability, 'sourceCount');
  if (sourceCount != null) return `Completed with ${sourceCount} sources.`;
  return 'Completed skill run.';
}

export function filterSkillRuns(skillRuns: SkillRunSummary[], filters: SkillRunFilterInput): SkillRunSummary[] {
  const query = filters.query.trim().toLowerCase();
  const matchesStatus = (run: SkillRunSummary) => {
    if (filters.status === 'all') return true;
    if (filters.status === 'active') return run.status === 'pending' || run.status === 'running';
    return run.status === filters.status;
  };
  const matchesMode = (run: SkillRunSummary) => filters.mode === 'all' || run.mode === filters.mode;
  const matchesQuery = (run: SkillRunSummary) => !query || skillRunSearchableText(run).includes(query);

  return sortTimestampDesc(skillRuns
    .filter((run) => matchesStatus(run) && matchesMode(run) && matchesQuery(run))
    .map((run) => ({ run, timestamp: run.completedAt ?? run.startedAt })))
    .map(({ run }) => run);
}

function skillRunSearchableText(run: SkillRunSummary): string {
  return [
    run.skillName,
    run.skillSlug,
    run.mode,
    run.status,
    run.providerId,
    run.jobId,
    run.errorMessage,
    run.observability ? JSON.stringify(run.observability) : null,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function buildSkillRunHealthStats(skillRuns: SkillRunSummary[]): SkillRunHealthStats {
  const timestampValues = skillRuns.map((run) => run.completedAt ?? run.startedAt);
  return {
    totalRuns: skillRuns.length,
    completedRuns: skillRuns.filter((run) => run.status === 'completed').length,
    activeRuns: skillRuns.filter((run) => run.status === 'pending' || run.status === 'running').length,
    failedRuns: skillRuns.filter((run) => run.status === 'failed').length,
    latestRunAt: timestampValues.length ? sortTimestampDesc(timestampValues.map((timestamp) => ({ timestamp })))[0]?.timestamp ?? null : null,
  };
}

export function buildSkillRunHistoryRows(skillRuns: SkillRunSummary[], limit = 6): SkillRunHistoryRow[] {
  return sortTimestampDesc(skillRuns.map((run) => ({ run, timestamp: run.completedAt ?? run.startedAt })))
    .slice(0, limit)
    .map(({ run, timestamp }) => ({
      id: run.id,
      skillName: run.skillName,
      modeLabel: modeLabel(run.mode),
      statusLabel: skillRunStatusLabel(run.status),
      statusTone: skillRunStatusTone(run.status),
      summary: skillRunSummary(run),
      durationLabel: durationLabel(run.durationMs),
      timestamp,
      href: run.conversationId ? `/chats/${run.conversationId}` : '/',
      metrics: skillRunMetrics(run.observability),
    }));
}

function workflowActivityDescription(mode: AppMode): string {
  if (mode === 'DEEP_RESEARCH') return 'Research run with sources, reasoning, and synthesis available in its chat context.';
  if (mode === 'SOCIAL_WRITING') return 'Social writing workflow with reusable platform draft context.';
  if (mode === 'IMAGE_GENERATION') return 'Image generation workflow output and prompt context.';
  if (mode === 'VIDEO_GENERATION') return 'Video generation workflow output and prompt context.';
  return 'Chat workflow with reusable answer context.';
}

function skillRunDescription(run: SkillRunSummary): string {
  if (run.status === 'failed') return run.errorMessage ? `Failed: ${run.errorMessage}` : 'Skill run failed before producing an output.';
  if (run.status === 'running') return 'Skill run is currently in progress.';
  if (run.status === 'pending') return 'Skill run is queued and waiting to start.';
  const durationLabel = run.durationMs == null ? null : `${Math.round(run.durationMs / 1000)}s`;
  return durationLabel ? `Completed skill run in ${durationLabel}.` : 'Completed skill run.';
}

function sortTimestampDesc<T extends { timestamp: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function sizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function textPreview(content: string): string {
  return content
    .replace(/[#*_`>\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'No preview available';
}

function searchableText(artifact: ArtifactItem): string {
  return [
    artifact.filename,
    artifact.conversationTitle,
    artifact.conversationMode,
    artifact.content,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function mergeLibraryArtifacts(fetchedArtifacts: ArtifactItem[], workspaceArtifacts: ArtifactItem[]): ArtifactItem[] {
  const byId = new Map<string, ArtifactItem>();
  const bySignature = new Map<string, ArtifactItem>();

  for (const artifact of [...fetchedArtifacts, ...workspaceArtifacts]) {
    const signature = artifactSignature(artifact);
    const existing = byId.get(artifact.id) ?? bySignature.get(signature);
    const merged = existing ? mergeArtifact(existing, artifact) : artifact;
    byId.set(merged.id, merged);
    bySignature.set(signature, merged);
    if (existing && existing.id !== merged.id) byId.delete(existing.id);
  }

  return sortTimestampDesc(Array.from(byId.values()).map((artifact) => ({ ...artifact, timestamp: artifact.createdAt })))
    .map(({ timestamp: _timestamp, ...artifact }) => artifact);
}

function artifactSignature(artifact: ArtifactItem): string {
  return [artifact.conversationId, artifact.messageId, artifact.filename, artifact.content].join('\u0000');
}

function mergeArtifact(existing: ArtifactItem, incoming: ArtifactItem): ArtifactItem {
  const existingIsLive = existing.id.startsWith('live-');
  const incomingIsPersisted = !incoming.id.startsWith('live-');
  const base = existingIsLive && incomingIsPersisted ? incoming : existing;
  const fallback = base === existing ? incoming : existing;

  return {
    ...fallback,
    ...base,
    conversationTitle: base.conversationTitle ?? fallback.conversationTitle,
    conversationMode: base.conversationMode ?? fallback.conversationMode,
    baseConversationMode: base.baseConversationMode ?? fallback.baseConversationMode,
    effectiveMode: base.effectiveMode ?? fallback.effectiveMode,
    skillRunId: base.skillRunId ?? fallback.skillRunId,
    skillRunName: base.skillRunName ?? fallback.skillRunName,
    skillRunStatus: base.skillRunStatus ?? fallback.skillRunStatus,
    language: base.language ?? fallback.language,
  };
}

export function getLibraryArtifactMode(artifact: ArtifactItem, skillRuns: SkillRunSummary[] = []): AppMode | undefined {
  return effectiveArtifactMode(artifact, buildSkillRunModeByConversationId(skillRuns));
}

export function buildLibraryArtifactRows(artifacts: ArtifactItem[], skillRuns: SkillRunSummary[] = []): LibraryArtifactRow[] {
  const skillRunsByConversationId = buildSkillRunModeByConversationId(skillRuns);
  return artifacts.map((artifact) => {
    const mode = effectiveArtifactMode(artifact, skillRunsByConversationId);
    return {
      id: artifact.id,
      filename: artifact.filename,
      subtitle: artifactProvenanceLabel(artifact, mode),
      sizeLabel: sizeLabel(artifact.sizeBytes),
      conversationHref: `/chats/${artifact.conversationId}`,
      preview: textPreview(artifact.content),
    };
  });
}

export function buildRecentActivityItems(
  conversations: ConversationLike[],
  artifacts: ArtifactItem[],
  skillRunsOrLimit: SkillRunSummary[] | number = [],
  limit = 8,
): RecentActivityItem[] {
  const skillRuns = Array.isArray(skillRunsOrLimit) ? skillRunsOrLimit : [];
  const activityLimit = typeof skillRunsOrLimit === 'number' ? skillRunsOrLimit : limit;
  const runConversationIds = new Set(skillRuns.map((run) => run.conversationId).filter((id): id is string => Boolean(id)));
  const workflowItems: RecentActivityItem[] = conversations
    .filter((conversation): conversation is ConversationLike & { id: string; updatedAt: string } => Boolean(conversation.id && conversation.updatedAt && !runConversationIds.has(conversation.id)))
    .map((conversation) => ({
      id: `workflow-${conversation.id}`,
      kind: 'workflow',
      title: conversation.title?.trim() || 'Untitled workflow',
      eyebrow: `${modeLabel(conversation.mode)} run`,
      description: workflowActivityDescription(conversation.mode),
      href: `/chats/${conversation.id}`,
      timestamp: conversation.updatedAt,
      mode: conversation.mode,
    }));

  const runItems: RecentActivityItem[] = skillRuns.map((run) => ({
    id: `skill-run-${run.id}`,
    kind: 'workflow',
    title: run.skillName,
    eyebrow: `${modeLabel(run.mode)} · ${run.status}`,
    description: skillRunDescription(run),
    href: run.conversationId ? `/chats/${run.conversationId}` : '/',
    timestamp: run.completedAt ?? run.startedAt,
    mode: run.mode,
  }));

  const skillRunsByConversationId = buildSkillRunModeByConversationId(skillRuns);
  const artifactItems: RecentActivityItem[] = artifacts.map((artifact) => {
    const mode = effectiveArtifactMode(artifact, skillRunsByConversationId);
    return {
      id: `artifact-${artifact.id}`,
      kind: 'artifact',
      title: artifact.filename,
      eyebrow: 'Saved artifact',
      description: artifactProvenanceLabel(artifact, mode),
      href: `/chats/${artifact.conversationId}`,
      timestamp: artifact.createdAt,
      mode,
    };
  });

  return sortTimestampDesc([...artifactItems, ...runItems, ...workflowItems]).slice(0, activityLimit);
}

export function filterLibraryArtifacts(artifacts: ArtifactItem[], query: string): ArtifactItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return artifacts;
  return artifacts.filter((artifact) => searchableText(artifact).includes(normalized));
}

export function buildArtifactDownload(artifact: ArtifactItem): ArtifactDownload {
  const filename = artifact.filename.trim() || 'artifact.md';
  return {
    filename: filename.toLowerCase().endsWith('.md') ? filename : `${filename}.md`,
    content: artifact.content,
    mimeType: 'text/markdown;charset=utf-8',
  };
}
