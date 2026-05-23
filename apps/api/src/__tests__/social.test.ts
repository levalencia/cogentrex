import { describe, expect, it } from 'vitest';
import { makeTestApp, registerAndLogin } from './testApp.js';

async function registerAdmin(agent: Awaited<ReturnType<typeof makeTestApp>>['agent'], database: Awaited<ReturnType<typeof makeTestApp>>['database']) {
  const user = await registerAndLogin(agent);
  await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
  return user;
}

describe('social writing API', () => {
  it('uses a global text provider when no social-specific route is configured', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    await agent.post('/api/admin/providers').send({
      name: 'Workspace Text Model',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'test-api-key',
      model: 'text-model',
      kind: 'OPENAI_COMPATIBLE',
      isDefault: false,
      supportsStreaming: true,
    }).expect(201);

    await agent.post('/api/auth/logout').expect(204);
    await agent.post('/api/auth/register').send({
      email: 'social-user@example.com',
      password: 'super-secret-password',
    }).expect(201);

    const response = await agent.post('/api/social/generate').send({
      topic: 'Write a short launch post for Cogentrex.',
      platforms: ['linkedin'],
      useResearch: false,
    }).expect(200);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0]).toEqual(expect.objectContaining({ platform: 'LinkedIn' }));
    expect(response.body.conversationId).toEqual(expect.any(String));

    database.close();
  });

  it('does not create a ghost social conversation when provider resolution fails', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    await agent.post('/api/social/generate').send({
      topic: 'This should not create a saved run.',
      platforms: ['linkedin'],
      useResearch: false,
    }).expect(404);

    const conversations = await agent.get('/api/chat/conversations').expect(200);
    expect(conversations.body.conversations).toEqual([]);

    database.close();
  });
});
