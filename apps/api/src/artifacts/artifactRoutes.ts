import { Router } from 'express';
import { createArtifactFromMessageSchema } from '@cogentrex/shared';
import { requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { ArtifactRepository } from './artifactRepository.js';
import { currentUser } from '../auth/authMiddleware.js';

export function artifactRoutes(auth: AuthService, artifacts: ArtifactRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const result = await artifacts.listForUser(user.id);
      res.json({ artifacts: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/from-message', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = createArtifactFromMessageSchema.parse(req.body);
      const artifact = await artifacts.createFromMessage(user.id, input.messageId);
      if (!artifact) {
        res.status(404).json({ error: { message: 'Message not found' } });
        return;
      }
      res.status(201).json({ artifact });
    } catch (error) {
      next(error);
    }
  });

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
