import type { AppMode, ArtifactItem } from '@cogentrex/shared';

interface ConversationLike {
  mode: AppMode;
}

export interface LibraryArtifactRow {
  id: string;
  filename: string;
  subtitle: string;
  sizeLabel: string;
  conversationHref: string;
}

export interface LibraryModeCard {
  id: 'research' | 'social' | 'media' | 'chat';
  label: string;
  count: number;
  description: string;
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

function modeLabel(mode: AppMode | undefined): string {
  return mode ? mode.replace('_', ' ') : 'UNKNOWN MODE';
}

function sizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export function buildLibraryArtifactRows(artifacts: ArtifactItem[]): LibraryArtifactRow[] {
  return artifacts.map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    subtitle: `${artifact.conversationTitle ?? 'Untitled output'} · ${modeLabel(artifact.conversationMode)}`,
    sizeLabel: sizeLabel(artifact.sizeBytes),
    conversationHref: `/chats/${artifact.conversationId}`,
  }));
}
