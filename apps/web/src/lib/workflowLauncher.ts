import type { AppMode } from '@cogentrex/shared';

export type LauncherItemStatus = 'available' | 'near_existing';
export type LauncherItemTone = 'slate' | 'emerald' | 'blue' | 'purple' | 'pink' | 'amber';

export interface LauncherItem {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  mode: AppMode;
  status: LauncherItemStatus;
  tone: LauncherItemTone;
  placeholder: string;
}

const launcherItems: LauncherItem[] = [
  {
    id: 'ask-chat',
    label: 'Ask / Chat',
    eyebrow: 'Fast answer',
    description: 'Provider-routed answers, files, image context, and artifact drafting.',
    mode: 'CHAT',
    status: 'available',
    tone: 'slate',
    placeholder: 'Ask Cogentrex... (Press Enter to send)',
  },
  {
    id: 'deep-research',
    label: 'Deep Research',
    eyebrow: 'Evidence loop',
    description: 'Plan searches, gather sources, show reasoning, and synthesize citations.',
    mode: 'DEEP_RESEARCH',
    status: 'available',
    tone: 'emerald',
    placeholder: 'What should Cogentrex research with sources?',
  },
  {
    id: 'social-writer',
    label: 'LinkedIn / Social Writer',
    eyebrow: 'Publishable draft',
    description: 'Create platform-aware posts with optional mini research and image context.',
    mode: 'SOCIAL_WRITING',
    status: 'available',
    tone: 'blue',
    placeholder: 'Topic or idea for your social posts...',
  },
  {
    id: 'image-studio',
    label: 'Image Studio',
    eyebrow: 'Visual output',
    description: 'Generate or edit images with the configured image-capable provider.',
    mode: 'IMAGE_GENERATION',
    status: 'available',
    tone: 'purple',
    placeholder: 'Describe the image you want to generate...',
  },
  {
    id: 'video-studio',
    label: 'Video Studio',
    eyebrow: 'Motion output',
    description: 'Generate short videos with the configured video-capable provider.',
    mode: 'VIDEO_GENERATION',
    status: 'available',
    tone: 'pink',
    placeholder: 'Describe the video you want to generate...',
  },
  {
    id: 'artifact-brief',
    label: 'Brief / Artifact Writer',
    eyebrow: 'Structured output',
    description: 'Draft memos, briefs, and reusable outputs from the chat workspace.',
    mode: 'CHAT',
    status: 'near_existing',
    tone: 'amber',
    placeholder: 'What brief, memo, or artifact should Cogentrex draft?',
  },
];

export function getLauncherItems(): LauncherItem[] {
  return launcherItems.map((item) => ({ ...item }));
}

export function getPrimaryLauncherItems(): LauncherItem[] {
  return getLauncherItems().filter((item) => item.status === 'available');
}

export function getLauncherItem(id: string): LauncherItem | undefined {
  return getLauncherItems().find((item) => item.id === id);
}

export function getDefaultLauncherIdForMode(mode: AppMode): string {
  return getPrimaryLauncherItems().find((item) => item.mode === mode)?.id ?? 'ask-chat';
}

export function getLauncherPlaceholder(itemId: string): string {
  return getLauncherItem(itemId)?.placeholder ?? 'Ask Cogentrex... (Press Enter to send)';
}

export function getLauncherToneClasses(tone: LauncherItemTone, active: boolean): string {
  if (!active) return 'border-line bg-panel/40 text-slate-400 hover:border-slate-600 hover:text-slate-200';
  const activeClasses: Record<LauncherItemTone, string> = {
    slate: 'border-slate-200 bg-slate-100 text-ink',
    emerald: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-100',
    blue: 'border-blue-500/30 bg-blue-500/20 text-blue-100',
    purple: 'border-purple-500/30 bg-purple-500/20 text-purple-100',
    pink: 'border-pink-500/30 bg-pink-500/20 text-pink-100',
    amber: 'border-amber-500/30 bg-amber-500/20 text-amber-100',
  };
  return activeClasses[tone];
}
