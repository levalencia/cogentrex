import { Router } from 'express';
import { loginSchema, registerSchema } from '@cogentrex/shared';
import type { AuthService } from './authService.js';
import { requireAuth } from './authMiddleware.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function authRoutes(auth: AuthService): Router {
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
    res.clearCookie('session', cookieOptions);
    res.status(204).end();
  });

  router.get('/me', requireAuth(auth), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
