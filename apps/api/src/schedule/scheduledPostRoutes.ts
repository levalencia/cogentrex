import { Router } from 'express';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { ScheduledPostService } from './scheduledPostService.js';

export function scheduledPostRoutes(auth: AuthService, service: ScheduledPostService): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', (req, res, next) => {
    try {
      const user = currentUser(req);
      const posts = service.listForUser(user.id);
      res.json({ posts });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const user = currentUser(req);
      const { platform, content, imageArtifactId, postAt } = req.body as {
        platform: string;
        content: string;
        imageArtifactId?: string;
        postAt: string;
      };
      if (!platform || !content || !postAt) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'platform, content, and postAt are required' } });
        return;
      }
      service.schedule(user.id, platform, content, imageArtifactId ?? null, postAt);
      res.status(201).json({ scheduled: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { content, imageArtifactId, postAt } = req.body as {
        content: string;
        imageArtifactId?: string;
        postAt?: string;
      };
      if (!content) {
        res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'content is required' } });
        return;
      }
      const existing = (await service.listForUser(user.id)).find((p) => p.id === req.params.id);
      if (!existing) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
        return;
      }
      await service.updatePost(user.id, req.params.id, content, imageArtifactId ?? existing.imageArtifactId ?? null, postAt ?? existing.postAt);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      service.cancel(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
