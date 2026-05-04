import { Router } from 'express';
import { createProviderSchema, updateProviderSchema } from '@cogentrex/shared';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { ProviderService } from './providerService.js';
import { providerCatalog } from './providerCatalog.js';

export function providerRoutes(auth: AuthService, providers: ProviderService): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/catalog', (_req, res) => {
    res.json({ catalog: providerCatalog });
  });

  router.get('/', (req, res) => {
    const user = currentUser(req);
    res.json({ providers: providers.list(user.id) });
  });

  router.post('/', (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = createProviderSchema.parse(req.body);
      res.status(201).json({ provider: providers.create(user.id, input) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = updateProviderSchema.parse(req.body);
      res.json({ provider: providers.update(user.id, req.params.id, input) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', (req, res) => {
    const user = currentUser(req);
    providers.delete(user.id, req.params.id);
    res.status(204).end();
  });

  router.post('/:id/test', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const result = await providers.test(user.id, req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
