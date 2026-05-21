import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BraveSearchClient,
  CompositeWebSearchClient,
  FakeWebSearchClient,
  FirecrawlSearchClient,
  ScraplingFetchClient,
  createDefaultWebSearchClient,
} from '../tools/searchClient.js';

describe('BraveSearchClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries Brave web search with the subscription token and normalizes results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'Brave result',
              url: 'https://example.com/brave',
              description: 'Useful Brave snippet.',
            },
            {
              title: 'Missing URL',
              description: 'Should be ignored.',
            },
          ],
        },
      }),
    } as Response);

    const results = await new BraveSearchClient('brave-test-key').search('agent workflows', 3);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(url as string);
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
    expect(requestUrl.searchParams.get('q')).toBe('agent workflows');
    expect(requestUrl.searchParams.get('count')).toBe('3');
    expect((init as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      'X-Subscription-Token': 'brave-test-key',
    });
    expect(results).toEqual([
      {
        title: 'Brave result',
        url: 'https://example.com/brave',
        markdown: 'Useful Brave snippet.',
        description: 'Useful Brave snippet.',
      },
    ]);
  });

  it('throws a provider-specific error when Brave returns a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);

    await expect(new BraveSearchClient('brave-test-key').search('rate limited', 5)).rejects.toThrow('Brave search failed with 429');
  });
});

describe('ScraplingFetchClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts URLs to the Scrapling sidecar and normalizes fetched pages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://example.com/article',
        title: 'Fetched article',
        markdown: 'Fetched markdown body',
        description: 'Fetched description',
      }),
    } as Response);

    const page = await new ScraplingFetchClient('http://scrapling.test:8000').scrape('https://example.com/article');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://scrapling.test:8000/fetch');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ url: 'https://example.com/article' });
    expect(page).toEqual({
      url: 'https://example.com/article',
      title: 'Fetched article',
      markdown: 'Fetched markdown body',
      description: 'Fetched description',
    });
  });

  it('returns null when the Scrapling sidecar cannot fetch usable markdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'No body' }) } as Response);

    await expect(new ScraplingFetchClient('http://scrapling.test:8000').scrape('https://example.com/empty')).resolves.toBeNull();
  });
});

describe('createDefaultWebSearchClient', () => {
  it('uses Brave by default when BRAVE_SEARCH_API_KEY is configured', () => {
    const client = createDefaultWebSearchClient({
      BRAVE_SEARCH_API_KEY: 'brave-test-key',
      FIRECRAWL_API_KEY: 'firecrawl-test-key',
      WEB_SEARCH_ADAPTER: undefined,
    });

    expect(client).toBeInstanceOf(BraveSearchClient);
  });

  it('can explicitly fall back to Firecrawl or fake search', () => {
    expect(createDefaultWebSearchClient({
      BRAVE_SEARCH_API_KEY: 'brave-test-key',
      FIRECRAWL_API_KEY: 'firecrawl-test-key',
      WEB_SEARCH_ADAPTER: 'firecrawl',
    })).toBeInstanceOf(FirecrawlSearchClient);

    expect(createDefaultWebSearchClient({
      BRAVE_SEARCH_API_KEY: 'brave-test-key',
      FIRECRAWL_API_KEY: 'firecrawl-test-key',
      WEB_SEARCH_ADAPTER: 'fake',
    })).toBeInstanceOf(FakeWebSearchClient);
  });

  it('uses Brave search and Scrapling fetch together when both defaults are configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ web: { results: [{ title: 'Brave', url: 'https://example.com', description: 'Snippet' }] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com', title: 'Fetched', markdown: 'Fetched body' }),
      } as Response);

    const client = createDefaultWebSearchClient({
      BRAVE_SEARCH_API_KEY: 'brave-test-key',
      SCRAPLING_BASE_URL: 'http://scrapling.test:8000',
    });

    expect(client).toBeInstanceOf(CompositeWebSearchClient);
    await expect(client.search('agent workflows', 1)).resolves.toHaveLength(1);
    await expect(client.scrape('https://example.com')).resolves.toEqual(expect.objectContaining({ markdown: 'Fetched body' }));

    expect(fetchMock.mock.calls[0]![0]).toContain('api.search.brave.com');
    expect(fetchMock.mock.calls[1]![0]).toBe('http://scrapling.test:8000/fetch');
  });
});
