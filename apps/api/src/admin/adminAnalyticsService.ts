import type {
  AdminAnalyticsModeRow,
  AdminAnalyticsProviderRow,
  AdminAnalyticsSkillRow,
  AdminAnalyticsSummary,
  AppMode,
  SkillRunStatus,
  SkillRunSummary,
} from '@cogentrex/shared';
import type { DbAdapter } from '../db/adapter.js';
import { nowIso } from '../utils/time.js';

interface SkillRunRow {
  id: string;
  user_id: string;
  skill_id: string;
  skill_slug: string;
  skill_name: string;
  mode: AppMode;
  status: SkillRunStatus;
  conversation_id: string | null;
  job_id: string | null;
  provider_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  observability_json: string | null;
}

function averageDuration(runs: SkillRunSummary[]): number | null {
  const durations = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));
  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
}

function successRate(runs: SkillRunSummary[]): number {
  const finishedRuns = runs.filter((run) => run.status === 'completed' || run.status === 'failed');
  if (!finishedRuns.length) return 0;
  const completedRuns = finishedRuns.filter((run) => run.status === 'completed').length;
  return Math.round((completedRuns / finishedRuns.length) * 100);
}

function countStatus(runs: SkillRunSummary[], status: SkillRunStatus): number {
  return runs.filter((run) => run.status === status).length;
}

function latestRunAt(runs: SkillRunSummary[]): string {
  return runs.reduce((latest, run) => run.startedAt > latest ? run.startedAt : latest, runs[0]?.startedAt ?? nowIso());
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const next = groups.get(key) ?? [];
    next.push(item);
    groups.set(key, next);
  }
  return groups;
}

function parseObservability(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapRun(row: SkillRunRow): SkillRunSummary {
  return {
    id: row.id,
    userId: row.user_id,
    skillId: row.skill_id,
    skillSlug: row.skill_slug,
    skillName: row.skill_name,
    mode: row.mode,
    status: row.status,
    conversationId: row.conversation_id,
    jobId: row.job_id,
    providerId: row.provider_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    observability: parseObservability(row.observability_json),
  };
}

function buildSkillRow(runs: SkillRunSummary[]): AdminAnalyticsSkillRow {
  const first = runs[0]!;
  return {
    skillSlug: first.skillSlug,
    skillName: first.skillName,
    mode: first.mode,
    totalRuns: runs.length,
    completedRuns: countStatus(runs, 'completed'),
    failedRuns: countStatus(runs, 'failed'),
    activeRuns: runs.filter((run) => run.status === 'pending' || run.status === 'running').length,
    successRate: successRate(runs),
    averageDurationMs: averageDuration(runs),
    latestRunAt: latestRunAt(runs),
  };
}

function buildModeRow(mode: AppMode, runs: SkillRunSummary[]): AdminAnalyticsModeRow {
  return {
    mode,
    totalRuns: runs.length,
    completedRuns: countStatus(runs, 'completed'),
    failedRuns: countStatus(runs, 'failed'),
    activeRuns: runs.filter((run) => run.status === 'pending' || run.status === 'running').length,
    successRate: successRate(runs),
  };
}

function buildProviderRow(providerId: string, runs: SkillRunSummary[]): AdminAnalyticsProviderRow {
  return {
    providerId,
    totalRuns: runs.length,
    failedRuns: countStatus(runs, 'failed'),
    averageDurationMs: averageDuration(runs),
    latestRunAt: latestRunAt(runs),
  };
}

export class AdminAnalyticsService {
  constructor(private readonly db: DbAdapter) {}

  async getSummary(limit = 500): Promise<AdminAnalyticsSummary> {
    const boundedLimit = Math.min(1000, Math.max(1, Math.trunc(limit)));
    const rows = await this.db.prepare(
      'SELECT * FROM skill_runs ORDER BY started_at DESC LIMIT ?',
    ).all(boundedLimit) as SkillRunRow[];
    const runs = rows.map(mapRun);
    const activeRuns = runs.filter((run) => run.status === 'pending' || run.status === 'running').length;

    const topSkills = Array.from(groupBy(runs, (run) => run.skillSlug).values())
      .map(buildSkillRow)
      .sort((a, b) => b.totalRuns - a.totalRuns || b.latestRunAt.localeCompare(a.latestRunAt))
      .slice(0, 8);

    const modeBreakdown = Array.from(groupBy(runs, (run) => run.mode).entries())
      .map(([mode, modeRuns]) => buildModeRow(mode as AppMode, modeRuns))
      .sort((a, b) => b.totalRuns - a.totalRuns || a.mode.localeCompare(b.mode));

    const providerUsage = Array.from(groupBy(runs.filter((run) => run.providerId), (run) => run.providerId!).entries())
      .map(([providerId, providerRuns]) => buildProviderRow(providerId, providerRuns))
      .sort((a, b) => b.totalRuns - a.totalRuns || b.latestRunAt.localeCompare(a.latestRunAt))
      .slice(0, 8);

    return {
      generatedAt: nowIso(),
      totals: {
        totalRuns: runs.length,
        completedRuns: countStatus(runs, 'completed'),
        failedRuns: countStatus(runs, 'failed'),
        activeRuns,
        successRate: successRate(runs),
        averageDurationMs: averageDuration(runs),
      },
      topSkills,
      modeBreakdown,
      providerUsage,
      recentFailures: runs.filter((run) => run.status === 'failed').slice(0, 5),
    };
  }
}
