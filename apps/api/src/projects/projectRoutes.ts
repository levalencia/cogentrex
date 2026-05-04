import { Router } from 'express';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { ProjectRepository } from './projectRepository.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

export function projectRoutes(auth: AuthService, projects: ProjectRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const list = await projects.listForUser(user.id);
      res.json({ projects: list });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required' } });
        return;
      }
      const now = nowIso();
      const project = await projects.create({
        id: createId('prj'),
        userId: user.id,
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required' } });
        return;
      }
      await projects.update(user.id, req.params.id, name.trim(), nowIso());
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await projects.delete(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
