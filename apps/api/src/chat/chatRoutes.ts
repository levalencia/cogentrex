import { Router } from 'express';
import { sendMessageSchema } from '@cogentrex/shared';
import type { StreamEvent } from '@cogentrex/shared';
import type { AuthService } from '../auth/authService.js';
import { currentUser, requireAuth } from '../auth/authMiddleware.js';
import { initSse, sendSse } from '../http/sse.js';
import type { ChatService } from './chatService.js';
import type { ResearchService } from '../research/researchService.js';
import type { MetricsRepository } from '../observability/metricsRepository.js';
import type { ArtifactService } from '../artifacts/artifactService.js';

import type { AppLogger } from '../observability/logger.js';

export function chatRoutes(auth: AuthService, chat: ChatService, research: ResearchService, metrics: MetricsRepository, artifacts: ArtifactService, logger: AppLogger): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/conversations', (req, res) => {
    const user = currentUser(req);
    const projectId = req.query.projectId as string | undefined;
    const parsedProjectId = projectId === 'null' ? null : projectId;
    res.json({ conversations: chat.listConversations(user.id, parsedProjectId) });
  });

  router.get('/conversations/:id/messages', (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json({ messages: chat.listMessages(user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:id/metrics', (req, res, next) => {
    try {
      const user = currentUser(req);
      const data = metrics.listForConversation(user.id, req.params.id);
      res.json({ metrics: data });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/conversations/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      const { title, isPinned } = req.body as { title?: string; isPinned?: boolean };
      if (typeof title === 'string') {
        chat.renameConversation(user.id, req.params.id, title);
      }
      if (typeof isPinned === 'boolean') {
        chat.setPinned(user.id, req.params.id, isPinned);
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.patch('/conversations/:id/project', (req, res, next) => {
    try {
      const user = currentUser(req);
      const { projectId } = req.body as { projectId?: string | null };
      chat.setConversationProject(user.id, req.params.id, projectId ?? null);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations/:id', (req, res, next) => {
    try {
      const user = currentUser(req);
      chat.deleteConversation(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations', (req, res, next) => {
    try {
      const user = currentUser(req);
      chat.deleteAllConversations(user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/plan', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { content, providerId } = req.body as { content: string; providerId?: string };
      const result = await research.plan(providerId, user.id, content);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/research', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { jobId, plan } = req.body as { jobId: string; plan: string[] };
      await research.startJob(user.id, jobId, plan);
      res.json({ started: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/research/:jobId', (req, res, next) => {
    try {
      const user = currentUser(req);
      const job = research.getJob(user.id, req.params.jobId);
      if (!job) return res.status(404).json({ error: { message: 'Job not found' } });
      res.json({ job });
    } catch (error) {
      next(error);
    }
  });

  router.get('/research/:jobId/stream', async (req, res) => {
    const user = currentUser(req);
    const job = research.getJob(user.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }
    initSse(res);
    const emit = (event: StreamEvent) => {
      sendSse(res, event);
      if (event.type === 'done' || event.type === 'error') {
        res.end();
      }
    };
    const sub = research.subscribe(user.id, req.params.jobId, emit);
    req.on('close', () => sub.unsubscribe());
  });

  router.post('/stream', async (req, res) => {
    const user = currentUser(req);
    const input = sendMessageSchema.parse(req.body);
    initSse(res);
    const emit = (event: Parameters<typeof sendSse>[1]) => sendSse(res, event);
    try {
      if (input.mode === 'DEEP_RESEARCH') {
        await research.run?.({
          userId: user.id,
          question: input.content,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.providerId ? { providerId: input.providerId } : {}),
          emit,
        });
      } else {
        await chat.streamChat({
          userId: user.id,
          content: input.content,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.providerId ? { providerId: input.providerId } : {}),
          emit,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Streaming failed';
      const code = error instanceof Error && 'status' in error ? (error as { status: number }).status : undefined;
      logger.error({ requestId: req.requestId, userId: user.id, errorCode: code, errorMessage: message }, 'chat_stream_error');
      emit({ type: 'error', code: 'STREAM_ERROR', message });
    } finally {
      res.end();
    }
  });

  return router;
}
