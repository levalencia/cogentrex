import { describe, expect, it } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

describe('provider API', () => {
  it('stores provider configs without returning API keys', async () => {
    const { agent, database } = makeTestApp();
    await registerAndLogin(agent);
    const provider = await createProvider(agent);

    await agent.get('/api/providers').expect(200).expect((res) => {
      expect(res.body.providers).toHaveLength(1);
      expect(res.body.providers[0].id).toBe(provider.id);
      expect(res.body.providers[0].apiKey).toBeUndefined();
      expect(res.body.providers[0].model).toBe('Kimi 2.6');
      expect(res.body.providers[0].supportsStreaming).toBe(true);
      expect(res.body.providers[0].supportsVision).toBe(false);
    });

    database.close();
  });

  it('creates provider with capabilities and per-mode default', async () => {
    const { agent, database } = makeTestApp();
    await registerAndLogin(agent);

    const res = await agent.post('/api/providers').send({
      name: 'OpenAI GPT-4',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4',
      kind: 'OPENAI_COMPATIBLE',
      isDefault: false,
      defaultForMode: 'CHAT',
      supportsStreaming: true,
      supportsVision: true,
      supportsTools: true,
      supportsSearch: false,
    }).expect(201);

    expect(res.body.provider.defaultForMode).toBe('CHAT');
    expect(res.body.provider.supportsVision).toBe(true);
    expect(res.body.provider.supportsTools).toBe(true);

    database.close();
  });

  it('tests provider connection and updates test status', async () => {
    const { agent, database } = makeTestApp();
    await registerAndLogin(agent);
    const provider = await createProvider(agent);

    const res = await agent.post(`/api/providers/${provider.id}/test`).expect(200);
    expect(res.body.status).toBe('fail');

    const listRes = await agent.get('/api/providers').expect(200);
    expect(listRes.body.providers[0].testStatus).toBe('fail');

    database.close();
  });
});
