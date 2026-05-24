import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAdmin, requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { AppEnv } from '../config/env.js';
import { HttpError, notFound } from '../http/errors.js';
import type { QaFixtureService } from './qaFixtureService.js';

const libraryFixtureSchema = z.object({
  targetEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
});

function assertQaTargetEmail(email: string) {
  if (!email.endsWith('@cogentrex.test')) {
    throw new HttpError(400, 'QA_FIXTURE_TARGET_NOT_ALLOWED', 'QA fixtures can only target @cogentrex.test users');
  }
}

export function adminQaFixtureRoutes(auth: AuthService, qaFixtures: QaFixtureService, env: Pick<AppEnv, 'QA_FIXTURES_ENABLED'>): Router {
  const router = Router();
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
