import { Router } from 'express';
import { createSkillSchema, importSkillKitSchema, updateSkillRouteSchema, updateSkillSchema } from '@cogentrex/shared';
import { currentUser, requireAuth, requireAdmin } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { AppEnv } from '../config/env.js';
import type { ProviderService } from '../providers/providerService.js';
import type { SkillService } from './skillService.js';
import { buildSkillReadiness } from './skillReadiness.js';

import type { SkillRunRepository } from './skillRunRepository.js';

export function skillRoutes(auth: AuthService, skills: SkillService, providers: ProviderService, env: AppEnv, skillRuns: SkillRunRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ skills: await skills.listVisible() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/readiness', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const [visibleSkills, availableProviders] = await Promise.all([
        skills.listVisibleDetails(),
        providers.list(user.id),
      ]);
      res.json({ skills: buildSkillReadiness(visibleSkills, availableProviders, env) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/runs', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
      res.json({ runs: await skillRuns.listForUser(user.id, Number.isFinite(limit) ? limit : 50) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/runs/:id/events', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const events = await skillRuns.listEventsForUserRun(user.id, req.params.id);
      if (!events) {
        res.status(404).json({ error: { message: 'Skill run not found' } });
        return;
      }
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:slug', async (req, res, next) => {
    try {
      res.json({ skill: await skills.getVisible(req.params.slug) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function adminSkillRoutes(auth: AuthService, skills: SkillService): Router {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(requireAdmin());

  router.get('/', async (req, res, next) => {
    try {
      const admin = currentUser(req);
      res.json({ skills: await skills.listAll(), admin });
    } catch (error) {
      next(error);
    }
  });

  router.post('/import-kit', async (req, res, next) => {
    try {
      const input = importSkillKitSchema.parse(req.body);
      const result = await skills.importSkillKit(input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = createSkillSchema.parse(req.body);
      const result = await skills.createSkill(input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:slug/files', async (req, res, next) => {
    try {
      res.json({ files: await skills.listFiles(req.params.slug) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:slug', async (req, res, next) => {
    try {
      const input = updateSkillSchema.parse(req.body);
      res.json({ skill: await skills.updateSkill(req.params.slug, input) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:slug/route', async (req, res, next) => {
    try {
      const input = updateSkillRouteSchema.parse(req.body);
      res.json({ route: await skills.updateRoute(req.params.slug, input) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
