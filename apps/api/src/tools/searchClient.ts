import { z } from 'zod';

export interface SearchResult {
  title: string;
  url: string;
  markdown: string;
  description?: string;
}

export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  description?: string | undefined;
}

export interface WebSearchClient {
  search(query: string, limit: number): Promise<SearchResult[]>;
  scrape(url: string): Promise<ScrapedPage | null>;
}

const firecrawlResponseSchema = z.object({
  data: z.union([
    z.array(z.unknown()),
    z.object({ web: z.array(z.unknown()).optional() }).passthrough(),
  ]).optional(),
  success: z.boolean().optional(),
}).passthrough();

const braveResponseSchema = z.object({
  web: z.object({
    results: z.array(z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

export interface WebSearchClientEnv {
  BRAVE_SEARCH_API_KEY?: string | undefined;
  FIRECRAWL_API_KEY?: string | undefined;
  WEB_SEARCH_ADAPTER?: 'brave' | 'firecrawl' | 'fake' | undefined;
}

function normalizeFirecrawlData(data: unknown): SearchResult[] {
  const rawItems = Array.isArray(data)
    ? data
    : typeof data === 'object' && data && 'web' in data && Array.isArray((data as { web?: unknown }).web)
      ? (data as { web: unknown[] }).web
      : [];

  return rawItems.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url : typeof record.sourceURL === 'string' ? record.sourceURL : '';
    const title = typeof record.title === 'string' ? record.title : url;
    const markdown = typeof record.markdown === 'string'
      ? record.markdown
      : typeof record.content === 'string'
        ? record.content
        : typeof record.description === 'string'
          ? record.description
          : '';
    if (!url || !markdown) return [];
    const normalized: SearchResult = { title, url, markdown };
    if (typeof record.description === 'string') normalized.description = record.description;
    return [normalized];
  });
}

function normalizeBraveData(data: unknown): SearchResult[] {
  const parsed = braveResponseSchema.parse(data);
  const rawItems = parsed.web?.results ?? [];

  return rawItems.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url : '';
    const title = typeof record.title === 'string' ? record.title : url;
    const description = typeof record.description === 'string' ? record.description : '';
    if (!url || !description) return [];
    return [{
      title,
      url,
      markdown: description,
      description,
    }];
  });
}

const firecrawlScrapeSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    markdown: z.string().optional(),
    metadata: z.object({
      title: z.string().optional(),
      sourceURL: z.string().optional(),
      description: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

export class FirecrawlSearchClient implements WebSearchClient {
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const response = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) {
      throw new Error(`Firecrawl search failed with ${response.status}`);
    }
    const parsed = firecrawlResponseSchema.parse(await response.json());
    return normalizeFirecrawlData(parsed.data);
  }

  async scrape(url: string): Promise<ScrapedPage | null> {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    if (!response.ok) return null;
    const parsed = firecrawlScrapeSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.data) return null;
    const data = parsed.data.data;
    const markdown = data.markdown ?? '';
    if (!markdown) return null;
    return {
      url,
      title: data.metadata?.title ?? url,
      markdown: markdown.slice(0, 8000),
      description: data.metadata?.description ?? undefined,
    };
  }
}

export class BraveSearchClient implements WebSearchClient {
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': this.apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`Brave search failed with ${response.status}`);
    }
    return normalizeBraveData(await response.json());
  }

  async scrape(): Promise<ScrapedPage | null> {
    return null;
  }
}

export class FakeWebSearchClient implements WebSearchClient {
  constructor(
    private readonly results: SearchResult[] = [],
    private readonly scraped: Map<string, ScrapedPage> = new Map(),
  ) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const fallback = [{
      title: `Result for ${query}`,
      url: `https://example.com/${encodeURIComponent(query)}`,
      markdown: `Useful research content about ${query}.`,
      description: `Synthetic result for ${query}`,
    }];
    return (this.results.length ? this.results : fallback).slice(0, limit);
  }

  async scrape(url: string): Promise<ScrapedPage | null> {
    const hit = await this.scraped.get(url);
    if (hit) return hit;
    return {
      url,
      title: 'Synthetic page',
      markdown: `Synthetic content for ${url}.`,
    };
  }
}

export function createDefaultWebSearchClient(env: WebSearchClientEnv): WebSearchClient {
  if (env.WEB_SEARCH_ADAPTER === 'fake') {
    return new FakeWebSearchClient();
  }

  if (env.WEB_SEARCH_ADAPTER === 'firecrawl') {
    return env.FIRECRAWL_API_KEY ? new FirecrawlSearchClient(env.FIRECRAWL_API_KEY) : new FakeWebSearchClient();
  }

  if (env.BRAVE_SEARCH_API_KEY) {
    return new BraveSearchClient(env.BRAVE_SEARCH_API_KEY);
  }

  if (env.FIRECRAWL_API_KEY) {
    return new FirecrawlSearchClient(env.FIRECRAWL_API_KEY);
  }

  return new FakeWebSearchClient();
}
