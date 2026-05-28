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

  // Public share endpoint (no auth required)
  router.get('/share/:token', async (req, res, next) => {
    try {
      const result = await chat.getSharedConversation(req.params.token);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAuth(auth));

  router.get('/conversations', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const projectId = req.query.projectId as string | undefined;
      const parsedProjectId = projectId === 'null' ? null : projectId;
      const conversations = await chat.listConversations(user.id, parsedProjectId);
      res.json({ conversations });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:id/messages', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const messages = await chat.listMessages(user.id, req.params.id);
      res.json({ messages });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:id/metrics', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const data = await metrics.listForConversation(user.id, req.params.id);
      res.json({ metrics: data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:id/diagnostics', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const conversation = await chat.getConversation(user.id, req.params.id);
      if (!conversation) return res.status(404).json({ error: { message: 'Conversation not found' } });
      const metricsData = await metrics.listForConversation(user.id, req.params.id);
      let reasoning: StreamEvent[] | undefined;
      if (conversation.mode === 'DEEP_RESEARCH') {
        const jobs = await research.getJobsByConversation(user.id, req.params.id);
        const job = jobs[0];
        if (job && job.reasoning) {
          reasoning = job.reasoning as StreamEvent[];
        } else {
          const messages = await chat.listMessages(user.id, req.params.id);
          const assistantMessage = [...messages]
            .reverse()
            .find((message) => message.role === 'assistant' && Array.isArray(message.metadata?.reasoning));
          reasoning = assistantMessage?.metadata?.reasoning as StreamEvent[] | undefined;
        }
      }
      res.json({ metrics: metricsData, reasoning });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/conversations/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { title, isPinned } = req.body as { title?: string; isPinned?: boolean };
      if (typeof title === 'string') {
        await chat.renameConversation(user.id, req.params.id, title);
      }
      if (typeof isPinned === 'boolean') {
        await chat.setPinned(user.id, req.params.id, isPinned);
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.patch('/conversations/:id/project', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { projectId } = req.body as { projectId?: string | null };
      await chat.setConversationProject(user.id, req.params.id, projectId ?? null);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await chat.deleteConversation(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await chat.deleteAllConversations(user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/conversations/:id/share', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const result = await chat.shareConversation(user.id, req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/conversations/:id/share', async (req, res, next) => {
    try {
      const user = currentUser(req);
      await chat.unshareConversation(user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/plan', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const { content, providerId, conversationId, useSkills } = req.body as { content: string; providerId?: string; conversationId?: string; useSkills?: boolean };
      const result = await research.plan(providerId, user.id, content, conversationId, useSkills ?? false);
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

  router.get('/research/:jobId', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const job = await research.getJob(user.id, req.params.jobId);
      if (!job) return res.status(404).json({ error: { message: 'Job not found' } });
      res.json({ job });
    } catch (error) {
      next(error);
    }
  });

  router.get('/research/:jobId/stream', async (req, res) => {
    const user = currentUser(req);
    const job = await research.getJob(user.id, req.params.jobId);
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
    const sub = await research.subscribe(user.id, req.params.jobId, emit);
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
          useSkills: input.useSkills,
          emit,
        });
      } else {
        await chat.streamChat({
          userId: user.id,
          content: input.content,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.providerId ? { providerId: input.providerId } : {}),
          useSkills: input.useSkills,
          ...(input.selectedSkillSlug ? { selectedSkillSlug: input.selectedSkillSlug } : {}),
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
