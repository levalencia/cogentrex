import { Router } from 'express';
import { createProviderSchema, updateProviderSchema } from '@cogentrex/shared';
import { currentUser, requireAuth, requireAdmin } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { ProviderService } from '../providers/providerService.js';

export function adminRoutes(auth: AuthService, providers: ProviderService): Router {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(requireAdmin());

  router.get('/providers', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const list = await providers.listGlobal();
      res.json({ providers: list, admin: user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/providers', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = createProviderSchema.parse(req.body);
      const provider = await providers.createGlobal(user.id, input);
      res.status(201).json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/providers/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = updateProviderSchema.parse(req.body);
      const provider = await providers.updateGlobal(user.id, req.params.id, input);
      res.json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/providers/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await providers.deleteGlobal(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
