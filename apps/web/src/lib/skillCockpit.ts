import type { SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { buildSkillRunHealthStats, buildSkillRunHistoryRows, type SkillRunHealthStats, type SkillRunHistoryRow } from './libraryOutputs';
import { applyLauncherReadiness, getLauncherItems, summarizeLauncherReadiness, type LauncherItem, type LauncherReadinessSummary } from './workflowLauncher';

export interface SkillCockpitControlLoop {
  id: 'launch' | 'observe' | 'reuse' | 'govern' | 'connectors' | 'analytics';
  label: string;
  description: string;
  href: string;
  isAdminOnly: boolean;
}

export interface SkillCockpitModel {
  cards: LauncherItem[];
  readinessSummary: LauncherReadinessSummary;
  health: SkillRunHealthStats;
  recentRuns: SkillRunHistoryRow[];
  controlLoops: SkillCockpitControlLoop[];
}

const controlLoops: SkillCockpitControlLoop[] = [
  {
    id: 'launch',
    label: 'Launch workflows',
    description: 'Start chat, research, social, image, or video workflows from the user cockpit.',
    href: '/skills',
    isAdminOnly: false,
  },
  {
    id: 'observe',
    label: 'Observe runs',
    description: 'Inspect status, timing, events, failures, and saved-output links in the run ledger.',
    href: '/runs',
    isAdminOnly: false,
  },
  {
    id: 'reuse',
    label: 'Reuse outputs',
    description: 'Open Library artifacts with workflow provenance, markdown copy, and chat/run links.',
    href: '/library',
    isAdminOnly: false,
  },
  {
    id: 'govern',
    label: 'Govern skills',
    description: 'Curate published skills, routes, readiness, and mode-specific workflow configuration.',
    href: '/settings/admin/skills',
    isAdminOnly: true,
  },
  {
    id: 'connectors',
    label: 'Manage connectors',
    description: 'Review provider/search configuration that controls workflow readiness and routing.',
    href: '/settings/admin/providers',
    isAdminOnly: true,
  },
  {
    id: 'analytics',
    label: 'Analyze operations',
    description: 'Track run volume, failure hotspots, provider usage, and operational health.',
    href: '/settings/admin/analytics',
    isAdminOnly: true,
  },
];

export function buildSkillCockpitModel(readiness: SkillReadiness[] | null, skillRuns: SkillRunSummary[], recentRunLimit = 5): SkillCockpitModel {
  const cards = readiness ? applyLauncherReadiness(getLauncherItems(), readiness) : getLauncherItems();
  return {
    cards,
    readinessSummary: summarizeLauncherReadiness(cards),
    health: buildSkillRunHealthStats(skillRuns),
    recentRuns: buildSkillRunHistoryRows(skillRuns, recentRunLimit),
    controlLoops,
  };
}
