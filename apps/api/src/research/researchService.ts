import type { ResearchSource, StreamEvent } from '@cogentrex/shared';
import { EventEmitter } from 'events';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { ProviderService } from '../providers/providerService.js';
import type { ProviderUsageRepository } from '../providers/providerUsageRepository.js';
import type { MetricsRepository } from '../observability/metricsRepository.js';
import type { ConversationRepository } from '../chat/conversationRepository.js';
import type { LanguageModelClient } from '../chat/languageModel.js';
import type { WebSearchClient, ScrapedPage } from '../tools/searchClient.js';
import type { ChannelRegistry } from '../tools/channels/channelRegistry.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import { formatSourcesForPrompt, createSynthesisMessages } from './researchPrompts.js';
import { ResearchPlanner, parsePlanItem } from './researchPlanner.js';
import { ResearchJobRepository } from './researchJobRepository.js';

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?)$]+$/, ''))));
}

export function buildSeedContext(pages: ScrapedPage[]): string | undefined {
  if (!pages.length) return undefined;
  return pages
    .map((page) => `URL: ${page.url}\nTitle: ${page.title}\nDescription: ${page.description ?? ''}\nContent:\n${page.markdown.slice(0, 2000)}`)
    .join('\n\n---\n\n');
}

type StreamSink = (event: StreamEvent) => void;

interface JobEntry {
  emitter: EventEmitter;
  buffer: StreamEvent[];
}

