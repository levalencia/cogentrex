import type { AdminAnalyticsSummary, AppMode, CapabilityStatus, ImportSkillKitInput, SkillFileSummary, SkillReadiness, SkillStatus, SkillSummary, SkillVisibility, UpdateSkillInput, UpdateSkillRouteInput } from '@cogentrex/shared';

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
  supportedModes: AppMode[];
  configJson: string;
}

export interface SkillKitImportDraft {
  sourceUrl: string;
  folderPath: string;
  ref: string;
}

export interface AdminSkillCatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  priority: string;
  readinessLabel: string;
  readinessTone: 'ready' | 'degraded' | 'missing' | 'neutral';
  usageLabel: string;
  routeLabel: string;
  badges: SkillBadge[];
  skill: SkillSummary;
}

export interface AdminSkillDetailModel extends AdminSkillCatalogRow {
  nextAction: string;
  dependencySummaries: string[];
}

export interface AdminSkillMetric {
  label: string;
  value: string;
  hint: string;
  tone: 'accent' | 'ready' | 'warning' | 'danger' | 'neutral';
}

export type AdminSkillPanelMode = 'detail' | 'import' | 'create';

export interface AdminSkillPanelCopy {
  eyebrow: string;
  title: string;
  description: string;
}

export interface SkillFileView {
  id: string;
  path: string;
  label: string;
  role: string;
  byteLabel: string;
  checksumLabel: string;
  preview: string;
  content: string;
  executable: boolean;
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

const skillIconGlyphs: Record<string, string> = {
  'message-circle': '💬',
  search: '🔎',
  linkedin: 'in',
  image: '🖼️',
  video: '🎬',
  'file-text': '📄',
  plane: '✈️',
  sparkles: '✨',
};

export function getSkillIconGlyph(icon: string | null | undefined): string {
  const trimmed = icon?.trim();
  if (!trimmed) return '🧠';
  return skillIconGlyphs[trimmed] ?? trimmed;
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
    const supportedModes = getSkillSupportedModes(skill);
    if (supportedModes.length > 1) {
      badges.push({ label: `Supports: ${supportedModes.map(formatSkillMode).join(' + ')}`, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' });
    }
  }

  return badges;
}

export function getSkillSupportedModes(skill: SkillSummary): AppMode[] {
  if (!skill.route) return [];
  const configured = skill.route.config && typeof skill.route.config === 'object'
    ? (skill.route.config as Record<string, unknown>).supportedModes
    : undefined;
  return normalizeSupportedModes(configured, skill.route.mode);
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
  const mode = skill.route?.mode ?? 'CHAT';
  return {
    mode,
    defaultProviderId: skill.route?.defaultProviderId ?? '',
    searchProfile: skill.route?.searchProfile ?? '',
    maxBudgetCents: skill.route?.maxBudgetCents === null || skill.route?.maxBudgetCents === undefined
      ? ''
      : String(skill.route.maxBudgetCents),
    supportedModes: skill.route ? getSkillSupportedModes(skill) : [mode],
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
  const config = parseNullableConfig(draft.configJson) ?? {};
  const supportedModes = normalizeSupportedModes(draft.supportedModes, draft.mode);
  return {
    mode: draft.mode,
    defaultProviderId: nullableTrim(draft.defaultProviderId),
    searchProfile: nullableTrim(draft.searchProfile),
    maxBudgetCents: parseNullableCents(draft.maxBudgetCents),
    config: { ...config, supportedModes },
  };
}

export function buildSkillKitImportPayload(draft: SkillKitImportDraft): ImportSkillKitInput {
  const sourceUrl = draft.sourceUrl.trim();
  if (!sourceUrl) throw new Error('GitHub repository or folder URL is required');
  const folderPath = draft.folderPath.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  if (folderPath.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Folder path cannot contain . or .. segments');
  }
  const ref = draft.ref.trim();
  return {
    sourceUrl,
    ...(folderPath ? { folderPath } : {}),
    ...(ref ? { ref } : {}),
  };
}

export function buildAdminSkillCatalog(
  skills: SkillSummary[],
  readiness: SkillReadiness[] = [],
  analytics?: AdminAnalyticsSummary | null,
): AdminSkillCatalogRow[] {
  return skills
    .map((skill) => buildSkillDetailModel(skill, readiness.find((item) => item.skill.slug === skill.slug), analytics))
    .sort((left, right) => priorityRank(left) - priorityRank(right) || left.name.localeCompare(right.name));
}

export function buildAdminSkillMetrics(rows: AdminSkillCatalogRow[], analytics?: AdminAnalyticsSummary | null): AdminSkillMetric[] {
  const total = rows.length;
  const published = rows.filter((row) => row.skill.status === 'PUBLISHED').length;
  const disabled = rows.filter((row) => row.skill.status === 'DISABLED').length;
  const userVisible = rows.filter((row) => row.skill.visibility === 'USER_VISIBLE').length;
  const readyRoutes = rows.filter((row) => row.priority === 'Ready').length;
  const needsRouteOrSetup = rows.filter((row) => row.priority === 'Needs route' || row.priority === 'Needs setup').length;
  const runHealth = analytics?.totals.successRate ?? 0;
  return [
    { label: 'Total skills', value: String(total), hint: `${published} published · ${disabled} disabled`, tone: 'accent' },
    { label: 'User visible', value: String(userVisible), hint: 'Visible in Skill Assist picker', tone: userVisible > 0 ? 'ready' : 'neutral' },
    { label: 'Ready routes', value: String(readyRoutes), hint: `${needsRouteOrSetup} need route/setup`, tone: needsRouteOrSetup > 0 ? 'warning' : 'ready' },
    {
      label: 'Run health',
      value: `${runHealth}%`,
      hint: analytics ? `${analytics.totals.totalRuns} runs · ${analytics.totals.failedRuns} failed` : 'No run telemetry yet',
      tone: runHealth >= 90 ? 'ready' : runHealth >= 70 ? 'warning' : 'danger',
    },
  ];
}

export function buildSkillFileViews(files: SkillFileSummary[]): SkillFileView[] {
  return files.map((file) => {
    const isInstructions = file.path === 'SKILL.md' || file.kind === 'skill';
    return {
      id: file.id,
      path: file.path,
      label: isInstructions ? 'Instructions' : titleCase(file.kind),
      role: isInstructions ? 'Read-only instructions' : 'Supporting file',
      byteLabel: formatBytes(file.sizeBytes),
      checksumLabel: file.sha256.slice(0, 12),
      preview: file.content.trim().slice(0, 120),
      content: file.content,
      executable: file.executable,
    };
  });
}

export function getAdminSkillPanelCopy(mode: AdminSkillPanelMode): AdminSkillPanelCopy {
  if (mode === 'import') {
    return {
      eyebrow: 'Skill Kit Import',
      title: 'Import Skill Kit',
      description: 'Pull one scoped GitHub folder into the registry, then inspect stored files in the drawer.',
    };
  }
  if (mode === 'create') {
    return {
      eyebrow: 'Manual draft',
      title: 'Create manual draft',
      description: 'Create read-only SKILL.md instructions for a new skill before routing or publishing it.',
    };
  }
  return {
    eyebrow: 'Skill detail',
    title: 'Configure selected skill',
    description: 'Review lifecycle, provider route, and read-only kit files without leaving the catalog.',
  };
}

export function buildSkillDetailModel(
  skill: SkillSummary,
  readiness?: SkillReadiness | null,
  analytics?: AdminAnalyticsSummary | null,
): AdminSkillDetailModel {
  const readinessInfo = summarizeSkillReadiness(readiness);
  const usage = analytics?.topSkills.find((row) => row.skillSlug === skill.slug);
  const base: AdminSkillCatalogRow = {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    priority: getSkillPriority(skill, readinessInfo.label),
    readinessLabel: readinessInfo.label,
    readinessTone: readinessInfo.tone,
    usageLabel: usage ? `${usage.totalRuns} runs · ${usage.successRate}% success` : 'No runs yet',
    routeLabel: formatSkillRoute(skill),
    badges: getSkillBadges(skill),
    skill,
  };
  return {
    ...base,
    nextAction: getSkillNextAction(skill, readinessInfo.status),
    dependencySummaries: readiness?.dependencies.length
      ? readiness.dependencies.map((dependency) => `${dependency.label}: ${readinessInfo.label} — ${dependency.message ?? dependency.status}`)
      : ['No readiness dependencies reported yet.'],
  };
}

function summarizeSkillReadiness(readiness?: SkillReadiness | null): { status: CapabilityStatus | 'unchecked'; label: string; tone: AdminSkillCatalogRow['readinessTone'] } {
  if (!readiness) return { status: 'unchecked', label: 'Not checked', tone: 'neutral' };
  if (readiness.status === 'ready') return { status: 'ready', label: 'Ready', tone: 'ready' };
  if (readiness.status === 'degraded') return { status: 'degraded', label: 'Limited', tone: 'degraded' };
  return { status: 'missing', label: 'Needs setup', tone: 'missing' };
}

function getSkillPriority(skill: SkillSummary, readinessLabel: string): string {
  if (skill.status === 'DISABLED') return 'Disabled';
  if (readinessLabel === 'Needs setup') return 'Needs setup';
  if (readinessLabel === 'Limited') return 'Limited';
  if (!skill.route) return 'Needs route';
  return 'Ready';
}

function priorityRank(row: AdminSkillCatalogRow): number {
  const ranks: Record<string, number> = {
    'Needs setup': 0,
    Limited: 1,
    'Needs route': 2,
    Ready: 3,
    Disabled: 4,
  };
  return ranks[row.priority] ?? 5;
}

function getSkillNextAction(skill: SkillSummary, status: CapabilityStatus | 'unchecked'): string {
  if (skill.status === 'DISABLED') return 'Enable or keep disabled intentionally before exposing to users.';
  if (status === 'missing') return 'Configure required provider/tool dependencies before publishing broadly.';
  if (status === 'degraded') return 'Verify optional dependencies or provider route quality.';
  if (!skill.route) return 'Configure a route so the skill has an explicit mode, provider, and budget policy.';
  if (status === 'unchecked') return 'Refresh readiness to confirm provider and tool configuration.';
  return 'Monitor usage and failures after each release.';
}

function formatSkillRoute(skill: SkillSummary): string {
  if (!skill.route) return 'No route configured';
  return [
    formatSkillMode(skill.route.mode),
    skill.route.defaultProviderId ?? 'no provider',
    skill.route.searchProfile ?? 'no search',
    skill.route.maxBudgetCents === null || skill.route.maxBudgetCents === undefined ? 'no budget' : `${skill.route.maxBudgetCents}¢`,
  ].join(' · ');
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

function normalizeSupportedModes(value: unknown, primaryMode: AppMode): AppMode[] {
  const modes = Array.isArray(value) ? value : [];
  const validModes = new Set(appModeOptions.map((option) => option.value));
  const unique = new Set<AppMode>([primaryMode]);
  for (const mode of modes) {
    if (typeof mode === 'string' && validModes.has(mode as AppMode)) {
      unique.add(mode as AppMode);
    }
  }
  return Array.from(unique);
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kilobytes = sizeBytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`);
}
