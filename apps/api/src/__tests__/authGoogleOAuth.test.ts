import { describe, expect, it } from 'vitest';
import type { GoogleOAuthClient, GoogleProfile } from '../auth/googleOAuthClient.js';
import { makeTestApp } from './testApp.js';

class FakeGoogleOAuthClient implements GoogleOAuthClient {
  constructor(private readonly profile: GoogleProfile) {}

  buildAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', 'test-google-client-id');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    expect(code).toBe('google-code');
    return this.profile;
  }
}

const googleEnv = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  API_PUBLIC_BASE_URL: 'http://localhost:3001',
};

describe('Google OAuth auth routes', () => {
  it('redirects to Google with a state cookie', async () => {
    const { agent, database } = await makeTestApp(googleEnv, {
      googleOAuth: new FakeGoogleOAuthClient({
        sub: 'google-user-1',
        email: 'reader@example.com',
        emailVerified: true,
      }),
    });

    const response = await agent.get('/api/auth/google').expect(302);
    const location = response.headers.location as string;
    const url = new URL(location);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3001/api/auth/google/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(String(response.headers['set-cookie'])).toContain('oauth_state=');

    await database.close();
  });

  it('creates an OAuth-only user and signs them in when Google returns a verified email', async () => {
    const { agent, database } = await makeTestApp(googleEnv, {
      googleOAuth: new FakeGoogleOAuthClient({
        sub: 'google-user-1',
        email: 'reader@example.com',
        emailVerified: true,
      }),
    });

    const start = await agent.get('/api/auth/google').expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await agent
      .get('/api/auth/google/callback')
      .query({ code: 'google-code', state })
      .expect(302);

    expect(callback.headers.location).toBe('http://localhost:3000');
    expect(String(callback.headers['set-cookie'])).toContain('session=');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('reader@example.com');

    const oauthAccount = await database.adapter.getOne<{ user_id: string; provider_user_id: string }>(
      'SELECT user_id, provider_user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
      ['google', 'google-user-1'],
    );
    expect(oauthAccount?.user_id).toBe(me.body.user.id);

    await database.close();
  });

  it('links Google to an existing password user when the email is verified', async () => {
    const { agent, database } = await makeTestApp(googleEnv, {
      googleOAuth: new FakeGoogleOAuthClient({
        sub: 'google-user-2',
        email: 'reader@example.com',
        emailVerified: true,
      }),
    });

    const registered = await agent
      .post('/api/auth/register')
      .send({ email: 'reader@example.com', password: 'super-secret-password' })
      .expect(201);
    await agent.post('/api/auth/logout').expect(204);

    const start = await agent.get('/api/auth/google').expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state');

    await agent
      .get('/api/auth/google/callback')
      .query({ code: 'google-code', state })
      .expect(302);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.id).toBe(registered.body.user.id);

    await database.close();
  });

  it('rejects Google profiles without verified email', async () => {
    const { agent, database } = await makeTestApp(googleEnv, {
      googleOAuth: new FakeGoogleOAuthClient({
        sub: 'google-user-3',
        email: 'reader@example.com',
        emailVerified: false,
      }),
    });

    const start = await agent.get('/api/auth/google').expect(302);
    const state = new URL(start.headers.location as string).searchParams.get('state');

    await agent
      .get('/api/auth/google/callback')
      .query({ code: 'google-code', state })
      .expect(401);

    await database.close();
  });
});
