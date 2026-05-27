import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../config/env.js';
import { makeTestApp, registerAndLogin } from './testApp.js';

async function promoteCurrentUserToAdmin(database: Awaited<ReturnType<typeof makeTestApp>>['database'], userId: string) {
  await database.adapter.prepare('UPDATE users SET role = \'ADMIN\' WHERE id = ?').run(userId);
}

describe('admin QA fixtures', () => {
  it('seeds an isolated Library classification fixture for an existing cogentrex.test user', async () => {
    const { app, agent: adminAgent, database } = await makeTestApp({ QA_FIXTURES_ENABLED: true } as Partial<AppEnv>);
    const admin = await registerAndLogin(adminAgent);
    await promoteCurrentUserToAdmin(database, admin.id);

    const targetAgent = request.agent(app);
    const targetResponse = await targetAgent
      .post('/api/auth/register')
      .send({ email: 'qa+library-fixture@cogentrex.test', password: 'super-secret-password' })
      .expect(201);

    const seedResponse = await adminAgent
      .post('/api/admin/qa/library-fixture')
      .send({ targetEmail: targetResponse.body.user.email })
      .expect(201);

    expect(seedResponse.body.fixture).toMatchObject({
      targetEmail: 'qa+library-fixture@cogentrex.test',
      conversationTitle: '[QA Fixture] Deep Research Classification',
      conversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      artifactFilename: 'QA Deep Research classification fixture.md',
    });

    const artifactsResponse = await targetAgent.get('/api/artifacts').expect(200);

    expect(artifactsResponse.body.artifacts).toHaveLength(1);
    expect(artifactsResponse.body.artifacts[0]).toMatchObject({
      filename: 'QA Deep Research classification fixture.md',
      conversationTitle: '[QA Fixture] Deep Research Classification',
      conversationMode: 'DEEP_RESEARCH',
    });

    const runsResponse = await targetAgent.get('/api/skills/runs?limit=10').expect(200);

    expect(runsResponse.body.runs).toHaveLength(1);
    expect(runsResponse.body.runs[0]).toMatchObject({
      id: seedResponse.body.fixture.skillRunId,
      mode: 'DEEP_RESEARCH',
      status: 'completed',
      conversationId: seedResponse.body.fixture.conversationId,
      eventCount: 4,
      observability: {
        sourceCount: 4,
        newSourceCount: 3,
        planLength: 5,
        estimatedTokens: 1234,
        synthesisDurationMs: 45000,
        platforms: ['web', 'exa'],
        savedArtifactCount: 1,
        savedArtifactIds: [seedResponse.body.fixture.artifactId],
        savedArtifacts: [
          {
            id: seedResponse.body.fixture.artifactId,
            filename: 'QA Deep Research classification fixture.md',
            type: 'text/markdown',
          },
        ],
      },
    });

    const eventsResponse = await targetAgent
      .get(`/api/skills/runs/${seedResponse.body.fixture.skillRunId}/events`)
      .expect(200);

    expect(eventsResponse.body.events).toHaveLength(4);
    expect(eventsResponse.body.events).toEqual([
      expect.objectContaining({
        runId: seedResponse.body.fixture.skillRunId,
        sequence: 1,
        eventType: 'run_started',
        label: 'Deep Research started',
        metadata: expect.objectContaining({ mode: 'DEEP_RESEARCH', skillSlug: 'deep-research' }),
      }),
      expect.objectContaining({
        runId: seedResponse.body.fixture.skillRunId,
        sequence: 2,
        eventType: 'research_sources_collected',
        label: 'Sources collected',
        metadata: expect.objectContaining({ sourceCount: 4, newSourceCount: 3 }),
      }),
      expect.objectContaining({
        runId: seedResponse.body.fixture.skillRunId,
        sequence: 3,
        eventType: 'artifact_saved',
        label: 'Artifact saved to library',
        metadata: expect.objectContaining({ artifactId: seedResponse.body.fixture.artifactId, savedArtifactCount: 1 }),
      }),
      expect.objectContaining({
        runId: seedResponse.body.fixture.skillRunId,
        sequence: 4,
        eventType: 'run_completed',
        label: 'Deep Research completed',
        metadata: expect.objectContaining({ phase: 'synthesis', savedArtifactCount: 1 }),
      }),
    ]);
  });

  it('keeps QA fixture seeding disabled unless explicitly enabled', async () => {
    const { agent, database } = await makeTestApp();
    const admin = await registerAndLogin(agent);
    await promoteCurrentUserToAdmin(database, admin.id);

    await agent
      .post('/api/admin/qa/library-fixture')
      .send({ targetEmail: 'qa+library-fixture@cogentrex.test' })
      .expect(404);
  });

  it('rejects fixture seeding for non-QA target emails', async () => {
    const { agent, database } = await makeTestApp({ QA_FIXTURES_ENABLED: true } as Partial<AppEnv>);
    const admin = await registerAndLogin(agent);
    await promoteCurrentUserToAdmin(database, admin.id);

    await agent
      .post('/api/admin/qa/library-fixture')
      .send({ targetEmail: 'reader@example.com' })
      .expect(400);
  });

  it('lets a guarded QA token temporarily promote and demote an existing cogentrex.test user', async () => {
    const token = 'test-qa-fixture-token-with-enough-length';
    const { app } = await makeTestApp({
      QA_FIXTURES_ENABLED: true,
      QA_FIXTURE_ADMIN_TOKEN: token,
    } as Partial<AppEnv>);
    const targetAgent = request.agent(app);
    const target = await targetAgent
      .post('/api/auth/register')
      .send({ email: 'qa+temporary-admin@cogentrex.test', password: 'super-secret-password' })
      .expect(201);

    await request(app)
      .post('/api/admin/qa/temporary-admin')
      .set('x-qa-fixture-token', token)
      .send({ targetEmail: target.body.user.email, role: 'ADMIN' })
      .expect(200)
      .expect((res) => {
        expect(res.body.temporaryAdmin).toMatchObject({
          targetEmail: 'qa+temporary-admin@cogentrex.test',
          targetUserId: target.body.user.id,
          previousRole: 'USER',
          role: 'ADMIN',
        });
      });

    await targetAgent.get('/api/auth/me').expect(200).expect((res) => {
      expect(res.body.user.role).toBe('ADMIN');
    });

    await request(app)
      .post('/api/admin/qa/temporary-admin')
      .set('x-qa-fixture-token', token)
      .send({ targetEmail: target.body.user.email, role: 'USER' })
      .expect(200)
      .expect((res) => {
        expect(res.body.temporaryAdmin).toMatchObject({
          targetEmail: 'qa+temporary-admin@cogentrex.test',
          targetUserId: target.body.user.id,
          previousRole: 'ADMIN',
          role: 'USER',
        });
      });

    await targetAgent.get('/api/auth/me').expect(200).expect((res) => {
      expect(res.body.user.role).toBe('USER');
    });
  });

  it('keeps temporary admin promotion hidden without an explicit QA token', async () => {
    const { app } = await makeTestApp({ QA_FIXTURES_ENABLED: true } as Partial<AppEnv>);

    await request(app)
      .post('/api/admin/qa/temporary-admin')
      .set('x-qa-fixture-token', 'test-qa-fixture-token-with-enough-length')
      .send({ targetEmail: 'qa+temporary-admin@cogentrex.test', role: 'ADMIN' })
      .expect(404);
  });

  it('rejects temporary admin promotion for non-QA target emails', async () => {
    const token = 'test-qa-fixture-token-with-enough-length';
    const { app } = await makeTestApp({
      QA_FIXTURES_ENABLED: true,
      QA_FIXTURE_ADMIN_TOKEN: token,
    } as Partial<AppEnv>);

    await request(app)
      .post('/api/admin/qa/temporary-admin')
      .set('x-qa-fixture-token', token)
      .send({ targetEmail: 'reader@example.com', role: 'ADMIN' })
      .expect(400);
  });
});
