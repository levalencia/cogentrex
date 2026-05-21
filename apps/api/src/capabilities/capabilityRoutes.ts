import { Router } from 'express';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { CapabilityService } from './capabilityService.js';

export function capabilityRoutes(auth: AuthService, capabilities: CapabilityService): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const workflows = await capabilities.listWorkflowReadiness(user.id);
      res.json({ workflows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
