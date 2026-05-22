import type { AppMode, SkillStatus, SkillSummary, SkillVisibility, UpdateSkillInput, UpdateSkillRouteInput } from '@cogentrex/shared';

export interface SkillBadge {
  label: string;
  className: string;
}

export interface SkillUpdateDraft {
  status: SkillStatus;
  visibility: SkillVisibility;
  category: string;
  icon: string;
}

export interface SkillRouteDraft {
  mode: AppMode;
  defaultProviderId: string;
  searchProfile: string;
  maxBudgetCents: string;
  configJson: string;
}

const statusBadges: Record<SkillStatus, SkillBadge> = {
  DRAFT: { label: 'Draft', className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  STAGED: { label: 'Staged', className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200' },
  PUBLISHED: { label: 'Published', className: 'border-green-500/30 bg-green-500/10 text-green-200' },
  DISABLED: { label: 'Disabled', className: 'border-red-500/30 bg-red-500/10 text-red-200' },
};

const visibilityBadges: Record<SkillVisibility, SkillBadge> = {
  ADMIN_ONLY: { label: 'Admin only', className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  USER_VISIBLE: { label: 'User visible', className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' },
};

const modeLabels: Record<AppMode, string> = {
  CHAT: 'Chat',
  DEEP_RESEARCH: 'Deep Research',
  SOCIAL_WRITING: 'Social Writing',
  IMAGE_GENERATION: 'Image Generation',
  VIDEO_GENERATION: 'Video Generation',
};

export const appModeOptions: { value: AppMode; label: string }[] = [
  { value: 'CHAT', label: modeLabels.CHAT },
  { value: 'DEEP_RESEARCH', label: modeLabels.DEEP_RESEARCH },
  { value: 'SOCIAL_WRITING', label: modeLabels.SOCIAL_WRITING },
  { value: 'IMAGE_GENERATION', label: modeLabels.IMAGE_GENERATION },
  { value: 'VIDEO_GENERATION', label: modeLabels.VIDEO_GENERATION },
];

export function formatSkillMode(mode: AppMode): string {
  return modeLabels[mode];
}

export function getSkillBadges(skill: SkillSummary): SkillBadge[] {
  const badges: SkillBadge[] = [
    statusBadges[skill.status],
    visibilityBadges[skill.visibility],
    { label: titleCase(skill.kind), className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  ];

  if (skill.category) {
    badges.push({ label: skill.category, className: 'border-purple-500/30 bg-purple-500/10 text-purple-200' });
  }

  if (skill.route) {
    badges.push({ label: `Route: ${formatSkillMode(skill.route.mode)}`, className: 'border-blue-500/30 bg-blue-500/10 text-blue-200' });
  }

  return badges;
}

export function getSkillUpdateDraft(skill: SkillSummary): SkillUpdateDraft {
  return {
    status: skill.status,
    visibility: skill.visibility,
    category: skill.category ?? '',
    icon: skill.icon ?? '',
  };
}

export function getSkillRouteDraft(skill: SkillSummary): SkillRouteDraft {
  return {
    mode: skill.route?.mode ?? 'CHAT',
    defaultProviderId: skill.route?.defaultProviderId ?? '',
    searchProfile: skill.route?.searchProfile ?? '',
    maxBudgetCents: skill.route?.maxBudgetCents === null || skill.route?.maxBudgetCents === undefined
      ? ''
      : String(skill.route.maxBudgetCents),
    configJson: skill.route?.config ? JSON.stringify(skill.route.config, null, 2) : '',
  };
}

export function buildSkillUpdatePayload(draft: SkillUpdateDraft): UpdateSkillInput {
  return {
    status: draft.status,
    visibility: draft.visibility,
    category: nullableTrim(draft.category),
    icon: nullableTrim(draft.icon),
  };
}

export function buildSkillRoutePayload(draft: SkillRouteDraft): UpdateSkillRouteInput {
  return {
    mode: draft.mode,
    defaultProviderId: nullableTrim(draft.defaultProviderId),
    searchProfile: nullableTrim(draft.searchProfile),
    maxBudgetCents: parseNullableCents(draft.maxBudgetCents),
    config: parseNullableConfig(draft.configJson),
  };
}

function nullableTrim(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullableCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Budget must be a non-negative integer number of cents');
  }
  return parsed;
}

function parseNullableConfig(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Config JSON must be an object');
  }
  return parsed as Record<string, unknown>;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`);
}
