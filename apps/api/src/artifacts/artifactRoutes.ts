import { Router } from 'express';
import { requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { ArtifactRepository } from './artifactRepository.js';
import { currentUser } from '../auth/authMiddleware.js';

export function artifactRoutes(auth: AuthService, artifacts: ArtifactRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/conversation/:conversationId', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const result = await artifacts.listForConversation(user.id, req.params.conversationId);
      res.json({ artifacts: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const artifact = await artifacts.findById(user.id, req.params.id);
      if (!artifact) {
        res.status(404).json({ error: { message: 'Artifact not found' } });
        return;
      }
      res.json({ artifact });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
