import { Router } from 'express';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { ProjectRepository } from './projectRepository.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

export function projectRoutes(auth: AuthService, projects: ProjectRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', (req, res, next) => {
    try {
      const user = currentUser(req);
      const list = projects.listForUser(user.id);
      res.json({ projects: list });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const user = currentUser(req);
      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required' } });
        return;
      }
      const now = nowIso();
      const project = projects.create({
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

  router.patch('/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required' } });
        return;
      }
      projects.update(user.id, req.params.id, name.trim(), nowIso());
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      projects.delete(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
