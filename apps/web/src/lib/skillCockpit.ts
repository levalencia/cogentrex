import type { SkillReadiness, SkillRunSummary } from '@cogentrex/shared';
import { buildSkillRunHealthStats, buildSkillRunHistoryRows, type SkillRunHealthStats, type SkillRunHistoryRow } from './libraryOutputs';
import { applyLauncherReadiness, getLauncherItems, summarizeLauncherReadiness, type LauncherItem, type LauncherReadinessSummary } from './workflowLauncher';

export interface SkillCockpitModel {
  cards: LauncherItem[];
  readinessSummary: LauncherReadinessSummary;
  health: SkillRunHealthStats;
  recentRuns: SkillRunHistoryRow[];
}

export function buildSkillCockpitModel(readiness: SkillReadiness[] | null, skillRuns: SkillRunSummary[], recentRunLimit = 5): SkillCockpitModel {
  const cards = readiness ? applyLauncherReadiness(getLauncherItems(), readiness) : getLauncherItems();
  return {
    cards,
    readinessSummary: summarizeLauncherReadiness(cards),
    health: buildSkillRunHealthStats(skillRuns),
    recentRuns: buildSkillRunHistoryRows(skillRuns, recentRunLimit),
  };
}
