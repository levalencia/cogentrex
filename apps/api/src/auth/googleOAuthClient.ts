export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleOAuthClient {
  buildAuthorizationUrl(input: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCodeForProfile(code: string, redirectUri: string, codeVerifier?: string): Promise<GoogleProfile>;
}

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export class RealGoogleOAuthClient implements GoogleOAuthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthorizationUrl(input: { state: string; redirectUri: string; codeChallenge?: string }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    if (input.codeChallenge) {
      url.searchParams.set('code_challenge', input.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  async exchangeCodeForProfile(code: string, redirectUri: string, codeVerifier?: string): Promise<GoogleProfile> {
    const tokenBody = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    if (codeVerifier) tokenBody.set('code_verifier', codeVerifier);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const tokenJson = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error_description ?? tokenJson.error ?? 'Google token exchange failed');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profileJson = await profileResponse.json() as GoogleUserInfoResponse;
    if (!profileResponse.ok || !profileJson.sub || !profileJson.email) {
      throw new Error('Google profile fetch failed');
    }

    const profile: GoogleProfile = {
      sub: profileJson.sub,
      email: profileJson.email.toLowerCase(),
      emailVerified: profileJson.email_verified === true,
    };
    if (profileJson.name) profile.name = profileJson.name;
    if (profileJson.picture) profile.picture = profileJson.picture;
    return profile;
  }
}
