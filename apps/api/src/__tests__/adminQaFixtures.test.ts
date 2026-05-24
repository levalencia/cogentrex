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
});
