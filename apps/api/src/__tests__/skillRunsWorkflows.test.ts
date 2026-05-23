import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

describe('workflow skill runs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records Social Writer generations as observable skill runs', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/social/generate')
      .send({ topic: 'Launch note for Cogentrex', platforms: ['linkedin'], useResearch: false })
      .expect(200);

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'linkedin-writer',
      mode: 'SOCIAL_WRITING',
      status: 'completed',
      conversationId: response.body.conversationId,
    }));

    database.close();
  });

  it('records Deep Research jobs as observable skill runs', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const planned = await agent
      .post('/api/chat/plan')
      .send({ content: 'Research Cogentrex workflow observability' })
      .expect(200);

    await agent
      .post('/api/chat/research')
      .send({ jobId: planned.body.jobId, plan: planned.body.plan })
      .expect(200);

    let runs: { body: { runs: Array<{ jobId?: string; status?: string }> } } | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      runs = await agent.get('/api/skills/runs').expect(200);
      const run = runs.body.runs.find((item: { jobId?: string; status?: string }) => item.jobId === planned.body.jobId);
      if (run?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(runs?.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'deep-research',
      mode: 'DEEP_RESEARCH',
      status: 'completed',
      conversationId: planned.body.conversationId,
      jobId: planned.body.jobId,
    }));

    database.close();
  });

  it('records Image Studio generations as observable skill runs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: 'https://example.com/generated.png' }] }),
    } as Response);

    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/media/generate')
      .send({ prompt: 'A credible AI research cockpit screenshot', type: 'image' })
      .expect(201);

    const runs = await agent.get('/api/skills/runs').expect(200);
    expect(runs.body.runs).toContainEqual(expect.objectContaining({
      skillSlug: 'image-studio',
      mode: 'IMAGE_GENERATION',
      status: 'completed',
      conversationId: response.body.conversationId,
    }));

    database.close();
  });
});
