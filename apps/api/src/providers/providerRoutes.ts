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

  router.get('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const list = await providers.list(user.id);
      res.json({ providers: list });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = createProviderSchema.parse(req.body);
      const provider = await providers.create(user.id, input);
      res.status(201).json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = updateProviderSchema.parse(req.body);
      const provider = await providers.update(user.id, req.params.id, input);
      res.json({ provider });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await providers.delete(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
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
