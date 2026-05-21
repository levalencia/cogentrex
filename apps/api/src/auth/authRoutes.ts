import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { loginSchema, registerSchema } from '@cogentrex/shared';
import type { AuthService } from './authService.js';
import { requireAuth } from './authMiddleware.js';
import type { GoogleOAuthClient } from './googleOAuthClient.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const oauthCookieOptions = {
  ...cookieOptions,
  maxAge: 10 * 60 * 1000,
};

const clearCookieOptions = {
  httpOnly: cookieOptions.httpOnly,
  sameSite: cookieOptions.sameSite,
  secure: cookieOptions.secure,
};

export interface AuthRouteOptions {
  googleOAuth?: GoogleOAuthClient | null;
  googleRedirectUri?: string | undefined;
  webOrigin: string;
}

function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function firstWebOrigin(webOrigin: string): string {
  return webOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)[0] ?? 'http://localhost:3000';
}

export function authRoutes(auth: AuthService, options: AuthRouteOptions = { webOrigin: 'http://localhost:3000' }): Router {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const result = await auth.register(input);
      res.cookie('session', result.token, cookieOptions);
      res.status(201).json({ user: result.user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = await auth.login(input);
      res.cookie('session', result.token, cookieOptions);
      res.json({ user: result.user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie('session', clearCookieOptions);
    res.status(204).end();
  });

  router.get('/google', (_req, res) => {
    if (!options.googleOAuth || !options.googleRedirectUri) {
      res.status(404).json({ error: { message: 'Google OAuth is not configured' } });
      return;
    }

    const state = randomBase64Url();
    const verifier = randomBase64Url(48);
    res.cookie('oauth_state', state, oauthCookieOptions);
    res.cookie('oauth_code_verifier', verifier, oauthCookieOptions);
    res.redirect(options.googleOAuth.buildAuthorizationUrl({
      state,
      redirectUri: options.googleRedirectUri,
      codeChallenge: codeChallenge(verifier),
    }));
  });

  router.get('/google/callback', async (req, res, next) => {
    try {
      if (!options.googleOAuth || !options.googleRedirectUri) {
        res.status(404).json({ error: { message: 'Google OAuth is not configured' } });
        return;
      }

      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const expectedState = req.cookies?.oauth_state as string | undefined;
      const codeVerifier = req.cookies?.oauth_code_verifier as string | undefined;
      if (!state || !code || !expectedState || state !== expectedState) {
        res.status(401).json({ error: { message: 'Invalid OAuth state' } });
        return;
      }

      const profile = await options.googleOAuth.exchangeCodeForProfile(code, options.googleRedirectUri, codeVerifier);
      const result = await auth.loginWithGoogleProfile(profile);
      res.clearCookie('oauth_state', clearCookieOptions);
      res.clearCookie('oauth_code_verifier', clearCookieOptions);
      res.cookie('session', result.token, cookieOptions);
      res.redirect(firstWebOrigin(options.webOrigin));
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAuth(auth), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
