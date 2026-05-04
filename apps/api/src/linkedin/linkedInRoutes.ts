import { Router } from 'express';
import { resolve } from 'path';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { LinkedInPostService } from './linkedInPostService.js';
import type { MediaRepository } from '../media/mediaRepository.js';
import type { ScheduledPostService } from '../schedule/scheduledPostService.js';
import { randomBytes } from 'crypto';

const MEDIA_DIR = resolve(process.cwd(), 'data', 'media');

export function linkedInRoutes(auth: AuthService, linkedIn: LinkedInPostService, media: MediaRepository, scheduledPosts: ScheduledPostService): Router {
  const router = Router();

  router.get('/status', requireAuth(auth), (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json(linkedIn.getStatus(user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/connect', requireAuth(auth), (req, res) => {
    const user = currentUser(req);
    const state = randomBytes(32).toString('hex');
    // Store state in cookie for CSRF protection
    res.cookie('linkedin_state', state, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });
    res.cookie('linkedin_user_id', user.id, { httpOnly: true, maxAge: 600000, sameSite: 'lax' });
    res.redirect(linkedIn.getAuthorizationUrl(state));
  });

  router.get('/callback', async (req, res, next) => {
    try {
      const { code, state, error, error_description } = req.query as { code?: string; state?: string; error?: string; error_description?: string };
      if (error) {
        res.status(400).send(`LinkedIn authorization failed: ${error_description ?? error}`);
        return;
      }
      const cookieState = req.cookies?.linkedin_state as string | undefined;
      const userId = req.cookies?.linkedin_user_id as string | undefined;

      if (!code || !state || state !== cookieState || !userId) {
        res.status(400).send('Invalid or expired LinkedIn authorization request');
        return;
      }

      await linkedIn.connect(userId, code);

      // Clear cookies
      res.clearCookie('linkedin_state');
      res.clearCookie('linkedin_user_id');

      // Send HTML that notifies the parent window and closes
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#0b0f19;color:#fff;">
            <div style="text-align:center;">
              <div style="font-size:48px;margin-bottom:16px;">✅</div>
              <h2 style="margin:0 0 8px;">LinkedIn Connected!</h2>
              <p style="color:#94a3b8;margin:0;">You can close this window.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage('linkedin:connected', '*');
              }
              setTimeout(() => window.close(), 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      next(error);
    }
  });

  router.post('/disconnect', requireAuth(auth), (req, res, next) => {
    try {
      const user = currentUser(req);
      linkedIn.disconnect(user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.put('/person-urn', requireAuth(auth), (req, res, next) => {
    try {
      const user = currentUser(req);
      const { personUrn } = req.body as { personUrn?: string };
      if (!personUrn || typeof personUrn !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_PERSON_URN', message: 'personUrn is required' } });
        return;
      }
      linkedIn.setPersonUrn(user.id, personUrn.trim());
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/post', requireAuth(auth), async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { content, imageArtifactId, visibility } = req.body as {
        content: string;
        imageArtifactId?: string;
        visibility?: 'PUBLIC' | 'CONNECTIONS';
      };
      const vis = visibility ?? 'PUBLIC';
      let postId: string;
      if (imageArtifactId && typeof imageArtifactId === 'string') {
        const artifact = media.findById(user.id, imageArtifactId);
        if (!artifact?.localPath) {
          res.status(400).json({ error: { code: 'IMAGE_NOT_FOUND', message: 'Image artifact not found' } });
          return;
        }
        postId = await linkedIn.postWithImage(user.id, content, resolve(MEDIA_DIR, artifact.localPath), vis);
      } else {
        postId = await linkedIn.postText(user.id, content, vis);
      }
      // Log the immediate post for dashboard tracking
      scheduledPosts.logPosted(user.id, 'linkedin', content, imageArtifactId ?? null);
      res.json({ postId, posted: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
