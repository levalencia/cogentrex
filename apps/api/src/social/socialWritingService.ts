import type { GeneratedPost } from '@cogentrex/shared';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { ProviderService, ProviderRuntimeConfig } from '../providers/providerService.js';
import type { ProviderUsageRepository } from '../providers/providerUsageRepository.js';
import type { MetricsRepository } from '../observability/metricsRepository.js';
import type { ConversationRepository } from '../chat/conversationRepository.js';
import type { LanguageModelClient, ModelMessage } from '../chat/languageModel.js';
import type { ChannelRegistry } from '../tools/channels/channelRegistry.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import type { SocialConfigRepository } from './socialConfigRepository.js';
import { extractUrls } from '../research/researchService.js';
import type { WebSearchClient } from '../tools/searchClient.js';
import type { SkillRunRepository } from '../skills/skillRunRepository.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLATFORMS = ['linkedin', 'x', 'medium', 'reddit', 'substack'] as const;
type Platform = (typeof PLATFORMS)[number];

interface MiniResearchResult {
  sources: Array<{ title: string; url: string; snippet: string }>;
  notes: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  medium: 'Medium',
  reddit: 'Reddit',
  substack: 'Substack',
};

function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

export class SocialWritingService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly providers: ProviderService,
    private readonly llm: LanguageModelClient,
    private readonly channels: ChannelRegistry,
    private readonly search: WebSearchClient,
    private readonly configs: SocialConfigRepository,
    private readonly usage: ProviderUsageRepository,
    private readonly metrics: MetricsRepository,
    private readonly logger: AppLogger,
    private readonly mediaDir: string,
    private readonly skillRuns?: SkillRunRepository,
  ) {}

  async generate(input: {
    userId: string;
    topic: string;
    platforms: string[];
    imageUrls?: string[] | undefined;
    useResearch?: boolean | undefined;
    researchSources?: number | undefined;
    providerId?: string | undefined;
  }): Promise<{ conversationId: string; posts: GeneratedPost[]; researchContext: string }> {
    const startedAt = performance.now();
    const provider = await this.providers.resolveForMode(input.userId, 'SOCIAL_WRITING', input.providerId);
    const now = nowIso();
    const conversation = await this.conversations.create({
      id: createId('cnv'),
      userId: input.userId,
      title: input.topic.slice(0, 80),
      mode: 'SOCIAL_WRITING',
      now,
    });

    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      providerId: input.providerId,
      platforms: input.platforms,
      useResearch: input.useResearch,
      researchSources: input.researchSources,
      imageCount: input.imageUrls?.length ?? 0,
      promptHash: hashForLog(input.topic),
    }, 'social_writing_started');

    // Add user message
    await this.conversations.addMessage({
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'user',
      content: input.topic,
      now,
    });

    const skillRun = this.skillRuns
      ? await this.skillRuns.safeCreate({
          userId: input.userId,
          skillId: 'skl_linkedin_writer',
          skillSlug: 'linkedin-writer',
          skillName: 'Social Writer',
          mode: 'SOCIAL_WRITING',
          conversationId: conversation.id,
          providerId: provider.id,
          observability: {
            phase: 'started',
            platforms: input.platforms,
            useResearch: input.useResearch ?? false,
          },
        })
      : null;

    try {

    // Scrape any URLs pasted into the topic
    let urlContext = '';
    const urls = extractUrls(input.topic);
    if (urls.length > 0) {
      this.logger.info({ userId: input.userId, conversationId: conversation.id, urlCount: urls.length }, 'social_url_scrape_started');
      const scrapedPages: Array<{ url: string; title: string; markdown: string }> = [];
      const failedUrls: string[] = [];
      for (const url of urls) {
        try {
          const page = await this.search.scrape(url);
          if (page) {
            scrapedPages.push({ url: page.url, title: page.title, markdown: page.markdown });
          } else {
            failedUrls.push(url);
          }
        } catch {
          failedUrls.push(url);
        }
      }
      if (scrapedPages.length > 0) {
        urlContext = scrapedPages
          .map((p) => `URL: ${p.url}\nTitle: ${p.title}\nContent:\n${p.markdown.slice(0, 2500)}`)
          .join('\n\n---\n\n');
      }
      this.logger.info({ userId: input.userId, conversationId: conversation.id, scrapedCount: scrapedPages.length, failedCount: failedUrls.length }, 'social_url_scrape_finished');
    }

    // Step 1: Optional mini deep research
    let researchContext = '';
    if (input.useResearch) {
      const maxSources = input.researchSources ?? 5;
      researchContext = await this.miniResearch(input.userId, provider, input.topic, maxSources);
    }

    // Step 2: Optional image vision analysis
    let imageContext = '';
    if (input.imageUrls && input.imageUrls.length > 0) {
      imageContext = await this.analyzeImages(input.userId, input.imageUrls);
    }

    // Step 3: Generate per platform
    const posts: GeneratedPost[] = [];
    const validPlatforms = input.platforms.filter((p): p is Platform => PLATFORMS.includes(p as Platform));

    for (const platform of validPlatforms) {
      const config = await this.configs.findForUser(input.userId, platform);
      if (config && !config.isEnabled) continue;

      const systemPrompt = config?.systemPrompt ?? this.getDefaultPrompt(platform);
      const prompt = this.buildGenerationPrompt(input.topic, platform, systemPrompt, urlContext, researchContext, imageContext);

      const genStarted = performance.now();
      try {
        const content = await this.llm.complete(provider, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ]);
        const genDuration = Math.round(performance.now() - genStarted);
        const estimatedTokens = Math.round(content.length / 4);
        await this.usage.record(input.userId, provider.id, estimatedTokens);
        await this.metrics.record({
          userId: input.userId,
          conversationId: conversation.id,
          messageId: createId('msg'),
          providerId: provider.id,
          model: provider.model,
          mode: 'SOCIAL_WRITING',
          step: `social_generate_${platform}`,
          durationMs: genDuration,
          completionTokens: estimatedTokens,
          totalTokens: estimatedTokens,
        });

        posts.push({ platform: PLATFORM_LABELS[platform], content: content.trim(), characterCount: countChars(content.trim()) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        this.logger.error({ userId: input.userId, conversationId: conversation.id, platform, errorMessage: message }, 'social_generation_failed');
        posts.push({ platform: PLATFORM_LABELS[platform], content: `[Error generating ${PLATFORM_LABELS[platform]} post: ${message}]`, characterCount: 0 });
      }
    }

    // Persist assistant message with JSON posts
    await this.conversations.addMessage({
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'assistant',
      content: JSON.stringify(posts),
      now: nowIso(),
    });

    this.logger.info({
      userId: input.userId,
      conversationId: conversation.id,
      postCount: posts.length,
      durationMs: Math.round(performance.now() - startedAt),
    }, 'social_writing_finished');

    const observability = {
      platforms: validPlatforms,
      postCount: posts.length,
      useResearch: input.useResearch ?? false,
      researchContextLength: researchContext.length,
      durationMs: Math.round(performance.now() - startedAt),
    };
    await this.skillRuns?.safeComplete(skillRun?.id, { status: 'completed', observability });

    return { conversationId: conversation.id, posts, researchContext };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Social writing failed';
      await this.skillRuns?.safeComplete(skillRun?.id, {
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

  private async miniResearch(userId: string, provider: ProviderRuntimeConfig, topic: string, maxSources: number): Promise<string> {
    const startedAt = performance.now();
    this.logger.info({ userId, topicHash: hashForLog(topic), maxSources }, 'social_mini_research_started');

    const sources: Array<{ title: string; url: string; snippet: string; markdown: string }> = [];
    const seenUrls = new Set<string>();
    const queries = [
      `web:${topic} latest news insights`,
      `web:${topic} key statistics trends`,
      `web:${topic} expert opinions analysis`,
      `web:${topic} industry reports data`,
    ];

    let iterationCount = 0;
    for (const rawQuery of queries) {
      if (sources.length >= maxSources) break;
      iterationCount++;
      const item = { channel: 'web' as const, query: rawQuery.replace(/^web:/, '') };
      try {
        const results = await this.channels.search(item.channel, item.query, Math.min(5, maxSources - sources.length + 2));
        for (const result of results) {
          if (sources.length >= maxSources) break;
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);
          sources.push({
            title: result.title,
            url: result.url,
            snippet: result.description ?? result.markdown.slice(0, 240),
            markdown: result.markdown.slice(0, 2000),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        this.logger.warn({ userId, query: item.query, errorMessage: message }, 'social_mini_research_search_failed');
      }
      if (iterationCount >= 4) break;
    }

    if (!sources.length) return '';

    // Use LLM to synthesize findings into a brief research note
    const sourceNotes = sources.map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.markdown}`).join('\n\n');
    const synthesisMessages: ModelMessage[] = [
      {
        role: 'system',
        content: `You are a research synthesizer. Summarize the provided source notes into concise key insights relevant to the topic. Be factual and cite specific data points where available. Limit to ${Math.min(maxSources, 5)} bullet points of 1-2 sentences each.`,
      },
      {
        role: 'user',
        content: `Topic: ${topic}\n\nSource notes:\n${sourceNotes}`,
      },
    ];

    try {
      const synthesis = await this.llm.complete(provider, synthesisMessages);
      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.info({ userId, sourceCount: sources.length, maxSources, durationMs }, 'social_mini_research_finished');
      return synthesis.trim();
    } catch {
      return sources.slice(0, maxSources).map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
    }
  }

  private async analyzeImages(userId: string, imageUrls: string[]): Promise<string> {
    // Find first vision-capable provider
    const allProviders = await this.providers.list(userId);
    const visionProviderRecord = allProviders.find((p) => p.supportsVision);
    if (!visionProviderRecord) {
      this.logger.warn({ userId }, 'social_writing_no_vision_provider');
      return '';
    }

    const visionProvider = await this.providers.resolve(userId, visionProviderRecord.id);
    const startedAt = performance.now();

    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
    for (const url of imageUrls) {
      // Convert local URL to file path and read base64
      if (url.startsWith('/api/media/files/')) {
        const filename = url.replace('/api/media/files/', '');
        const filePath = join(this.mediaDir, filename);
        try {
          const data = readFileSync(filePath);
          const base64 = Buffer.from(data).toString('base64');
          imageParts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } });
        } catch {
          this.logger.warn({ userId, filePath }, 'social_image_read_failed');
        }
      } else {
        imageParts.push({ type: 'image_url', image_url: { url } });
      }
    }

    if (!imageParts.length) return '';

    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: 'You are a visual analyst. Describe the key visual elements, themes, and any text visible in the image(s). Summarize in 2-4 sentences what these images convey.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze these images and describe what they show:' },
          ...imageParts,
        ],
      },
    ];

    try {
      const analysis = await this.llm.complete(visionProvider, messages);
      this.logger.info({ userId, durationMs: Math.round(performance.now() - startedAt) }, 'social_image_analysis_finished');
      return analysis.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vision analysis failed';
      this.logger.error({ userId, errorMessage: message }, 'social_image_analysis_failed');
      return '';
    }
  }

  private buildGenerationPrompt(
    topic: string,
    platform: Platform,
    systemPrompt: string,
    urlContext: string,
    researchContext: string,
    imageContext: string,
  ): string {
    let prompt = `Write a ${PLATFORM_LABELS[platform]} post about the following topic:
\n${topic}`;
    if (urlContext) {
      prompt += `\n\nSource content from pasted URL(s):\n${urlContext}`;
    }
    if (researchContext) {
      prompt += `\n\nResearch insights:\n${researchContext}`;
    }
    if (imageContext) {
      prompt += `\n\nVisual context from uploaded image(s):\n${imageContext}`;
    }
    prompt += '\n\nGenerate only the post content. No extra commentary.';
    return prompt;
  }

  private getDefaultPrompt(platform: Platform): string {
    const defaults: Record<Platform, string> = {
      linkedin: `You are an expert LinkedIn content strategist. Write posts that:
- Start with a strong hook in the first line
- Use short paragraphs (1-3 sentences each) for readability
- Include a reflective question or call-to-action at the end
- Maintain a professional yet approachable tone
- Avoid hashtags unless specifically relevant
- Keep total length between 150-300 words`,
      x: `You are an expert X (Twitter) content creator. Write posts that:
- Are punchy, opinionated, and memorable
- Stay under 280 characters (or create a thread if needed)
- Use 1-2 relevant hashtags naturally
- Include a clear hook or controversial take
- Feel conversational and authentic`,
      medium: `You are an expert Medium writer. Draft articles that:
- Start with a compelling headline idea and subtitle
- Use clear section headers (H2/H3)
- Include practical examples and actionable takeaways
- Write 800-1,500 words in a thoughtful, authoritative tone
- End with a strong conclusion and call-to-action`,
      reddit: `You are a savvy Reddit contributor. Write posts that:
- Feel casual and conversational
- Ask thought-provoking questions to spark discussion
- Are short (2-4 sentences) and to the point
- Avoid marketing language or sales pitches
- Match the authentic community tone`,
      substack: `You are a warm, engaging Substack writer. Draft newsletter notes that:
- Feel personal and conversational, like writing to a friend
- Share insights with a clear lesson or takeaway
- Use 2-4 short paragraphs
- Include a friendly sign-off or question to readers`,
    };
    return defaults[platform];
  }
}
