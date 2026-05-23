import { describe, expect, it } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';
import { extractUrls, buildSeedContext } from '../research/researchService.js';
import { parsePlanItem } from '../research/researchPlanner.js';
import { FakeLanguageModelClient } from '../chat/languageModel.js';
import { FakeWebSearchClient } from '../tools/searchClient.js';
import type { ScrapedPage } from '../tools/searchClient.js';

function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, '')) as {
      type: string;
      step?: string;
      name?: string;
      content?: string;
      sources?: unknown[];
      metadata?: Record<string, unknown>;
      conversationId?: string;
    });
}

describe('deep research API', () => {
  it('streams reasoning, sources, answer deltas, and final citations', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Research academic impact of LLMs', mode: 'DEEP_RESEARCH' })
      .expect(200);

    const events = parseSse(response.text);
    expect(events.some((event) => event.type === 'reasoning' && event.step === 'Planning research')).toBe(true);
    expect(events.some((event) => event.type === 'diagnostic' && event.name === 'research_started')).toBe(true);
    expect(events.some((event) => event.type === 'diagnostic' && event.name === 'search_completed')).toBe(true);
    expect(events.some((event) => event.type === 'source')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    expect(events.at(-1)?.sources).toHaveLength(1);

    const conversationId = events.find((event) => event.type === 'start')?.conversationId;
    expect(conversationId).toBeTruthy();
    const diagnosticsResponse = await agent.get(`/api/chat/conversations/${conversationId}/diagnostics`).expect(200);
    const diagnostics = diagnosticsResponse.body as { reasoning: Array<{ type: string; name?: string; metadata?: Record<string, unknown> }> };
    expect(diagnostics.reasoning.some((event) => event.type === 'diagnostic' && event.name === 'research_finished')).toBe(true);
    expect(diagnostics.reasoning.find((event) => event.name === 'search_completed')?.metadata).toMatchObject({
      searchProvider: 'fake',
      requestedLimit: 5,
      resultCount: 1,
      uniqueAdded: 1,
    });

    database.close();
  });

  it('extracts URLs from question text', () => {
    expect(extractUrls('Check https://example.com and https://test.org.')).toEqual([
      'https://example.com',
      'https://test.org',
    ]);
    expect(extractUrls('No URLs here')).toEqual([]);
    expect(extractUrls('Duplicate https://a.com and https://a.com')).toEqual(['https://a.com']);
    expect(extractUrls('Trailing punctuation https://a.com.')).toEqual(['https://a.com']);
  });

  it('builds seed context from scraped pages', () => {
    const pages: ScrapedPage[] = [
      { url: 'https://example.com', title: 'Example', markdown: 'Hello world', description: 'An example page' },
    ];
    const ctx = buildSeedContext(pages)!;
    expect(ctx).toContain('URL: https://example.com');
    expect(ctx).toContain('Title: Example');
    expect(ctx).toContain('Hello world');
    expect(buildSeedContext([])).toBeUndefined();
  });

  it('plans research with scraped URL context', async () => {
    const scraped = new Map<string, ScrapedPage>([
      ['https://linkedin.com/in/margot-tudela', {
        url: 'https://linkedin.com/in/margot-tudela',
        title: 'Margot Tudela - LinkedIn',
        markdown: 'PhD in Social Sciences, expert in gender and migration, based in Belgium.',
        description: 'LinkedIn profile',
      }],
    ]);
    const { agent, database } = await makeTestApp({}, {
      search: new FakeWebSearchClient([], scraped),
    });
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/plan')
      .send({ content: 'Find jobs for this profile: https://linkedin.com/in/margot-tudela' })
      .expect(200);

    const body = response.body as { plan: string[]; jobId: string; conversationId: string; scrapedUrls: string[]; failedUrls: string[] };
    expect(body.scrapedUrls).toContain('https://linkedin.com/in/margot-tudela');
    expect(body.failedUrls).toEqual([]);
    expect(body.plan.length).toBeGreaterThan(0);

    database.close();
  });

  it('promotes an existing chat conversation to Deep Research so library artifacts stay correctly classified', async () => {
    const { agent, database } = await makeTestApp();
    const user = await registerAndLogin(agent);
    await createProvider(agent);
    const now = new Date('2026-05-22T20:00:00.000Z').toISOString();

    await database.adapter.prepare(
      `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
       VALUES ('conv-chat-to-research', @userId, 'Started as chat', 'CHAT', @now, @now)`,
    ).run({ userId: user.id, now });

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Research current AI agent workflow tools', mode: 'DEEP_RESEARCH', conversationId: 'conv-chat-to-research' })
      .expect(200);

    const events = parseSse(response.text);
    expect(events.at(-1)?.type).toBe('done');

    const conversations = await agent.get('/api/chat/conversations').expect(200);
    expect(conversations.body.conversations.find((conversation: { id: string; mode: string }) => conversation.id === 'conv-chat-to-research')).toMatchObject({
      id: 'conv-chat-to-research',
      mode: 'DEEP_RESEARCH',
    });

    const messages = await agent.get('/api/chat/conversations/conv-chat-to-research/messages').expect(200);
    const assistant = messages.body.messages.find((message: { role: string }) => message.role === 'assistant');
    expect(assistant?.id).toBeTruthy();

    const artifactResponse = await agent
      .post('/api/artifacts/from-message')
      .send({ messageId: assistant.id })
      .expect(201);
    expect(artifactResponse.body.artifact).toMatchObject({
      conversationId: 'conv-chat-to-research',
      conversationMode: 'DEEP_RESEARCH',
    });

    database.close();
  });

  it('adds grounded citation fallback and citation audit diagnostics when synthesis is uncited', async () => {
    const { agent, database } = await makeTestApp({}, {
      llm: new FakeLanguageModelClient('Uncited synthesis without markers.'),
    });
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Research agent workflow observability', mode: 'DEEP_RESEARCH' })
      .expect(200);

    const events = parseSse(response.text);
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    expect(done?.content).toContain('Sources consulted:');
    expect(done?.content).toContain('[1]');
    expect(events.find((event) => event.type === 'diagnostic' && event.name === 'citation_audit')?.metadata).toMatchObject({
      fallbackApplied: true,
      validCitationCount: 0,
      sourceCount: 1,
    });

    database.close();
  });

  it('records Deep Research as an observable skill run', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Research AI governance checklists', mode: 'DEEP_RESEARCH' })
      .expect(200);
    const conversationId = parseSse(response.text).find((event) => event.type === 'start')?.conversationId;
    expect(conversationId).toBeTruthy();

    const runsResponse = await agent.get('/api/skills/runs').expect(200);
    expect(runsResponse.body.runs[0]).toMatchObject({
      skillSlug: 'deep-research',
      mode: 'DEEP_RESEARCH',
      status: 'completed',
      conversationId,
    });
    expect(runsResponse.body.runs[0].durationMs).toEqual(expect.any(Number));
    expect(runsResponse.body.runs[0].observability).toMatchObject({
      sourceCount: 1,
      planLength: expect.any(Number),
    });

    database.close();
  });

  it('parses plan items with channel prefixes', () => {
    expect(parsePlanItem('web:test query')).toEqual({ channel: 'web', query: 'test query' });
    expect(parsePlanItem('reddit:best LLMs')).toEqual({ channel: 'reddit', query: 'best LLMs' });
    expect(parsePlanItem('no prefix')).toEqual({ channel: 'web', query: 'no prefix' });
  });
});
