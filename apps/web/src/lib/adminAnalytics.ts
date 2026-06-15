import type { AdminAnalyticsSummary } from '@cogentrex/shared';

export type AdminAnalyticsHealthTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface AdminAnalyticsAction {
  label: string;
  href: string;
}

export interface AdminAnalyticsViewModel {
  hasRuns: boolean;
  healthLabel: string;
  healthTone: AdminAnalyticsHealthTone;
  primaryInsight: string;
  latestActivityAt: string | null;
  primaryCta: AdminAnalyticsAction;
  secondaryCta: AdminAnalyticsAction;
}

function newestIsoDate(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);

  return timestamps[0]?.value ?? null;
}

export function buildAdminAnalyticsViewModel(analytics: AdminAnalyticsSummary): AdminAnalyticsViewModel {
  const totalRuns = analytics.totals.totalRuns;
  const hasRuns = totalRuns > 0;
  const latestActivityAt = newestIsoDate([
    ...analytics.topSkills.map((skill) => skill.latestRunAt),
    ...analytics.providerUsage.map((provider) => provider.latestRunAt),
    ...analytics.recentFailures.map((run) => run.startedAt),
  ]);

  if (!hasRuns) {
    return {
      hasRuns: false,
      healthLabel: 'No telemetry yet',
      healthTone: 'neutral',
      primaryInsight: 'Open Chat to populate run volume, failures, providers, and duration metrics.',
      latestActivityAt,
      primaryCta: { label: 'Open chat workspace', href: '/chats' },
      secondaryCta: { label: 'Review run history', href: '/runs' },
    };
  }

  if (analytics.totals.failedRuns > 0) {
    return {
      hasRuns: true,
      healthLabel: 'Needs attention',
      healthTone: 'danger',
      primaryInsight: `${analytics.totals.failedRuns} failed runs across the latest ${totalRuns} tracked records. Start with recent failures.`,
      latestActivityAt,
      primaryCta: { label: 'Inspect run history', href: '/runs' },
      secondaryCta: { label: 'Check skill routes', href: '/settings/admin/skills' },
    };
  }

  if (analytics.totals.successRate >= 90) {
    return {
      hasRuns: true,
      healthLabel: 'Healthy',
      healthTone: 'success',
      primaryInsight: `${analytics.totals.successRate}% success across ${totalRuns} tracked runs. Keep monitoring active runs.`,
      latestActivityAt,
      primaryCta: { label: 'Review run history', href: '/runs' },
      secondaryCta: { label: 'Open provider admin', href: '/settings/admin/providers' },
    };
  }

  return {
    hasRuns: true,
    healthLabel: 'Watch closely',
    healthTone: 'warning',
    primaryInsight: `${analytics.totals.successRate}% success across ${totalRuns} tracked runs. Watch for provider or skill route drift.`,
    latestActivityAt,
    primaryCta: { label: 'Review run history', href: '/runs' },
    secondaryCta: { label: 'Check skill routes', href: '/settings/admin/skills' },
  };
}
