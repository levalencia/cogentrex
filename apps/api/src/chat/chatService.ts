import type { SkillAssistMode, StreamEvent } from '@cogentrex/shared';
import { notFound } from '../http/errors.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { ProviderService } from '../providers/providerService.js';
import type { ProviderUsageRepository } from '../providers/providerUsageRepository.js';
import type { MetricsRepository } from '../observability/metricsRepository.js';
import type { ConversationRepository } from './conversationRepository.js';
import type { LanguageModelClient } from './languageModel.js';
import { toModelMessages } from './languageModel.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import type { ArtifactService } from '../artifacts/artifactService.js';
import type { SkillRunRepository } from '../skills/skillRunRepository.js';
import type { SkillService } from '../skills/skillService.js';
import { buildSkillAssistRunAudit, withSkillAssistSystemMessage } from '../skills/skillAssist.js';
import { randomBytes } from 'node:crypto';

export type StreamSink = (event: StreamEvent) => void;

export class ChatService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly providers: ProviderService,
    private readonly llm: LanguageModelClient,
    private readonly usage: ProviderUsageRepository,
    private readonly metrics: MetricsRepository,
    private readonly logger: AppLogger,
    private readonly artifacts?: ArtifactService,
    private readonly skillRuns?: SkillRunRepository,
    private readonly skills?: SkillService,
  ) {}

  async listConversations(userId: string, projectId?: string | null) {
    return await this.conversations.list(userId, projectId);
  }

  async getConversation(userId: string, conversationId: string) {
    return await this.conversations.findForUser(userId, conversationId);
  }

  async listMessages(userId: string, conversationId: string) {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    return await this.conversations.listMessages(conversationId);
  }

  async renameConversation(userId: string, conversationId: string, title: string) {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    await this.conversations.updateTitle(userId, conversationId, title, nowIso());
  }

  async setPinned(userId: string, conversationId: string, pinned: boolean) {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    await this.conversations.setPinned(userId, conversationId, pinned);
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    await this.conversations.delete(userId, conversationId);
  }

  async deleteAllConversations(userId: string): Promise<void> {
    await this.conversations.deleteAll(userId);
  }

  async setConversationProject(userId: string, conversationId: string, projectId: string | null): Promise<void> {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    await this.conversations.setProject(userId, conversationId, projectId);
  }

  async streamChat(input: {
    userId: string;
    content: string;
    conversationId?: string;
    providerId?: string;
    useSkills?: boolean;
    skillAssistMode?: SkillAssistMode;
    selectedSkillSlug?: string;
    selectedSkillSlugs?: string[];
    emit: StreamSink;
  }): Promise<{ conversationId: string; content: string }> {
    const startedAt = performance.now();
    const now = nowIso();
    const conversation = input.conversationId
      ? await this.conversations.findForUser(input.userId, input.conversationId)
      : await this.conversations.create({
          id: createId('cnv'),
          userId: input.userId,
          title: input.content.slice(0, 80),
          mode: 'CHAT',
          now,
        });

    if (!conversation) throw notFound('Conversation not found');
    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: input.providerId,
      promptHash: hashForLog(input.content),
      promptLength: input.content.length,
    }, 'chat_stream_started');
    const userMessage = await this.conversations.addMessage({
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'user',
      content: input.content,
      now,
    });
    const assistantMessageId = createId('msg');
    input.emit({ type: 'start', conversationId: conversation.id, messageId: assistantMessageId, mode: 'CHAT' });

    const provider = await this.providers.resolveForMode(input.userId, 'CHAT', input.providerId);
    const history = await this.conversations.listMessages(conversation.id);
    const baseModelMessages = toModelMessages(history);
    const registrySkills = input.useSkills && this.skills
      ? await this.skills.listVisibleDetails().catch((error) => {
          const message = error instanceof Error ? error.message : 'Skill registry lookup failed';
          this.logger.warn({ conversationId: conversation.id, errorMessage: message }, 'skill_assist_registry_lookup_failed');
          return undefined;
        })
      : undefined;
    const selectedSkillSlugs = input.selectedSkillSlugs?.length ? input.selectedSkillSlugs : (input.selectedSkillSlug ? [input.selectedSkillSlug] : undefined);
    const skillAssistEnabled = Boolean(input.useSkills && input.skillAssistMode !== 'off');
    const skillAssistMode = skillAssistEnabled ? input.skillAssistMode ?? 'auto' : 'off';
    const assisted = skillAssistEnabled ? withSkillAssistSystemMessage(baseModelMessages, input.content, registrySkills, selectedSkillSlugs, skillAssistMode) : null;
    const modelMessages = assisted?.messages ?? baseModelMessages;
    this.logger.debug({
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      historyMessages: history.length,
      skillAssistEnabled,
      skillAssistMode,
      skillAssistSlugs: assisted?.skillSlugs,
    }, 'chat_model_stream_opening');
    let content = '';
    const streamStarted = performance.now();
    let firstTokenAt: number | null = null;
    try {
      for await (const delta of this.llm.streamChat(provider, modelMessages)) {
        if (!firstTokenAt) firstTokenAt = performance.now();
        content += delta;
        input.emit({ type: 'delta', content: delta });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider stream failed';
      this.logger.error({
        conversationId: conversation.id,
        providerId: provider.id,
        model: provider.model,
        baseUrl: provider.baseUrl,
        errorMessage: message,
      }, 'chat_stream_provider_error');
      throw error;
    }
    const streamEnded = performance.now();
    const ttftMs = firstTokenAt ? Math.round(firstTokenAt - streamStarted) : undefined;
    const durationMs = Math.round(streamEnded - streamStarted);
    const estimatedTokens = Math.round(content.length / 4);
    const tps = durationMs > 0 ? Math.round((estimatedTokens / durationMs) * 1000 * 10) / 10 : undefined;

    await this.conversations.addMessage({
      id: assistantMessageId,
      conversationId: conversation.id,
      role: 'assistant',
      content,
      now: nowIso(),
    });

    // Auto-generate a concise title after the first exchange in a new conversation
    let generatedTitle: string | undefined;
    if (!input.conversationId) {
      try {
        const titleMessages = [
          {
            role: 'system' as const,
            content: 'Generate a very short, concise title (3-5 words) for this conversation based on the user\'s first message and the assistant\'s response. Return ONLY the title text, no quotes, no explanation, no markdown.',
          },
          {
            role: 'user' as const,
            content: `User: ${input.content}\n\nAssistant: ${content.slice(0, 500)}`,
          },
        ];
        const rawTitle = await this.llm.complete(provider, titleMessages);
        generatedTitle = rawTitle.trim().replace(/["']+/g, '').slice(0, 50);
        if (generatedTitle.length > 3) {
          await this.conversations.updateTitle(input.userId, conversation.id, generatedTitle, nowIso());
          this.logger.info({ userId: input.userId, conversationId: conversation.id, title: generatedTitle }, 'conversation_title_generated');
        }
      } catch (titleError) {
        const message = titleError instanceof Error ? titleError.message : 'Title generation failed';
        this.logger.warn({ userId: input.userId, conversationId: conversation.id, errorMessage: message }, 'title_generation_failed');
        // Non-critical: keep the original sliced prompt as title
      }
    }

    // Extract and persist artifacts before emitting done
    if (this.artifacts) {
      try {
        const tagged = await this.artifacts.extractTaggedArtifacts(content);
        const heuristic = await this.artifacts.extractHeuristicArtifacts(content);
        const allArtifacts = [...tagged, ...heuristic];
        for (const detected of allArtifacts) {
          await await this.artifacts.persistArtifact(input.userId, conversation.id, assistantMessageId, detected, input.emit);
        }
      } catch (artifactError) {
        const message = artifactError instanceof Error ? artifactError.message : 'Artifact extraction failed';
        this.logger.warn({ userId: input.userId, conversationId: conversation.id, errorMessage: message }, 'artifact_extraction_failed');
      }
    }

    input.emit({ type: 'done', content, ...(generatedTitle ? { title: generatedTitle } : {}) });
    const tokenCount = Math.round(content.length / 4);
    await this.usage.record(input.userId, provider.id, tokenCount);

    await this.metrics.record({
      userId: input.userId,
      conversationId: conversation.id,
      messageId: assistantMessageId,
      providerId: provider.id,
      model: provider.model,
      mode: 'CHAT',
      step: 'chat_stream',
      durationMs,
      completionTokens: estimatedTokens,
      totalTokens: estimatedTokens,
      ttftMs,
      tps,
    });

    if (this.skillRuns) {
      const skillAssistSelectedSlugs = selectedSkillSlugs ?? [];
      const skillAssistInjectedSlugs = assisted?.skillSlugs ?? [];
      const skillAssistAudit = skillAssistEnabled
        ? buildSkillAssistRunAudit({
            selectedSlugs: skillAssistSelectedSlugs,
            injectedSlugs: skillAssistInjectedSlugs,
            assistantContent: content,
          })
        : [];
      const observability = {
        messageId: assistantMessageId,
        estimatedTokens,
        durationMs,
        ttftMs: ttftMs ?? null,
        tps: tps ?? null,
        skillAssistEnabled,
        skillAssistMode,
        skillAssistSlugs: skillAssistInjectedSlugs,
        skillAssistSelectedSlugs,
        skillAssistInjectedSlugs,
        skillAssistAudit,
      };
      const run = await this.skillRuns.safeCreate({
        userId: input.userId,
        skillId: 'skl_chat',
        skillSlug: 'chat',
        skillName: 'Chat',
        mode: 'CHAT',
        conversationId: conversation.id,
        providerId: provider.id,
        observability,
      });
      await this.skillRuns.safeComplete(run?.id, { status: 'completed', observability });
    }

    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: provider.id,
      responseLength: content.length,
      durationMs,
      ttftMs,
      tps,
      durationMsTotal: Math.round(performance.now() - startedAt),
    }, 'chat_stream_finished');
    return { conversationId: conversation.id, content };
  }

  async shareConversation(userId: string, conversationId: string): Promise<{ shareToken: string }> {
    const conversation = await this.conversations.findForUser(userId, conversationId);
    if (!conversation) throw notFound('Conversation not found');
    const token = randomBytes(24).toString('hex');
    await this.conversations.setShareToken(userId, conversationId, token, nowIso());
    return { shareToken: token };
  }

  async unshareConversation(userId: string, conversationId: string): Promise<void> {
    await this.conversations.setShareToken(userId, conversationId, null, nowIso());
  }

  async getSharedConversation(token: string) {
    const conversation = await this.conversations.findByShareToken(token);
    if (!conversation) throw notFound('Shared conversation not found');
    const messages = await this.conversations.listMessages(conversation.id);
    return { conversation, messages };
  }
}
