import { describe, expect, it } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

function workflowById(body: { workflows: Array<{ workflow: { id: string }; status: string; tools: Array<{ id: string; status: string; adapterId?: string }> }> }, id: string) {
  const workflow = body.workflows.find((item) => item.workflow.id === id);
  expect(workflow).toBeDefined();
  return workflow!;
}

describe('capability API', () => {
  it('requires authentication', async () => {
    const { agent, database } = await makeTestApp();

    await agent.get('/api/capabilities').expect(401);

    database.close();
  });

  it('reports core workflow readiness from provider and tool capabilities', async () => {
    const { agent, database } = await makeTestApp({ NODE_ENV: 'production' });
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent.get('/api/capabilities').expect(200);

    expect(response.body.workflows).toHaveLength(5);
    expect(workflowById(response.body, 'CHAT').status).toBe('ready');
    expect(workflowById(response.body, 'IMAGE_GENERATION').status).toBe('missing');
    expect(workflowById(response.body, 'VIDEO_GENERATION').status).toBe('missing');
    expect(workflowById(response.body, 'SOCIAL_WRITING').status).toBe('degraded');

    const deepResearch = workflowById(response.body, 'DEEP_RESEARCH');
    expect(deepResearch.status).toBe('missing');
    expect(deepResearch.tools).toContainEqual(expect.objectContaining({ id: 'web.search', status: 'missing' }));

    database.close();
  });

  it('uses Brave search and Scrapling fetch as the ready default tool adapters', async () => {
    const { agent, database } = await makeTestApp({
      BRAVE_SEARCH_API_KEY: 'test-brave-key',
      SCRAPLING_BASE_URL: 'http://scrapling.test:8000',
    } as never);
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent.get('/api/capabilities').expect(200);

    const deepResearch = workflowById(response.body, 'DEEP_RESEARCH');
    expect(deepResearch.status).toBe('ready');
    expect(deepResearch.tools).toContainEqual(expect.objectContaining({ id: 'web.search', status: 'ready', adapterId: 'brave.search' }));
    expect(deepResearch.tools).toContainEqual(expect.objectContaining({ id: 'web.fetch', status: 'ready', adapterId: 'scrapling.fetch' }));

    database.close();
  });

  it('reports Scrapling search as ready when explicitly configured', async () => {
    const { agent, database } = await makeTestApp({
      NODE_ENV: 'production',
      SCRAPLING_BASE_URL: 'http://scrapling.test:8000',
      WEB_SEARCH_ADAPTER: 'scrapling',
      WEB_FETCH_ADAPTER: 'scrapling',
    } as never);
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent.get('/api/capabilities').expect(200);

    const deepResearch = workflowById(response.body, 'DEEP_RESEARCH');
    expect(deepResearch.status).toBe('ready');
    expect(deepResearch.tools).toContainEqual(expect.objectContaining({ id: 'web.search', status: 'ready', adapterId: 'scrapling.search' }));
    expect(deepResearch.tools).toContainEqual(expect.objectContaining({ id: 'web.fetch', status: 'ready', adapterId: 'scrapling.fetch' }));

    database.close();
  });

  it('marks image generation ready when an image-capable provider exists', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    await agent.post('/api/providers').send({
      name: 'Image Provider',
      baseUrl: 'https://images.example.com/v1',
      apiKey: 'test-api-key',
      model: 'gpt-image-test',
      kind: 'IMAGE_GENERATION',
      isDefault: false,
      defaultForMode: 'IMAGE_GENERATION',
      supportsImage: true,
    }).expect(201);

    const response = await agent.get('/api/capabilities').expect(200);

    expect(workflowById(response.body, 'IMAGE_GENERATION').status).toBe('ready');

    database.close();
  });
});
