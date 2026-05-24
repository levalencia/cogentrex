import { describe, expect, it } from 'vitest';
import type { AdminAnalyticsSummary } from '@cogentrex/shared';
import { buildAdminAnalyticsViewModel } from './adminAnalytics';

const emptySummary: AdminAnalyticsSummary = {
  generatedAt: '2026-05-24T12:00:00.000Z',
  totals: {
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    activeRuns: 0,
    successRate: 0,
    averageDurationMs: null,
  },
  topSkills: [],
  modeBreakdown: [],
  providerUsage: [],
  recentFailures: [],
};

describe('buildAdminAnalyticsViewModel', () => {
  it('guides admins to generate telemetry when the dashboard has no runs', () => {
    const view = buildAdminAnalyticsViewModel(emptySummary);

    expect(view.hasRuns).toBe(false);
    expect(view.healthLabel).toBe('No telemetry yet');
    expect(view.primaryInsight).toContain('Launch a workflow');
    expect(view.primaryCta).toEqual({ label: 'Open chat workspace', href: '/' });
    expect(view.secondaryCta).toEqual({ label: 'Review run history', href: '/library' });
  });

  it('surfaces degraded health and the newest workflow timestamp when failures exist', () => {
    const view = buildAdminAnalyticsViewModel({
      ...emptySummary,
      totals: {
        totalRuns: 12,
        completedRuns: 8,
        failedRuns: 3,
        activeRuns: 1,
        successRate: 73,
        averageDurationMs: 1450,
      },
      topSkills: [
        {
          skillSlug: 'deep-research-default',
          skillName: 'Deep Research',
          mode: 'DEEP_RESEARCH',
          totalRuns: 7,
          completedRuns: 5,
          failedRuns: 2,
          activeRuns: 0,
          successRate: 71,
          averageDurationMs: 1400,
          latestRunAt: '2026-05-24T11:55:00.000Z',
        },
      ],
      providerUsage: [
        {
          providerId: 'foundry-main',
          totalRuns: 9,
          failedRuns: 3,
          averageDurationMs: 1500,
          latestRunAt: '2026-05-24T11:58:00.000Z',
        },
      ],
      recentFailures: [
        {
          id: 'run-1',
          userId: 'user-1',
          skillId: 'skill-1',
          skillSlug: 'deep-research-default',
          skillName: 'Deep Research',
          mode: 'DEEP_RESEARCH',
          status: 'failed',
          conversationId: 'conv-1',
          jobId: 'job-1',
          providerId: 'foundry-main',
          startedAt: '2026-05-24T11:59:00.000Z',
          completedAt: '2026-05-24T12:00:00.000Z',
          durationMs: 1000,
          errorMessage: 'Search timeout',
          observability: null,
        },
      ],
    });

    expect(view.hasRuns).toBe(true);
    expect(view.healthLabel).toBe('Needs attention');
    expect(view.healthTone).toBe('danger');
    expect(view.primaryInsight).toBe('3 failed runs across the latest 12 tracked records. Start with recent failures.');
    expect(view.latestActivityAt).toBe('2026-05-24T11:59:00.000Z');
    expect(view.primaryCta).toEqual({ label: 'Inspect run history', href: '/library' });
    expect(view.secondaryCta).toEqual({ label: 'Check skill routes', href: '/settings/admin/skills' });
  });

  it('marks healthy telemetry when success rate is high and no runs are failing', () => {
    const view = buildAdminAnalyticsViewModel({
      ...emptySummary,
      totals: {
        totalRuns: 20,
        completedRuns: 19,
        failedRuns: 0,
        activeRuns: 1,
        successRate: 95,
        averageDurationMs: 850,
      },
      topSkills: [
        {
          skillSlug: 'chat-general',
          skillName: 'Ask / Chat',
          mode: 'CHAT',
          totalRuns: 20,
          completedRuns: 19,
          failedRuns: 0,
          activeRuns: 1,
          successRate: 95,
          averageDurationMs: 850,
          latestRunAt: '2026-05-24T11:30:00.000Z',
        },
      ],
    });

    expect(view.healthLabel).toBe('Healthy');
    expect(view.healthTone).toBe('success');
    expect(view.primaryInsight).toBe('95% success across 20 tracked runs. Keep monitoring active workflows.');
  });
});
