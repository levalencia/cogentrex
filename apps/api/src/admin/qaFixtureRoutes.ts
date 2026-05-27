import { timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { currentUser, requireAdmin, requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { AppEnv } from '../config/env.js';
import { HttpError, notFound } from '../http/errors.js';
import type { QaFixtureService } from './qaFixtureService.js';

const libraryFixtureSchema = z.object({
  targetEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
});

const temporaryAdminSchema = z.object({
  targetEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum(['USER', 'ADMIN']),
});

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function assertQaAdminToken(req: Request, env: Pick<AppEnv, 'QA_FIXTURES_ENABLED' | 'QA_FIXTURE_ADMIN_TOKEN'>) {
  if (!env.QA_FIXTURES_ENABLED || !env.QA_FIXTURE_ADMIN_TOKEN) throw notFound();
  const providedToken = req.get('x-qa-fixture-token');
  if (!providedToken || !constantTimeEquals(providedToken, env.QA_FIXTURE_ADMIN_TOKEN)) throw notFound();
}

function assertQaTargetEmail(email: string) {
  if (!email.endsWith('@cogentrex.test')) {
    throw new HttpError(400, 'QA_FIXTURE_TARGET_NOT_ALLOWED', 'QA fixtures can only target @cogentrex.test users');
  }
}

export function adminQaFixtureRoutes(auth: AuthService, qaFixtures: QaFixtureService, env: Pick<AppEnv, 'QA_FIXTURES_ENABLED' | 'QA_FIXTURE_ADMIN_TOKEN'>): Router {
  const router = Router();

  router.post('/temporary-admin', async (req, res, next) => {
    try {
      assertQaAdminToken(req, env);

      const input = temporaryAdminSchema.parse(req.body);
      assertQaTargetEmail(input.targetEmail);

      const temporaryAdmin = await qaFixtures.updateTemporaryAdminRole(input.targetEmail, input.role);
      if (!temporaryAdmin) throw notFound('Target QA user not found');

      res.json({ temporaryAdmin });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAuth(auth));
  router.use(requireAdmin());

  router.post('/library-fixture', async (req, res, next) => {
    try {
      currentUser(req);
      if (!env.QA_FIXTURES_ENABLED) throw notFound();

      const input = libraryFixtureSchema.parse(req.body);
      assertQaTargetEmail(input.targetEmail);

      const fixture = await qaFixtures.seedLibraryClassificationFixture(input.targetEmail);
      if (!fixture) throw notFound('Target QA user not found');

      res.status(201).json({ fixture });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
