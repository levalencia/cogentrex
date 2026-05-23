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

export interface WebFetchClient {
  scrape(url: string): Promise<ScrapedPage | null>;
}

export interface WebSearchClient extends WebFetchClient {
  search(query: string, limit: number): Promise<SearchResult[]>;
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
  SCRAPLING_BASE_URL?: string | undefined;
  WEB_SEARCH_ADAPTER?: 'brave' | 'firecrawl' | 'scrapling' | 'fake' | undefined;
  WEB_FETCH_ADAPTER?: 'scrapling' | 'firecrawl' | 'simple' | 'fake' | undefined;
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

const scraplingFetchResponseSchema = z.union([
  z.object({
    url: z.string().optional(),
    title: z.string().optional(),
    markdown: z.string().optional(),
    description: z.string().optional(),
  }).passthrough(),
  z.object({
    data: z.object({
      url: z.string().optional(),
      title: z.string().optional(),
      markdown: z.string().optional(),
      description: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough(),
]);

function normalizeScrapedPage(data: unknown, requestedUrl: string): ScrapedPage | null {
  const parsed = scraplingFetchResponseSchema.safeParse(data);
  if (!parsed.success) return null;
  const payload = ('data' in parsed.data && parsed.data.data ? parsed.data.data : parsed.data) as {
    url?: string | undefined;
    title?: string | undefined;
    markdown?: string | undefined;
    description?: string | undefined;
  };
  const markdown = typeof payload.markdown === 'string' ? payload.markdown : '';
  if (!markdown) return null;
  return {
    url: typeof payload.url === 'string' ? payload.url : requestedUrl,
    title: typeof payload.title === 'string' && payload.title ? payload.title : requestedUrl,
    markdown: markdown.slice(0, 8000),
    description: typeof payload.description === 'string' ? payload.description : undefined,
  };
}

function sidecarEndpoint(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase).toString();
}

export class CompositeWebSearchClient implements WebSearchClient {
  constructor(
    private readonly searchClient: Pick<WebSearchClient, 'search'>,
    private readonly fetchClient: WebFetchClient,
  ) {}

  get searchProviderName(): string {
    return describeSearchClient(this.searchClient);
  }

  get fetchProviderName(): string {
    return describeFetchClient(this.fetchClient);
  }

  search(query: string, limit: number): Promise<SearchResult[]> {
    return this.searchClient.search(query, limit);
  }

  scrape(url: string): Promise<ScrapedPage | null> {
    return this.fetchClient.scrape(url);
  }
}

export class FallbackWebSearchClient implements WebSearchClient {
  constructor(
    private readonly primary: WebSearchClient,
    private readonly fallback: Pick<WebSearchClient, 'search'>,
  ) {}

  get searchProviderName(): string {
    return `${describeSearchClient(this.primary)}→${describeSearchClient(this.fallback)}`;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    try {
      return await this.primary.search(query, limit);
    } catch {
      return await this.fallback.search(query, limit);
    }
  }

  scrape(url: string): Promise<ScrapedPage | null> {
    return this.primary.scrape(url);
  }
}

export class ScraplingFetchClient implements WebFetchClient {
  constructor(protected readonly baseUrl: string) {}

  async scrape(url: string): Promise<ScrapedPage | null> {
    const response = await fetch(sidecarEndpoint(this.baseUrl, 'fetch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) return null;
    return normalizeScrapedPage(await response.json(), url);
  }
}

const scraplingSearchResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    markdown: z.string().optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export class ScraplingSearchClient extends ScraplingFetchClient implements WebSearchClient {
  async search(query: string, limit: number): Promise<SearchResult[]> {
    const response = await fetch(sidecarEndpoint(this.baseUrl, 'search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) {
      throw new Error(`Scrapling search failed with ${response.status}`);
    }
    const parsed = scraplingSearchResponseSchema.parse(await response.json());
    return (parsed.results ?? []).flatMap((item) => {
      const url = item.url ?? '';
      const title = item.title ?? url;
      const markdown = item.markdown ?? item.description ?? '';
      if (!url || !markdown) return [];
      const result: SearchResult = { title, url, markdown };
      if (item.description) result.description = item.description;
      return [result];
    });
  }
}

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

export function describeSearchClient(client: Pick<WebSearchClient, 'search'>): string {
  if (client instanceof CompositeWebSearchClient) return client.searchProviderName;
  if (client instanceof FallbackWebSearchClient) return client.searchProviderName;
  if (client instanceof ScraplingSearchClient) return 'scrapling';
  if (client instanceof FirecrawlSearchClient) return 'firecrawl';
  if (client instanceof BraveSearchClient) return 'brave';
  if (client instanceof FakeWebSearchClient) return 'fake';
  return 'custom';
}

export function describeFetchClient(client: WebFetchClient): string {
  if (client instanceof CompositeWebSearchClient) return client.fetchProviderName;
  if (client instanceof ScraplingFetchClient) return 'scrapling';
  if (client instanceof FirecrawlSearchClient) return 'firecrawl';
  if (client instanceof FakeWebSearchClient) return 'fake';
  return 'custom';
}

export function createDefaultWebSearchClient(env: WebSearchClientEnv): WebSearchClient {
  const searchClient = createSearchClient(env);
  const fetchClient = createFetchClient(env);

  if (fetchClient && !(searchClient instanceof ScraplingSearchClient)) {
    return new CompositeWebSearchClient(searchClient, fetchClient);
  }

  return searchClient;
}

function createSearchClient(env: WebSearchClientEnv): WebSearchClient {
  if (env.WEB_SEARCH_ADAPTER === 'fake') {
    return new FakeWebSearchClient();
  }

  if (env.WEB_SEARCH_ADAPTER === 'scrapling') {
    if (!env.SCRAPLING_BASE_URL) return new FakeWebSearchClient();
    const scrapling = new ScraplingSearchClient(env.SCRAPLING_BASE_URL);
    return env.FIRECRAWL_API_KEY
      ? new FallbackWebSearchClient(scrapling, new FirecrawlSearchClient(env.FIRECRAWL_API_KEY))
      : scrapling;
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

  if (env.SCRAPLING_BASE_URL) {
    return new ScraplingSearchClient(env.SCRAPLING_BASE_URL);
  }

  return new FakeWebSearchClient();
}

function createFetchClient(env: WebSearchClientEnv): WebFetchClient | undefined {
  if (env.WEB_FETCH_ADAPTER === 'fake') {
    return new FakeWebSearchClient();
  }

  if (env.WEB_FETCH_ADAPTER === 'firecrawl') {
    return env.FIRECRAWL_API_KEY ? new FirecrawlSearchClient(env.FIRECRAWL_API_KEY) : new FakeWebSearchClient();
  }

  if ((env.WEB_FETCH_ADAPTER === undefined || env.WEB_FETCH_ADAPTER === 'scrapling') && env.SCRAPLING_BASE_URL) {
    return new ScraplingFetchClient(env.SCRAPLING_BASE_URL);
  }

  return undefined;
}
