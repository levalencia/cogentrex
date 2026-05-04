import { Router } from 'express';
import { createProviderSchema, updateProviderSchema } from '@cogentrex/shared';
import { currentUser, requireAuth, requireAdmin } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { ProviderService } from '../providers/providerService.js';

export function adminRoutes(auth: AuthService, providers: ProviderService): Router {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(requireAdmin());

  router.get('/providers', (req, res) => {
    const user = currentUser(req);
    res.json({ providers: providers.listGlobal(), admin: user });
  });

  router.post('/providers', (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = createProviderSchema.parse(req.body);
      const provider = providers.createGlobal(user.id, input);
      res.status(201).json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/providers/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = updateProviderSchema.parse(req.body);
      const provider = providers.updateGlobal(user.id, req.params.id, input);
      res.json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/providers/:id', (req, res) => {
    const user = currentUser(req);
    providers.deleteGlobal(user.id, req.params.id);
    res.status(204).end();
  });

  return router;
}
