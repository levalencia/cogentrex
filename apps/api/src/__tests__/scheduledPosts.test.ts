import { describe, expect, it } from 'vitest';
import { makeTestApp, registerAndLogin } from './testApp.js';

describe('scheduled posts routes', () => {
  it('returns a posts array for an authenticated user', async () => {
    const { agent } = await makeTestApp();
    await registerAndLogin(agent);

    const response = await agent.get('/api/scheduled-posts').expect(200);

    expect(Array.isArray(response.body.posts)).toBe(true);
    expect(response.body.posts).toEqual([]);
  });

  it('creates and deletes scheduled posts before responding', async () => {
    const { agent } = await makeTestApp();
    await registerAndLogin(agent);

    await agent
      .post('/api/scheduled-posts')
      .send({
        platform: 'linkedin',
        content: 'Scheduled post content',
        postAt: '2030-01-01T10:00:00.000Z',
      })
      .expect(201);

    const created = await agent.get('/api/scheduled-posts').expect(200);
    expect(created.body.posts).toHaveLength(1);
    expect(created.body.posts[0]).toMatchObject({
      platform: 'linkedin',
      content: 'Scheduled post content',
      status: 'pending',
    });

    await agent.delete(`/api/scheduled-posts/${created.body.posts[0].id}`).expect(204);

    const afterDelete = await agent.get('/api/scheduled-posts').expect(200);
    expect(afterDelete.body.posts).toEqual([]);
  });
});
