import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BraveSearchClient,
  FakeWebSearchClient,
  FirecrawlSearchClient,
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
});
