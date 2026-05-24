import { describe, expect, it } from 'vitest';
import { makeTestApp, registerAndLogin, createProvider } from './testApp.js';

async function registerAdmin(agent: Awaited<ReturnType<typeof makeTestApp>>['agent'], database: Awaited<ReturnType<typeof makeTestApp>>['database']) {
  const user = await registerAndLogin(agent);
  await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
  return { ...user, role: 'ADMIN' as const };
}

async function skillId(database: Awaited<ReturnType<typeof makeTestApp>>['database'], slug: string): Promise<string> {
  const row = await database.adapter.prepare('SELECT id FROM skills WHERE slug = ?').get(slug) as { id: string };
  return row.id;
}

describe('admin analytics API', () => {
  it('blocks non-admin users', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    await agent.get('/api/admin/analytics').expect(403);

    database.close();
  });

  it('summarizes skill run health across skills, modes, providers, and failures', async () => {
    const { agent, database } = await makeTestApp();
    const admin = await registerAdmin(agent, database);
    const provider = await createProvider(agent);
    const chatSkillId = await skillId(database, 'chat');
    const researchSkillId = await skillId(database, 'deep-research');

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms,
        error_message, observability_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run_completed', admin.id, chatSkillId, 'chat', 'General Chat', 'CHAT', 'completed',
      null, null, provider.id, '2026-05-20T10:00:00.000Z', '2026-05-20T10:00:02.000Z', 2000,
      null, JSON.stringify({ tokenCount: 25 }),
    );

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms,
        error_message, observability_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run_failed', admin.id, researchSkillId, 'deep-research', 'Deep Research', 'DEEP_RESEARCH', 'failed',
      null, 'job_1', provider.id, '2026-05-20T11:00:00.000Z', '2026-05-20T11:00:06.000Z', 6000,
      'search provider failed', JSON.stringify({ sourceCount: 0 }),
    );

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, observability_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run_running', admin.id, chatSkillId, 'chat', 'General Chat', 'CHAT', 'running',
      null, null, provider.id, '2026-05-20T12:00:00.000Z', JSON.stringify({}),
    );

    const res = await agent.get('/api/admin/analytics').expect(200);

    expect(res.body.analytics.totals).toMatchObject({
      totalRuns: 3,
      completedRuns: 1,
      failedRuns: 1,
      activeRuns: 1,
      successRate: 50,
      averageDurationMs: 4000,
    });
    expect(res.body.analytics.topSkills[0]).toMatchObject({
      skillSlug: 'chat',
      totalRuns: 2,
      completedRuns: 1,
      activeRuns: 1,
    });
    expect(res.body.analytics.modeBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: 'CHAT', totalRuns: 2 }),
      expect.objectContaining({ mode: 'DEEP_RESEARCH', failedRuns: 1 }),
    ]));
    expect(res.body.analytics.providerUsage[0]).toMatchObject({
      providerId: provider.id,
      totalRuns: 3,
      failedRuns: 1,
    });
    expect(res.body.analytics.recentFailures[0]).toMatchObject({
      id: 'run_failed',
      errorMessage: 'search provider failed',
    });

    database.close();
  });

  it('tolerates malformed observability metadata', async () => {
    const { agent, database } = await makeTestApp();
    const admin = await registerAdmin(agent, database);
    const chatSkillId = await skillId(database, 'chat');

    await database.adapter.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms,
        error_message, observability_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run_bad_observability', admin.id, chatSkillId, 'chat', 'General Chat', 'CHAT', 'failed',
      null, null, null, '2026-05-20T13:00:00.000Z', '2026-05-20T13:00:01.000Z', 1000,
      'bad metadata should not break analytics', '{bad-json',
    );

    const res = await agent.get('/api/admin/analytics').expect(200);

    expect(res.body.analytics.totals.totalRuns).toBe(1);
    expect(res.body.analytics.recentFailures[0]).toMatchObject({
      id: 'run_bad_observability',
      observability: null,
    });

    database.close();
  });
});
