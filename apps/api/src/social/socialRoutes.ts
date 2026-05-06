import { Router } from 'express';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { SocialWritingService } from './socialWritingService.js';
import type { SocialConfigRepository } from './socialConfigRepository.js';
import type { AppLogger } from '../observability/logger.js';

export function socialRoutes(
  auth: AuthService,
  social: SocialWritingService,
  configs: SocialConfigRepository,
  logger: AppLogger,
): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.post('/generate', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { topic, platforms, imageUrls, useResearch, researchSources, providerId } = req.body as {
        topic: string;
        platforms: string[];
        imageUrls?: string[];
        useResearch?: boolean;
        researchSources?: number;
        providerId?: string;
      };

      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic is required' });
        return;
      }
      if (!Array.isArray(platforms) || platforms.length === 0) {
        res.status(400).json({ error: 'At least one platform is required' });
        return;
      }

      const result = await social.generate({
        userId: user.id,
        topic,
        platforms,
        imageUrls,
        useResearch,
        researchSources,
        providerId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/config', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const configsList = await configs.listForUser(user.id);
      res.json({
        configs: configsList.map((c) => ({
          platform: c.platform,
          label: platformLabel(c.platform),
          systemPrompt: c.systemPrompt,
          isEnabled: c.isEnabled,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/config/:platform', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { platform } = req.params;
      const { systemPrompt, isEnabled } = req.body as { systemPrompt?: string; isEnabled?: boolean };

      if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
        res.status(400).json({ error: 'systemPrompt is required' });
        return;
      }

      await configs.upsert(user.id, platform, systemPrompt, isEnabled ?? true);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    linkedin: 'LinkedIn',
    x: 'X (Twitter)',
    medium: 'Medium',
    reddit: 'Reddit',
    substack: 'Substack',
  };
  return labels[platform] ?? platform;
}
