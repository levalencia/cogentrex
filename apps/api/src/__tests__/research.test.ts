import { describe, expect, it } from 'vitest';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';
import { extractUrls, buildSeedContext } from '../research/researchService.js';
import { parsePlanItem } from '../research/researchPlanner.js';
import { FakeWebSearchClient } from '../tools/searchClient.js';
import type { ScrapedPage } from '../tools/searchClient.js';

function parseSse(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, '')) as { type: string; step?: string; sources?: unknown[] });
}

describe('deep research API', () => {
  it('streams reasoning, sources, answer deltas, and final citations', async () => {
    const { agent, database } = makeTestApp();
    await registerAndLogin(agent);
    await createProvider(agent);

    const response = await agent
      .post('/api/chat/stream')
      .send({ content: 'Research academic impact of LLMs', mode: 'DEEP_RESEARCH' })
      .expect(200);

    const events = parseSse(response.text);
    expect(events.some((event) => event.type === 'reasoning' && event.step === 'Planning research')).toBe(true);
    expect(events.some((event) => event.type === 'source')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    expect(events.at(-1)?.sources).toHaveLength(1);

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
    const { agent, database } = makeTestApp({}, {
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

  it('parses plan items with channel prefixes', () => {
    expect(parsePlanItem('web:test query')).toEqual({ channel: 'web', query: 'test query' });
    expect(parsePlanItem('reddit:best LLMs')).toEqual({ channel: 'reddit', query: 'best LLMs' });
    expect(parsePlanItem('no prefix')).toEqual({ channel: 'web', query: 'no prefix' });
  });
});
