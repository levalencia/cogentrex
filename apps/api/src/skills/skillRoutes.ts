import { Router } from 'express';
import { updateSkillRouteSchema, updateSkillSchema } from '@cogentrex/shared';
import { currentUser, requireAuth, requireAdmin } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { SkillService } from './skillService.js';

export function skillRoutes(auth: AuthService, skills: SkillService): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ skills: await skills.listVisible() });
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
