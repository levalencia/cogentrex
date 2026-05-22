import { describe, expect, it } from 'vitest';
import { makeTestApp, registerAndLogin } from './testApp.js';

async function registerAdmin(agent: Awaited<ReturnType<typeof makeTestApp>>['agent'], database: Awaited<ReturnType<typeof makeTestApp>>['database']) {
  const user = await registerAndLogin(agent);
  await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
  return { ...user, role: 'ADMIN' as const };
}

describe('skill registry API', () => {
  it('lists only published user-visible native skills for authenticated users', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    const res = await agent.get('/api/skills').expect(200);

    const slugs = res.body.skills.map((skill: { slug: string }) => skill.slug);
    expect(slugs).toContain('chat');
    expect(slugs).toContain('deep-research');
    expect(slugs).toContain('linkedin-writer');
    expect(slugs).toContain('image-studio');
    expect(slugs).toContain('artifact-writer');
    expect(slugs).not.toContain('video-lab');
    expect(slugs).not.toContain('flight-search');
    expect(res.body.skills[0].route.mode).toBeDefined();

    database.close();
  });

  it('returns skill detail for visible skills and hides staged admin-only skills', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    await agent.get('/api/skills/deep-research').expect(200).expect((res) => {
      expect(res.body.skill.slug).toBe('deep-research');
      expect(res.body.skill.status).toBe('PUBLISHED');
      expect(res.body.skill.visibility).toBe('USER_VISIBLE');
      expect(res.body.skill.route.mode).toBe('DEEP_RESEARCH');
      expect(Array.isArray(res.body.skill.toolRequirements)).toBe(true);
    });

    await agent.get('/api/skills/video-lab').expect(404);

    database.close();
  });

  it('allows admins to list all skills and blocks non-admin users', async () => {
    const userApp = await makeTestApp();
    await registerAndLogin(userApp.agent);
    await userApp.agent.get('/api/admin/skills').expect(403);
    userApp.database.close();

    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const res = await agent.get('/api/admin/skills').expect(200);
    const slugs = res.body.skills.map((skill: { slug: string }) => skill.slug);
    expect(slugs).toContain('video-lab');
    expect(slugs).toContain('flight-search');

    database.close();
  });

  it('allows admins to curate skill metadata and configure skill routes', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    await agent.patch('/api/admin/skills/flight-search').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      category: 'Travel Ops',
      toolRequirements: [{ name: 'web.search', required: true }],
    }).expect(200).expect((res) => {
      expect(res.body.skill.slug).toBe('flight-search');
      expect(res.body.skill.status).toBe('PUBLISHED');
      expect(res.body.skill.visibility).toBe('USER_VISIBLE');
      expect(res.body.skill.category).toBe('Travel Ops');
    });

    await agent.put('/api/admin/skills/flight-search/route').send({
      mode: 'DEEP_RESEARCH',
      searchProfile: 'travel-web',
      maxBudgetCents: 500,
      config: { requiredSources: 4 },
    }).expect(200).expect((res) => {
      expect(res.body.route.mode).toBe('DEEP_RESEARCH');
      expect(res.body.route.searchProfile).toBe('travel-web');
      expect(res.body.route.maxBudgetCents).toBe(500);
      expect(res.body.route.config.requiredSources).toBe(4);
    });

    await agent.get('/api/skills/flight-search').expect(200).expect((res) => {
      expect(res.body.skill.route.searchProfile).toBe('travel-web');
    });

    database.close();
  });

  it('seeds native skills idempotently across repeated startup', async () => {
    const { app, agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const first = await agent.get('/api/admin/skills').expect(200);
    const firstCount = first.body.skills.length;

    const { createApp } = await import('../app.js');
    await createApp({
      NODE_ENV: 'test',
      API_PORT: 0,
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: ':memory:',
      JWT_SECRET: 'test-jwt-secret-with-enough-length',
      APP_ENCRYPTION_KEY: 'test-encryption-secret-with-enough-length',
      FIRECRAWL_API_KEY: undefined,
      BRAVE_SEARCH_API_KEY: undefined,
      SCRAPLING_BASE_URL: undefined,
      WEB_SEARCH_ADAPTER: undefined,
      WEB_FETCH_ADAPTER: undefined,
      DEFAULT_PROVIDER_NAME: 'Microsoft Foundry Kimi',
      DEFAULT_PROVIDER_BASE_URL: 'https://foundry.example.com/openai/v1',
      DEFAULT_PROVIDER_MODEL: 'Kimi 2.6',
      LOG_LEVEL: 'silent',
    }, {
      database,
      logger: { debug() {}, info() {}, warn() {}, error() {}, child: () => ({ debug() {}, info() {}, warn() {}, error() {}, child: () => { throw new Error('unused'); } }) } as never,
    });

    const after = await agent.get('/api/admin/skills').expect(200);
    expect(after.body.skills).toHaveLength(firstCount);

    expect(app).toBeDefined();
    database.close();
  });
});
