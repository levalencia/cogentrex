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

export interface SkillCockpitOperatingStep {
  id: 'mode' | 'template' | 'assist' | 'run' | 'reuse';
  label: string;
  description: string;
}

export interface SkillCockpitModel {
  cards: LauncherItem[];
  readinessSummary: LauncherReadinessSummary;
  health: SkillRunHealthStats;
  recentRuns: SkillRunHistoryRow[];
  controlLoops: SkillCockpitControlLoop[];
  operatingModel: SkillCockpitOperatingStep[];
}

const operatingModel: SkillCockpitOperatingStep[] = [
  {
    id: 'mode',
    label: '1. Choose the mode',
    description: 'Users pick the workspace shape first: Chat, Deep Research, Social Writer, Image, or Video.',
  },
  {
    id: 'template',
    label: '2. Start from a template when helpful',
    description: 'Templates prefill an existing mode with a prompt, defaults, and suggested skills; they are shortcuts, not separate engines.',
  },
  {
    id: 'assist',
    label: '3. Set Skill Assist',
    description: 'Auto chooses published skill packages; Hybrid combines user picks with suggestions; Manual uses only selected skills; Off keeps the run plain.',
  },
  {
    id: 'run',
    label: '4. Track the run',
    description: 'Tracked task executions belong in the Runs ledger with status, events, provider context, failures, and links.',
  },
  {
    id: 'reuse',
    label: '5. Reuse the output',
    description: 'Durable artifacts and saved answers move to Library with provenance back to the chat or run that produced them.',
  },
];

const controlLoops: SkillCockpitControlLoop[] = [
  {
    id: 'launch',
    label: 'Start from a mode',
    description: 'Choose Chat, Deep Research, Social Writer, Image, or Video, then optionally apply a task template.',
    href: '/workflows',
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
    description: 'Open Library artifacts with task provenance, markdown copy, and chat/run links.',
    href: '/library',
    isAdminOnly: false,
  },
  {
    id: 'govern',
    label: 'Govern skill packages',
    description: 'Curate the published skill packages and routing that Skill Assist can use behind user tasks.',
    href: '/settings/admin/skills',
    isAdminOnly: true,
  },
  {
    id: 'connectors',
    label: 'Manage connectors',
    description: 'Review provider/search configuration that controls task readiness and routing.',
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
    operatingModel,
  };
}
