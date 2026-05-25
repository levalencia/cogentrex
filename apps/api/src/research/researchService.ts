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
import { describeSearchClient, describeFetchClient } from '../tools/searchClient.js';
import type { ChannelRegistry } from '../tools/channels/channelRegistry.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import { formatSourcesForPrompt, createSynthesisMessages } from './researchPrompts.js';
import { ensureGroundedCitations } from './researchCitations.js';
import { ResearchPlanner, parsePlanItem, type PlanItem } from './researchPlanner.js';
import { ResearchJobRepository } from './researchJobRepository.js';
import type { ResearchSourceRepository } from './researchSourceRepository.js';
import type { SkillRunRepository } from '../skills/skillRunRepository.js';

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
type ResearchDiagnosticMetadata = Record<string, string | number | boolean | null | undefined>;

function createDiagnosticEvent(
  name: string,
  message: string,
  metadata: ResearchDiagnosticMetadata,
  iteration?: number,
): StreamEvent {
  return {
    type: 'diagnostic',
    name,
    message,
    ...(iteration !== undefined ? { iteration } : {}),
    metadata,
  };
}

function redactUrlForEventMetadata(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

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
    private readonly sourceRepo: ResearchSourceRepository,
    private readonly skillRuns: SkillRunRepository,
    private readonly usage: ProviderUsageRepository,
    private readonly metrics: MetricsRepository,
    private readonly logger: AppLogger,
  ) {
    this.planner = new ResearchPlanner(llm);
  }

  async plan(providerId: string | undefined, userId: string, question: string, conversationId?: string): Promise<{ plan: string[]; jobId: string; conversationId: string; scrapedUrls: string[]; failedUrls: string[]; priorSourceCount: number }> {
    const now = nowIso();
    
    // Reuse existing conversation for follow-ups, or create new one
    let conversation: Awaited<ReturnType<ConversationRepository['create']>>;
    let priorSources: Array<ResearchSource & { excerpt?: string | undefined }> = [];
    
    if (conversationId) {
      const existing = await this.conversations.findForUser(userId, conversationId);
      if (!existing) {
        this.logger.warn({ userId, conversationId }, 'research_follow_up_conversation_not_found');
        // Fall through to create new
        conversation = await this.conversations.create({
          id: createId('cnv'),
          userId,
          title: question.slice(0, 80),
          mode: 'DEEP_RESEARCH',
          now,
        });
      } else {
        conversation = existing;
        if (conversation.mode !== 'DEEP_RESEARCH') {
          await this.conversations.setMode(userId, conversation.id, 'DEEP_RESEARCH', now);
          conversation = { ...conversation, mode: 'DEEP_RESEARCH' };
        } else {
          await this.conversations.touch(conversation.id, now);
        }
        try {
          priorSources = await this.sourceRepo.listByConversation(conversation.id);
          this.logger.info({ userId, conversationId: conversation.id, priorSourceCount: priorSources.length }, 'research_prior_sources_loaded_for_plan');
        } catch {
          // Non-critical
        }
      }
    } else {
      conversation = await this.conversations.create({
        id: createId('cnv'),
        userId,
        title: question.slice(0, 80),
        mode: 'DEEP_RESEARCH',
        now,
      });
    }
    
    const provider = await this.providers.resolveForMode(userId, 'DEEP_RESEARCH', providerId);

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

    await this.metrics.record({
      userId,
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'url_scraping',
      durationMs: scrapeDuration,
      metadata: { urlCount: urls.length, scrapedCount: scrapedPages.length, failedCount: failedUrls.length, priorSourceCount: priorSources.length },
    });

    const planningStarted = performance.now();
    const seedContext = buildSeedContext(scrapedPages);
    
    let planItems: PlanItem[];
    if (priorSources.length > 0) {
      // Follow-up: limit to 5 new queries, avoid re-searching what's known
      const priorTopics = priorSources.slice(0, 5).map((s) => s.title).join('; ');
      planItems = (await this.planner.planFollowUp(provider, question, priorSources.length, priorTopics, seedContext)).slice(0, 5);
    } else {
      // Fresh research: up to 10 queries
      planItems = (await this.planner.plan(provider, question, seedContext)).slice(0, 10);
    }
    
    const planStrings = planItems.map((item) => `${item.channel}:${item.query}`);
    const planningDuration = Math.round(performance.now() - planningStarted);

    await this.metrics.record({
      userId,
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      mode: 'DEEP_RESEARCH',
      step: 'planning',
      durationMs: planningDuration,
      metadata: { queryCount: planStrings.length, priorSourceCount: priorSources.length, isFollowUp: priorSources.length > 0 },
    });

    const job = await this.jobsRepo.create({
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
    return { plan: planStrings, jobId: job.id, conversationId: conversation.id, scrapedUrls: scrapedPages.map((p) => p.url), failedUrls, priorSourceCount: priorSources.length };
  }

  async startJob(userId: string, jobId: string, plan: string[]): Promise<void> {
    const job = await this.jobsRepo.findById(userId, jobId);
    if (!job) throw new Error('Job not found');
    const conversation = await this.conversations.findForUser(userId, job.conversationId!);
    if (!conversation) throw new Error('Conversation not found');

    const emitter = new EventEmitter();
    const entry: JobEntry = { emitter, buffer: [] };
    await this.jobs.set(jobId, entry);
    await this.jobsRepo.updateStatus(jobId, 'running', nowIso());

    const provider = await this.providers.resolveForMode(userId, 'DEEP_RESEARCH', job.providerId ?? undefined);
    const skillRun = await this.skillRuns.safeCreate({
      userId,
      skillId: 'skl_deep_research',
      skillSlug: 'deep-research',
      skillName: 'Deep Research',
      mode: 'DEEP_RESEARCH',
      conversationId: conversation.id,
      jobId,
      providerId: provider.id,
      observability: {
        phase: 'started',
        planLength: plan.length,
      },
    });
    const assistantMessageId = createId('msg');
    await this.conversations.addMessage({ id: createId('msg'), conversationId: conversation.id, role: 'user', content: job.question, now: nowIso() });

    const reasoningLog: StreamEvent[] = [];
    const sources: ResearchSource[] = [];
    const excerpts = new Map<number, string>();
    const seenUrls = new Set<string>();

    // Load prior research sources for this conversation (follow-up support)
    let priorSources: Array<ResearchSource & { excerpt?: string | undefined }> = [];
    try {
      priorSources = await this.sourceRepo.listByConversation(conversation.id);
      this.logger.info({ jobId, conversationId: conversation.id, priorSourceCount: priorSources.length }, 'research_prior_sources_loaded');
    } catch {
      // Non-critical: if index doesn't exist yet, continue with fresh search
    }

    const emitLive = (event: StreamEvent) => {
      entry.buffer.push(event);
      emitter.emit('event', event);
    };
    const emit = async (event: StreamEvent) => {
      reasoningLog.push(event);
      emitLive(event);
      await this.jobsRepo.updateStatus(jobId, 'running', nowIso(), { reasoning: reasoningLog.map((e) => ({ ...e })) });
    };
    const emitDiagnostic = async (name: string, message: string, metadata: ResearchDiagnosticMetadata, iteration?: number) => {
      await emit(createDiagnosticEvent(name, message, metadata, iteration));
    };

    // Fire background work without awaiting at the call site
    void (async () => {
      const startedAt = performance.now();
      await emit({ type: 'start', conversationId: conversation.id, messageId: assistantMessageId, mode: 'DEEP_RESEARCH' });
      const researchStartedMetadata = {
        jobId,
        conversationId: conversation.id,
        providerId: provider.id,
        providerKind: provider.kind,
        model: provider.model,
        searchProvider: describeSearchClient(this.search),
        fetchProvider: describeFetchClient(this.search),
        availableChannels: this.channels.names().join(','),
      };
      await emitDiagnostic('research_started', 'Deep research job started', researchStartedMetadata);
      await this.skillRuns.safeAppendEvent(skillRun?.id, userId, {
        eventType: 'research_started',
        label: 'Research started',
        metadata: researchStartedMetadata,
      });
      try {
        for (const [index, rawQuery] of plan.entries()) {
          const item = parsePlanItem(rawQuery);
          const iteration = index + 1;
          const iterationStarted = performance.now();
          await emit({ type: 'reasoning', step: `Searching ${item.channel}`, detail: item.query, iteration });
          this.logger.info({ jobId, iteration, channel: item.channel, queryHash: hashForLog(item.query), queryLength: item.query.length }, 'research_search_started');
          let results;
          try {
            results = await this.channels.search(item.channel, item.query, 5);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Search failed';
            this.logger.error({ jobId, iteration, channel: item.channel, errorMessage: message }, 'research_search_failed');
            continue;
          }
          const resultCount = results.length;
          let uniqueAdded = 0;
          for (const result of results) {
            if (seenUrls.has(result.url)) continue;
            seenUrls.add(result.url);
            uniqueAdded += 1;
            const id = sources.length + 1;
            const source: ResearchSource = { id, title: result.title, url: result.url, snippet: result.description ?? result.markdown.slice(0, 240), channel: result.channel };
            sources.push(source);
            excerpts.set(id, result.markdown.slice(0, 3500));
            await emit({ type: 'source', source, iteration, channel: item.channel });
            await this.skillRuns.safeAppendEvent(skillRun?.id, userId, {
              eventType: 'source_found',
              label: 'Source found',
              metadata: {
                sourceId: source.id,
                title: source.title,
                url: redactUrlForEventMetadata(source.url),
                urlHash: hashForLog(source.url),
                channel: item.channel,
                iteration,
                totalSources: sources.length,
              },
            });
          }
          const iterationDuration = Math.round(performance.now() - iterationStarted);
          const searchProvider = item.channel === 'web' ? describeSearchClient(this.search) : item.channel;
          const searchCompletedMetadata = {
            channel: item.channel,
            searchProvider,
            requestedLimit: 5,
            resultCount,
            uniqueAdded,
            totalSources: sources.length,
            durationMs: iterationDuration,
          };
          await emitDiagnostic('search_completed', `Search completed for ${item.channel}`, searchCompletedMetadata, iteration);
          await this.skillRuns.safeAppendEvent(skillRun?.id, userId, {
            eventType: 'search_completed',
            label: 'Search completed',
            metadata: { ...searchCompletedMetadata, iteration },
          });
          this.logger.info({
            jobId,
            conversationId: conversation.id,
            iteration,
            channel: item.channel,
            searchProvider,
            requestedLimit: 5,
            resultCount,
            uniqueAdded,
            totalSources: sources.length,
            durationMs: iterationDuration,
          }, 'research_search_completed');
          await this.metrics.record({
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
          await emit({ type: 'reasoning', step: 'Reviewing findings', detail: `${sources.length} unique sources collected`, iteration });
        }

        await emit({ type: 'reasoning', step: 'Synthesizing answer', detail: 'Writing final response with citations', iteration: plan.length });

        // Merge prior sources with new ones for synthesis (deduplicate by URL)
        const allSources: ResearchSource[] = [...priorSources];
        const allExcerpts = new Map<number, string>();
        for (const ps of priorSources) {
          allExcerpts.set(ps.id, ps.excerpt ?? ps.snippet ?? '');
        }
        for (const ns of sources) {
          if (!allSources.some((s) => s.url === ns.url)) {
            const nextId = allSources.length + 1;
            allSources.push({ ...ns, id: nextId });
            allExcerpts.set(nextId, excerpts.get(ns.id) ?? '');
          }
        }

        const sourceNotes = formatSourcesForPrompt(allSources, allExcerpts);
        let content = '';
        const synthesisStarted = performance.now();
        let firstTokenAt: number | null = null;
        for await (const delta of this.llm.streamChat(provider, createSynthesisMessages(job.question, sourceNotes))) {
          if (!firstTokenAt) firstTokenAt = performance.now();
          content += delta;
          await emit({ type: 'delta', content: delta });
        }
        const grounded = ensureGroundedCitations(content, allSources);
        if (grounded.content !== content) {
          const fallbackDelta = grounded.content.slice(content.length);
          content = grounded.content;
          if (fallbackDelta) emitLive({ type: 'delta', content: fallbackDelta });
        }
        await emitDiagnostic('citation_audit', 'Citation audit completed', {
          messageId: assistantMessageId,
          sourceCount: allSources.length,
          citationCount: grounded.audit.citationCount,
          validCitationCount: grounded.audit.validCitationCount,
          invalidCitationCount: grounded.audit.invalidCitationCount,
          missingCitations: grounded.audit.missingCitations,
          fallbackApplied: grounded.audit.fallbackApplied,
        });

        const synthesisDuration = Math.round(performance.now() - synthesisStarted);
        const ttftMs = firstTokenAt ? Math.round(firstTokenAt - synthesisStarted) : undefined;
        const estimatedTokens = Math.round(content.length / 4);
        const tps = synthesisDuration > 0 ? Math.round((estimatedTokens / synthesisDuration) * 1000 * 10) / 10 : undefined;

        const totalDuration = Math.round(performance.now() - startedAt);
        const finishedDiagnostic = createDiagnosticEvent('research_finished', 'Deep research job finished', {
          jobId,
          conversationId: conversation.id,
          providerId: provider.id,
          model: provider.model,
          messageId: assistantMessageId,
          sourceCount: allSources.length,
          newSourceCount: sources.length,
          planLength: plan.length,
          durationMs: totalDuration,
          synthesisDurationMs: synthesisDuration,
          estimatedTokens,
        });
        const completedReasoning = [...reasoningLog.map((e) => ({ ...e })), finishedDiagnostic];

        // Persist merged sources to per-conversation research index for follow-ups before marking the stream as finished.
        await this.sourceRepo.replaceAll(conversation.id, allSources.map((s) => ({ ...s, excerpt: allExcerpts.get(s.id) })), nowIso());
        const tokenCount = Math.round(content.length / 4);
        await this.usage.record(userId, provider.id, tokenCount);

        await this.metrics.record({
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

        await this.metrics.record({
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

        await this.skillRuns.safeAppendEvent(skillRun?.id, userId, {
          eventType: 'synthesis_completed',
          label: 'Synthesis completed',
          metadata: {
            messageId: assistantMessageId,
            sourceCount: allSources.length,
            newSourceCount: sources.length,
            planLength: plan.length,
            durationMs: synthesisDuration,
            estimatedTokens,
            citationCount: grounded.audit.citationCount,
            validCitationCount: grounded.audit.validCitationCount,
            fallbackApplied: grounded.audit.fallbackApplied,
          },
        });

        await this.conversations.addMessage({
          id: assistantMessageId,
          conversationId: conversation.id,
          role: 'assistant',
          content,
          metadata: { sources: allSources, reasoning: completedReasoning },
          now: nowIso(),
        });
        await this.skillRuns.safeComplete(skillRun?.id, {
          status: 'completed',
          observability: {
            messageId: assistantMessageId,
            sourceCount: allSources.length,
            newSourceCount: sources.length,
            planLength: plan.length,
            durationMs: totalDuration,
            synthesisDurationMs: synthesisDuration,
            estimatedTokens,
          },
        });
        await this.jobsRepo.updateStatus(jobId, 'completed', nowIso(), { answer: content, sources: allSources, reasoning: completedReasoning });
        reasoningLog.push(finishedDiagnostic);
        emitLive(finishedDiagnostic);
        emitLive({ type: 'done', content, sources: allSources });

        this.logger.info({ jobId, responseLength: content.length, sourceCount: sources.length, durationMs: totalDuration }, 'research_finished');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Research failed';
        await emit({ type: 'error', code: 'RESEARCH_ERROR', message });
        await this.skillRuns.safeComplete(skillRun?.id, {
          status: 'failed',
          errorMessage: message,
          observability: {
            phase: 'failed',
            planLength: plan.length,
            sourceCount: sources.length,
            durationMs: Math.round(performance.now() - startedAt),
          },
        });
        await this.jobsRepo.updateStatus(jobId, 'failed', nowIso(), { errorMessage: message });
        this.logger.error({ jobId, errorMessage: message }, 'research_job_failed');
      } finally {
        emitter.removeAllListeners();
        await this.jobs.delete(jobId);
      }
    })();
  }

  async subscribe(userId: string, jobId: string, handler: StreamSink): Promise<{ unsubscribe: () => void }> {
    const entry = await this.jobs.get(jobId);
    if (!entry) {
      // Job already finished or not found; try to replay from DB
      const job = await this.jobsRepo.findById(userId, jobId);
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

  async getJob(userId: string, jobId: string) {
    return await this.jobsRepo.findById(userId, jobId);
  }

  async getJobsByConversation(userId: string, conversationId: string) {
    return await this.jobsRepo.listByConversation(userId, conversationId);
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
      ? await this.conversations.findForUser(input.userId, input.conversationId)
      : await this.conversations.create({
          id: createId('cnv'),
          userId: input.userId,
          title: input.question.slice(0, 80),
          mode: 'DEEP_RESEARCH',
          now,
        });
    if (!conversation) throw new Error('Conversation not found');
    if (conversation.mode !== 'DEEP_RESEARCH') {
      await this.conversations.setMode(input.userId, conversation.id, 'DEEP_RESEARCH', now);
    }
    const provider = await this.providers.resolveForMode(input.userId, 'DEEP_RESEARCH', input.providerId);
    const skillRun = await this.skillRuns.safeCreate({
      userId: input.userId,
      skillId: 'skl_deep_research',
      skillSlug: 'deep-research',
      skillName: 'Deep Research',
      mode: 'DEEP_RESEARCH',
      conversationId: conversation.id,
      providerId: provider.id,
      observability: { phase: 'started' },
    });
    try {
    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: provider.id,
      questionHash: hashForLog(input.question),
      questionLength: input.question.length,
    }, 'research_started');

    const assistantMessageId = createId('msg');
    input.emit({ type: 'start', conversationId: conversation.id, messageId: assistantMessageId, mode: 'DEEP_RESEARCH' });
    await this.conversations.addMessage({ id: createId('msg'), conversationId: conversation.id, role: 'user', content: input.question, now });

    const reasoningLog: StreamEvent[] = [];
    const emitDiagnostic = (name: string, message: string, metadata: ResearchDiagnosticMetadata, iteration?: number) => {
      const event = createDiagnosticEvent(name, message, metadata, iteration);
      input.emit(event);
      reasoningLog.push(event);
    };
    emitDiagnostic('research_started', 'Deep research run started', {
      conversationId: conversation.id,
      providerId: provider.id,
      providerKind: provider.kind,
      model: provider.model,
      searchProvider: describeSearchClient(this.search),
      fetchProvider: describeFetchClient(this.search),
      availableChannels: this.channels.names().join(','),
    });
    input.emit({ type: 'reasoning', step: 'Planning research', detail: 'Creating focused search queries', iteration: 0 });
    reasoningLog.push({ type: 'reasoning', step: 'Planning research', detail: 'Creating focused search queries', iteration: 0 });
    let queries: string[];
    try {
      const urls = extractUrls(input.question);
      const scrapedPages: ScrapedPage[] = [];
      const failedUrls: string[] = [];
      const scrapeStarted = performance.now();
      if (urls.length) {
        for (const url of urls) {
          try {
            const page = await this.search.scrape(url);
            if (page) {
              scrapedPages.push(page);
            } else {
              failedUrls.push(url);
            }
          } catch {
            failedUrls.push(url);
          }
        }
      }
      emitDiagnostic('fetch_completed', 'Input URL fetch completed', {
        fetchProvider: describeFetchClient(this.search),
        urlCount: urls.length,
        fetchedCount: scrapedPages.length,
        failedCount: failedUrls.length,
        durationMs: Math.round(performance.now() - scrapeStarted),
      });
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

    // Load prior research sources for this conversation (follow-up support)
    let priorSources: Array<ResearchSource & { excerpt?: string | undefined }> = [];
    if (input.conversationId) {
      try {
        priorSources = await this.sourceRepo.listByConversation(conversation.id);
        this.logger.info({ conversationId: conversation.id, priorSourceCount: priorSources.length }, 'research_prior_sources_loaded');
      } catch {
        // Non-critical: if index doesn't exist yet, continue with fresh search
      }
    }

    for (const [index, rawQuery] of queries.entries()) {
      const item = parsePlanItem(rawQuery);
      const iteration = index + 1;
      const iterationStarted = performance.now();
      input.emit({ type: 'reasoning', step: `Searching ${item.channel}`, detail: item.query, iteration });
      reasoningLog.push({ type: 'reasoning', step: `Searching ${item.channel}`, detail: item.query, iteration });
      this.logger.info({ conversationId: conversation.id, iteration, channel: item.channel, queryHash: hashForLog(item.query), queryLength: item.query.length }, 'research_search_started');
      let results;
      try {
        results = await this.channels.search(item.channel, item.query, 5);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        this.logger.error({ conversationId: conversation.id, iteration, channel: item.channel, errorMessage: message }, 'research_search_failed');
        continue;
      }
      const resultCount = results.length;
      let uniqueAdded = 0;
      for (const result of results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        uniqueAdded += 1;
        const id = sources.length + 1;
        const source: ResearchSource = { id, title: result.title, url: result.url, snippet: result.description ?? result.markdown.slice(0, 240) };
        sources.push(source);
        excerpts.set(id, result.markdown.slice(0, 3500));
        input.emit({ type: 'source', source, iteration, channel: item.channel });
      }
      const iterationDuration = Math.round(performance.now() - iterationStarted);
      const searchProvider = item.channel === 'web' ? describeSearchClient(this.search) : item.channel;
      emitDiagnostic('search_completed', `Search completed for ${item.channel}`, {
        channel: item.channel,
        searchProvider,
        requestedLimit: 5,
        resultCount,
        uniqueAdded,
        totalSources: sources.length,
        durationMs: iterationDuration,
      }, iteration);
      this.logger.info({
        conversationId: conversation.id,
        iteration,
        channel: item.channel,
        searchProvider,
        requestedLimit: 5,
        resultCount,
        uniqueAdded,
        totalSources: sources.length,
        durationMs: iterationDuration,
      }, 'research_search_completed');
      await this.metrics.record({
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
      reasoningLog.push({ type: 'reasoning', step: 'Reviewing findings', detail: `${sources.length} unique sources collected`, iteration });
      this.logger.info({ conversationId: conversation.id, iteration, totalSources: sources.length }, 'research_iteration_reviewed');
    }

    input.emit({ type: 'reasoning', step: 'Synthesizing answer', detail: 'Writing final response with citations', iteration: queries.length });
    reasoningLog.push({ type: 'reasoning', step: 'Synthesizing answer', detail: 'Writing final response with citations', iteration: queries.length });
    this.logger.info({ conversationId: conversation.id, totalSources: sources.length, priorSourceCount: priorSources.length }, 'research_synthesis_started');

    // Merge prior sources with new ones for synthesis (deduplicate by URL)
    const allSources: ResearchSource[] = [...priorSources];
    const allExcerpts = new Map<number, string>();
    for (const ps of priorSources) {
      allExcerpts.set(ps.id, ps.excerpt ?? ps.snippet ?? '');
    }
    for (const ns of sources) {
      if (!allSources.some((s) => s.url === ns.url)) {
        const nextId = allSources.length + 1;
        allSources.push({ ...ns, id: nextId });
        allExcerpts.set(nextId, excerpts.get(ns.id) ?? '');
      }
    }

    const sourceNotes = formatSourcesForPrompt(allSources, allExcerpts);
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
    const grounded = ensureGroundedCitations(content, allSources);
    if (grounded.content !== content) {
      const fallbackDelta = grounded.content.slice(content.length);
      content = grounded.content;
      if (fallbackDelta) input.emit({ type: 'delta', content: fallbackDelta });
    }
    emitDiagnostic('citation_audit', 'Citation audit completed', {
      sourceCount: allSources.length,
      citationCount: grounded.audit.citationCount,
      validCitationCount: grounded.audit.validCitationCount,
      invalidCitationCount: grounded.audit.invalidCitationCount,
      missingCitations: grounded.audit.missingCitations,
      fallbackApplied: grounded.audit.fallbackApplied,
    });

    const synthesisDuration = Math.round(performance.now() - synthesisStarted);
    const ttftMs = firstTokenAt ? Math.round(firstTokenAt - synthesisStarted) : undefined;
    const estimatedTokens = Math.round(content.length / 4);
    const tps = synthesisDuration > 0 ? Math.round((estimatedTokens / synthesisDuration) * 1000 * 10) / 10 : undefined;

    const totalDuration = Math.round(performance.now() - startedAt);
    const finishedDiagnostic = createDiagnosticEvent('research_finished', 'Deep research run finished', {
      conversationId: conversation.id,
      providerId: provider.id,
      model: provider.model,
      sourceCount: allSources.length,
      newSourceCount: sources.length,
      planLength: queries.length,
      durationMs: totalDuration,
      synthesisDurationMs: synthesisDuration,
      estimatedTokens,
    });
    const completedReasoning = [...reasoningLog, finishedDiagnostic];

    const tokenCount = Math.round(content.length / 4);
    await this.usage.record(input.userId, provider.id, tokenCount);

    // Persist merged sources to per-conversation research index before marking the stream as finished.
    await this.sourceRepo.replaceAll(conversation.id, allSources.map((s) => ({ ...s, excerpt: allExcerpts.get(s.id) })), nowIso());

    await this.metrics.record({
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

    await this.metrics.record({
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

    await this.conversations.addMessage({
      id: assistantMessageId,
      conversationId: conversation.id,
      role: 'assistant',
      content,
      metadata: { sources: allSources, reasoning: completedReasoning },
      now: nowIso(),
    });
    await this.skillRuns.safeComplete(skillRun?.id, {
      status: 'completed',
      observability: {
        messageId: assistantMessageId,
        sourceCount: allSources.length,
        newSourceCount: sources.length,
        planLength: queries.length,
        durationMs: totalDuration,
        synthesisDurationMs: synthesisDuration,
        estimatedTokens,
      },
    });
    reasoningLog.push(finishedDiagnostic);
    input.emit(finishedDiagnostic);
    input.emit({ type: 'done', content, sources: allSources });

    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: provider.id,
      responseLength: content.length,
      sourceCount: sources.length,
      durationMs: totalDuration,
    }, 'research_finished');
    return { conversationId: conversation.id, content, sources };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research failed';
      await this.skillRuns.safeComplete(skillRun?.id, {
        status: 'failed',
        errorMessage: message,
        observability: {
          phase: 'failed',
          durationMs: Math.round(performance.now() - startedAt),
        },
      });
      throw error;
    }
  }
}
