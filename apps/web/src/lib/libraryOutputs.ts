import type { AppMode, ArtifactItem } from '@cogentrex/shared';

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

export function buildLibraryModeCards(conversations: ConversationLike[]): LibraryModeCard[] {
  const research = conversations.filter((conversation) => conversation.mode === 'DEEP_RESEARCH').length;
  const social = conversations.filter((conversation) => conversation.mode === 'SOCIAL_WRITING').length;
  const media = conversations.filter((conversation) => conversation.mode === 'IMAGE_GENERATION' || conversation.mode === 'VIDEO_GENERATION').length;
  const chat = conversations.filter((conversation) => conversation.mode === 'CHAT').length;

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

export function buildLibraryOverviewStats(conversations: ConversationLike[], artifacts: ArtifactItem[]): LibraryOverviewStats {
  const timestampValues = [
    ...conversations.map((conversation) => conversation.updatedAt),
    ...artifacts.map((artifact) => artifact.createdAt),
  ].filter((value): value is string => Boolean(value));
  const latestActivityAt = timestampValues.length ? sortTimestampDesc(timestampValues.map((timestamp) => ({ timestamp })))[0]?.timestamp ?? null : null;
  const savedPerWorkflow = conversations.length ? (artifacts.length / conversations.length).toFixed(1) : '0.0';

  return {
    totalWorkflows: conversations.length,
    savedArtifacts: artifacts.length,
    savedPerWorkflowLabel: savedPerWorkflow,
    latestActivityAt,
  };
}

function modeLabel(mode: AppMode | undefined): string {
  return mode ? mode.replace('_', ' ') : 'UNKNOWN MODE';
}

function workflowActivityDescription(mode: AppMode): string {
  if (mode === 'DEEP_RESEARCH') return 'Research run with sources, reasoning, and synthesis available in its chat context.';
  if (mode === 'SOCIAL_WRITING') return 'Social writing workflow with reusable platform draft context.';
  if (mode === 'IMAGE_GENERATION') return 'Image generation workflow output and prompt context.';
  if (mode === 'VIDEO_GENERATION') return 'Video generation workflow output and prompt context.';
  return 'Chat workflow with reusable answer context.';
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

export function buildLibraryArtifactRows(artifacts: ArtifactItem[]): LibraryArtifactRow[] {
  return artifacts.map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    subtitle: `${artifact.conversationTitle ?? 'Untitled output'} · ${modeLabel(artifact.conversationMode)}`,
    sizeLabel: sizeLabel(artifact.sizeBytes),
    conversationHref: `/chats/${artifact.conversationId}`,
    preview: textPreview(artifact.content),
  }));
}

export function buildRecentActivityItems(
  conversations: ConversationLike[],
  artifacts: ArtifactItem[],
  limit = 8,
): RecentActivityItem[] {
  const workflowItems: RecentActivityItem[] = conversations
    .filter((conversation): conversation is ConversationLike & { id: string; updatedAt: string } => Boolean(conversation.id && conversation.updatedAt))
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

  const artifactItems: RecentActivityItem[] = artifacts.map((artifact) => ({
    id: `artifact-${artifact.id}`,
    kind: 'artifact',
    title: artifact.filename,
    eyebrow: 'Saved artifact',
    description: `${artifact.conversationTitle ?? 'Untitled output'} · ${modeLabel(artifact.conversationMode)}`,
    href: `/chats/${artifact.conversationId}`,
    timestamp: artifact.createdAt,
    mode: artifact.conversationMode,
  }));

  return sortTimestampDesc([...artifactItems, ...workflowItems]).slice(0, limit);
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
