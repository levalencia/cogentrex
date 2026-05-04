import { Router } from 'express';
import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import multer from 'multer';
import { createId } from '../utils/id.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { MediaService } from './mediaService.js';

const generateMediaSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  type: z.enum(['image', 'video']),
  conversationId: z.string().optional(),
  providerId: z.string().optional(),
  options: z.object({
    size: z.string().optional(),
    quality: z.enum(['standard', 'hd', 'low', 'medium', 'high', 'auto']).optional(),
    n: z.number().int().min(1).max(10).optional(),
    style: z.enum(['vivid', 'natural']).optional(),
    responseFormat: z.enum(['url', 'b64_json']).optional(),
    inputImages: z.array(z.string()).max(8).optional(),
  }).optional(),
});

const MEDIA_DIR = resolve(process.cwd(), 'data', 'media');
if (!existsSync(MEDIA_DIR)) {
  mkdirSync(MEDIA_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, _file, cb) => {
      cb(null, `${createId('img')}.png`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 8,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export function mediaRoutes(auth: AuthService, media: MediaService, apiBaseUrl: string): Router {
  const router = Router();

  // Serve generated and uploaded media files publicly so markdown <img> tags can load them.
  router.get('/files/:filename', (req, res) => {
    const filepath = resolve(MEDIA_DIR, req.params.filename);
    // Security: ensure file is inside MEDIA_DIR
    if (!filepath.startsWith(MEDIA_DIR)) {
      res.status(403).end();
      return;
    }
    if (!existsSync(filepath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filepath);
  });

  router.use(requireAuth(auth));

  router.post('/upload', upload.array('images', 8), (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: { code: 'NO_FILES', message: 'No image files provided' } });
        return;
      }
      const results = files.map((file) => ({
        filename: file.filename,
        url: `${apiBaseUrl}/api/media/files/${file.filename}`,
      }));
      res.status(201).json({ files: results });
    } catch (error) {
      next(error);
    }
  });

  router.post('/generate', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = generateMediaSchema.parse(req.body);
      const result = await media.generate({ userId: user.id, ...input });
      res.status(201).json({
        messages: result.messages,
        conversationId: result.conversationId,
        artifact: result.artifact,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/analyze', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const schema = z.object({ filenames: z.array(z.string()).min(1).max(8) });
      const { filenames } = schema.parse(req.body);
      const analysis = await media.analyzeImages(user.id, filenames);
      res.json({ analysis });
    } catch (error) {
      next(error);
    }
  });

  router.post('/enhance-prompt', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const schema = z.object({ prompt: z.string().trim().min(1).max(4000), style: z.string().optional(), context: z.string().optional(), providerId: z.string().optional(), imageType: z.string().optional(), targetProviderId: z.string().optional() });
      const { prompt, style, context, providerId, imageType, targetProviderId } = schema.parse(req.body);
      const enhanced = await media.enhancePrompt(user.id, prompt, style, context, providerId, imageType, targetProviderId);
      res.json({ prompt: enhanced });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