export class ResearchService {
  private readonly planner: ResearchPlanner;
  private readonly jobs = new Map<string, JobEntry>();

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly providers: ProviderService,
    private readonly llm: LanguageModelClient,
    private readonly search: WebSearchClient,
    private readonly channels: ChannelRegistry,
    private readonly jobsRepo: ResearchJobRepository,
    private readonly usage: ProviderUsageRepository,
    private readonly metrics: MetricsRepository,
    private readonly logger: AppLogger,
  ) {
    this.planner = new ResearchPlanner(llm);
  }

  async plan(providerId: string | undefined, userId: string, question: string): Promise<{ plan: string[]; jobId: string; conversationId: string; scrapedUrls: string[]; failedUrls: string[] }> {
    const now = nowIso();
    const conversation = this.conversations.create({
      id: createId('cnv'),
      userId,
      title: question.slice(0, 80),
      mode: 'DEEP_RESEARCH',
      now,
    });
    const provider = this.providers.resolveForMode(userId, 'DEEP_RESEARCH', providerId);

    const urls = extractUrls(question);
    const scrapedPages: ScrapedPage[] = [];
    const failedUrls: string[] = [];

    const scrapeStarted = performance.now();
    if (urls.length) {
      this.logger.info({ userId, conversationId: conversation.id, urlCount: urls.length }, 'research_url_scrape_started');
      for (const url of urls) {
        try {
          const page = await this.search.scrape(url);
          if (page) {
            scrapedPages.push(page);
          } else {
            failedUrls.push(url);
            const searchQuery = url;
            try {
              const results = await this.search.search(searchQuery, 3);
              for (const result of results.slice(0, 2)) {
                scrapedPages.push({
                  url: result.url,
                  title: result.title,
                  markdown: result.markdown.slice(0, 2000),
                  description: result.description,
                });
              }
            } catch {
              // ignore search fallback errors
            }
          }
        } catch {
          failedUrls.push(url);
        }
      }
      this.logger.info({ userId, conversationId: conversation.id, scrapedCount: scrapedPages.length, failedCount: failedUrls.length }, 'research_url_scrape_finished');
    }
    const scrapeDuration = Math.round(performance.now() - scrapeStarted);

    this.metrics.record({
      userId,
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'url_scraping',
      durationMs: scrapeDuration,
      metadata: { urlCount: urls.length, scrapedCount: scrapedPages.length, failedCount: failedUrls.length },
    });

    const planningStarted = performance.now();
    const seedContext = buildSeedContext(scrapedPages);
    const planItems = (await this.planner.plan(provider, question, seedContext)).slice(0, 10);
    const planStrings = planItems.map((item) => `${item.channel}:${item.query}`);
    const planningDuration = Math.round(performance.now() - planningStarted);

    this.metrics.record({
      userId,
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'planning',
      durationMs: planningDuration,
      metadata: { queryCount: planStrings.length },
    });

    const job = this.jobsRepo.create({
      id: createId('job'),
      userId,
      conversationId: conversation.id,
      providerId: provider.id,
      status: 'pending',
      question,
      plan: planStrings,
      createdAt: now,
      updatedAt: now,
    });
    return { plan: planStrings, jobId: job.id, conversationId: conversation.id, scrapedUrls: scrapedPages.map((p) => p.url), failedUrls };
  }

  async startJob(userId: string, jobId: string, plan: string[]): Promise<void> {
    const job = this.jobsRepo.findById(userId, jobId);
    if (!job) throw new Error('Job not found');
    const conversation = this.conversations.findForUser(userId, job.conversationId!);
    if (!conversation) throw new Error('Conversation not found');

    const emitter = new EventEmitter();
    const entry: JobEntry = { emitter, buffer: [] };
    this.jobs.set(jobId, entry);
    this.jobsRepo.updateStatus(jobId, 'running', nowIso());

    const provider = this.providers.resolveForMode(userId, 'DEEP_RESEARCH', job.providerId ?? undefined);
    const assistantMessageId = createId('msg');
    this.conversations.addMessage({ id: createId('msg'), conversationId: conversation.id, role: 'user', content: job.question, now: nowIso() });

    const reasoningLog: StreamEvent[] = [];
    const sources: ResearchSource[] = [];
    const excerpts = new Map<number, string>();
    const seenUrls = new Set<string>();

    const emit = (event: StreamEvent) => {
      reasoningLog.push(event);
      entry.buffer.push(event);
      emitter.emit('event', event);
      this.jobsRepo.updateStatus(jobId, 'running', nowIso(), { reasoning: reasoningLog.map((e) => ({ ...e })) });
    };

    // Fire background work without awaiting at the call site
    void (async () => {
      const startedAt = performance.now();
      emit({ type: 'start', conversationId: conversation.id, messageId: assistantMessageId, mode: 'DEEP_RESEARCH' });
      try {
        for (const [index, rawQuery] of plan.entries()) {
          const item = parsePlanItem(rawQuery);
          const iteration = index + 1;
          const iterationStarted = performance.now();
          emit({ type: 'reasoning', step: `Searching ${item.channel}`, detail: item.query, iteration });
          this.logger.info({ jobId, iteration, channel: item.channel, queryHash: hashForLog(item.query), queryLength: item.query.length }, 'research_search_started');
          let results;
          try {
            results = await this.channels.search(item.channel, item.query, 5);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Search failed';
            this.logger.error({ jobId, iteration, channel: item.channel, errorMessage: message }, 'research_search_failed');
            continue;
          }
          for (const result of results) {
            if (seenUrls.has(result.url)) continue;
            seenUrls.add(result.url);
            const id = sources.length + 1;
            const source: ResearchSource = { id, title: result.title, url: result.url, snippet: result.description ?? result.markdown.slice(0, 240), channel: result.channel };
            sources.push(source);
            excerpts.set(id, result.markdown.slice(0, 3500));
            emit({ type: 'source', source });
          }
          const iterationDuration = Math.round(performance.now() - iterationStarted);
          this.metrics.record({
            userId,
            conversationId: conversation.id,
            messageId: assistantMessageId,
            providerId: provider.id,
            model: provider.model,
            mode: 'DEEP_RESEARCH',
            step: `search_${item.channel}`,
            durationMs: iterationDuration,
            metadata: { iteration, query: item.query, sourceCount: results.length },
          });
          emit({ type: 'reasoning', step: 'Reviewing findings', detail: `${sources.length} unique sources collected`, iteration });
        }

        emit({ type: 'reasoning', step: 'Synthesizing answer', detail: 'Writing final response with citations', iteration: plan.length });
        const sourceNotes = formatSourcesForPrompt(sources, excerpts);
        let content = '';
        const synthesisStarted = performance.now();
        let firstTokenAt: number | null = null;
        for await (const delta of this.llm.streamChat(provider, createSynthesisMessages(job.question, sourceNotes))) {
          if (!firstTokenAt) firstTokenAt = performance.now();
          content += delta;
          emit({ type: 'delta', content: delta });
        }
        const synthesisDuration = Math.round(performance.now() - synthesisStarted);
        const ttftMs = firstTokenAt ? Math.round(firstTokenAt - synthesisStarted) : undefined;
        const estimatedTokens = Math.round(content.length / 4);
        const tps = synthesisDuration > 0 ? Math.round((estimatedTokens / synthesisDuration) * 1000 * 10) / 10 : undefined;

        this.conversations.addMessage({
          id: assistantMessageId,
          conversationId: conversation.id,
          role: 'assistant',
          content,
          metadata: { sources },
          now: nowIso(),
        });
        emit({ type: 'done', content, sources });
        this.jobsRepo.updateStatus(jobId, 'completed', nowIso(), { answer: content, sources, reasoning: reasoningLog.map((e) => ({ ...e })) });
        const tokenCount = Math.round(content.length / 4);
        this.usage.record(userId, provider.id, tokenCount);

        this.metrics.record({
          userId,
          conversationId: conversation.id,
          messageId: assistantMessageId,
          providerId: provider.id,
          model: provider.model,
          mode: 'DEEP_RESEARCH',
          step: 'synthesis',
          durationMs: synthesisDuration,
          completionTokens: estimatedTokens,
          totalTokens: estimatedTokens,
          ttftMs,
          tps,
          metadata: { sourceCount: sources.length, planLength: plan.length },
        });

        const totalDuration = Math.round(performance.now() - startedAt);
        this.metrics.record({
          userId,
          conversationId: conversation.id,
          messageId: assistantMessageId,
          providerId: provider.id,
          model: provider.model,
          mode: 'DEEP_RESEARCH',
          step: 'total_research',
          durationMs: totalDuration,
          metadata: { sourceCount: sources.length, planLength: plan.length },
        });

        this.logger.info({ jobId, responseLength: content.length, sourceCount: sources.length, durationMs: totalDuration }, 'research_finished');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Research failed';
        emit({ type: 'error', code: 'RESEARCH_ERROR', message });
        this.jobsRepo.updateStatus(jobId, 'failed', nowIso(), { errorMessage: message });
        this.logger.error({ jobId, errorMessage: message }, 'research_job_failed');
      } finally {
        emitter.removeAllListeners();
        this.jobs.delete(jobId);
      }
    })();
  }

  subscribe(userId: string, jobId: string, handler: StreamSink): { unsubscribe: () => void } {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      // Job already finished or not found; try to replay from DB
      const job = this.jobsRepo.findById(userId, jobId);
      if (job && job.status === 'completed' && job.answer) {
        handler({ type: 'start', conversationId: job.conversationId ?? '', messageId: createId('msg'), mode: 'DEEP_RESEARCH' });
        if (job.reasoning) {
          for (const r of job.reasoning) {
            handler(r as StreamEvent);
          }
        }
        handler({ type: 'done', content: job.answer, sources: (job.sources ?? []) as ResearchSource[] });
      } else if (job && job.status === 'failed') {
        handler({ type: 'error', code: 'RESEARCH_ERROR', message: job.errorMessage ?? 'Research failed' });
      }
      return { unsubscribe: () => {} };
    }
    // Replay buffered events for late subscribers
    for (const event of entry.buffer) {
      handler(event);
    }
    const listener = (event: StreamEvent) => handler(event);
    entry.emitter.on('event', listener);
    return { unsubscribe: () => entry.emitter.off('event', listener) };
  }

  getJob(userId: string, jobId: string) {
    return this.jobsRepo.findById(userId, jobId);
  }

  // Legacy synchronous flow (kept for tests and chat stream fallback)
  async run(input: {
    userId: string;
    question: string;
    conversationId?: string;
    providerId?: string;
    emit: StreamSink;
  }): Promise<{ conversationId: string; content: string; sources: ResearchSource[] }> {
    const startedAt = performance.now();
    const now = nowIso();
    const conversation = input.conversationId
      ? this.conversations.findForUser(input.userId, input.conversationId)
      : this.conversations.create({
          id: createId('cnv'),
          userId: input.userId,
          title: input.question.slice(0, 80),
          mode: 'DEEP_RESEARCH',
          now,
        });
    if (!conversation) throw new Error('Conversation not found');
    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: input.providerId,
      questionHash: hashForLog(input.question),
      questionLength: input.question.length,
    }, 'research_started');

    const assistantMessageId = createId('msg');
    input.emit({ type: 'start', conversationId: conversation.id, messageId: assistantMessageId, mode: 'DEEP_RESEARCH' });
    this.conversations.addMessage({ id: createId('msg'), conversationId: conversation.id, role: 'user', content: input.question, now });

    const provider = this.providers.resolve(input.userId, input.providerId);
    input.emit({ type: 'reasoning', step: 'Planning research', detail: 'Creating focused search queries', iteration: 0 });
    let queries: string[];
    try {
      const urls = extractUrls(input.question);
      const scrapedPages: ScrapedPage[] = [];
      if (urls.length) {
        for (const url of urls) {
          try {
            const page = await this.search.scrape(url);
            if (page) scrapedPages.push(page);
          } catch {
            // ignore scrape failures in legacy flow
          }
        }
      }
      const seedContext = buildSeedContext(scrapedPages);
      const planItems = (await this.planner.plan(provider, input.question, seedContext)).slice(0, 10);
      queries = planItems.map((item) => `${item.channel}:${item.query}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Planner failed';
      this.logger.error({ conversationId: conversation.id, providerId: provider.id, errorMessage: message }, 'research_plan_failed');
      throw error;
    }
    this.logger.info({ conversationId: conversation.id, providerId: provider.id, model: provider.model, queryCount: queries.length }, 'research_plan_created');

    const sources: ResearchSource[] = [];
    const excerpts = new Map<number, string>();
    const seenUrls = new Set<string>();

    for (const [index, rawQuery] of queries.entries()) {
      const item = parsePlanItem(rawQuery);
      const iteration = index + 1;
      const iterationStarted = performance.now();
      input.emit({ type: 'reasoning', step: `Searching ${item.channel}`, detail: item.query, iteration });
      this.logger.info({ conversationId: conversation.id, iteration, channel: item.channel, queryHash: hashForLog(item.query), queryLength: item.query.length }, 'research_search_started');
      let results;
      try {
        results = await this.channels.search(item.channel, item.query, 5);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        this.logger.error({ conversationId: conversation.id, iteration, channel: item.channel, errorMessage: message }, 'research_search_failed');
        continue;
      }
      for (const result of results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        const id = sources.length + 1;
        const source: ResearchSource = { id, title: result.title, url: result.url, snippet: result.description ?? result.markdown.slice(0, 240) };
        sources.push(source);
        excerpts.set(id, result.markdown.slice(0, 3500));
        input.emit({ type: 'source', source });
      }
      const iterationDuration = Math.round(performance.now() - iterationStarted);
      this.metrics.record({
        userId: input.userId,
        conversationId: conversation.id,
        messageId: assistantMessageId,
        providerId: provider.id,
        model: provider.model,
        mode: 'DEEP_RESEARCH',
        step: `search_${item.channel}`,
        durationMs: iterationDuration,
        metadata: { iteration, query: item.query, sourceCount: results.length },
      });
      input.emit({ type: 'reasoning', step: 'Reviewing findings', detail: `${sources.length} unique sources collected`, iteration });
      this.logger.info({ conversationId: conversation.id, iteration, totalSources: sources.length }, 'research_iteration_reviewed');
    }

    input.emit({ type: 'reasoning', step: 'Synthesizing answer', detail: 'Writing final response with citations', iteration: queries.length });
    this.logger.info({ conversationId: conversation.id, totalSources: sources.length }, 'research_synthesis_started');
    const sourceNotes = formatSourcesForPrompt(sources, excerpts);
    let content = '';
    const synthesisStarted = performance.now();
    let firstTokenAt: number | null = null;
    try {
      for await (const delta of this.llm.streamChat(provider, createSynthesisMessages(input.question, sourceNotes))) {
        if (!firstTokenAt) firstTokenAt = performance.now();
        content += delta;
        input.emit({ type: 'delta', content: delta });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synthesis failed';
      this.logger.error({ conversationId: conversation.id, providerId: provider.id, model: provider.model, errorMessage: message }, 'research_synthesis_failed');
      throw error;
    }
    const synthesisDuration = Math.round(performance.now() - synthesisStarted);
    const ttftMs = firstTokenAt ? Math.round(firstTokenAt - synthesisStarted) : undefined;
    const estimatedTokens = Math.round(content.length / 4);
    const tps = synthesisDuration > 0 ? Math.round((estimatedTokens / synthesisDuration) * 1000 * 10) / 10 : undefined;

    this.conversations.addMessage({
      id: assistantMessageId,
      conversationId: conversation.id,
      role: 'assistant',
      content,
      metadata: { sources },
      now: nowIso(),
    });
    input.emit({ type: 'done', content, sources });
    const tokenCount = Math.round(content.length / 4);
    this.usage.record(input.userId, provider.id, tokenCount);

    this.metrics.record({
      userId: input.userId,
      conversationId: conversation.id,
      messageId: assistantMessageId,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'synthesis',
      durationMs: synthesisDuration,
      completionTokens: estimatedTokens,
      totalTokens: estimatedTokens,
      ttftMs,
      tps,
      metadata: { sourceCount: sources.length, planLength: queries.length },
    });

    const totalDuration = Math.round(performance.now() - startedAt);
    this.metrics.record({
      userId: input.userId,
      conversationId: conversation.id,
      messageId: assistantMessageId,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'total_research',
      durationMs: totalDuration,
      metadata: { sourceCount: sources.length, planLength: queries.length },
    });

    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: provider.id,
      responseLength: content.length,
      sourceCount: sources.length,
      durationMs: totalDuration,
    }, 'research_finished');
    return { conversationId: conversation.id, content, sources };
  }
}
