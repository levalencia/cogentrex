import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testApp.js';

describe('auth API', () => {
  it('registers, returns current user, and rejects duplicate registration', async () => {
    const { agent, database } = await makeTestApp();

    await agent
      .post('/api/auth/register')
      .send({ email: 'wife@example.com', password: 'super-secret-password' })
      .expect(201)
      .expect((res) => {
        expect(res.body.user.email).toBe('wife@example.com');
        expect(res.headers['set-cookie']).toBeDefined();
      });

    await agent.get('/api/auth/me').expect(200).expect((res) => {
      expect(res.body.user.email).toBe('wife@example.com');
    });

    await agent
      .post('/api/auth/register')
      .send({ email: 'wife@example.com', password: 'super-secret-password' })
      .expect(409);

    database.close();
  });

  it('does not expose protected routes without a session', async () => {
    const { agent, database } = await makeTestApp();
    await agent.get('/api/providers').expect(401);
    database.close();
  });
});
