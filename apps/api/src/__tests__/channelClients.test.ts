import { describe, expect, it, vi } from 'vitest';
import { GitHubChannelClient } from '../tools/channels/githubChannelClient.js';
import { ArxivChannelClient } from '../tools/channels/arxivChannelClient.js';
import { HackerNewsChannelClient } from '../tools/channels/hackernewsChannelClient.js';

describe('native research channel clients', () => {
  it('queries GitHub repository search and normalizes public repo results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            full_name: 'microsoft/autogen',
            html_url: 'https://github.com/microsoft/autogen',
            description: 'A framework for AI agents',
            stargazers_count: 42000,
            language: 'Python',
            updated_at: '2026-05-20T12:00:00Z',
          },
          { full_name: '', html_url: '', description: null },
        ],
      }),
    });

    const client = new GitHubChannelClient(fetchMock);
    const results = await client.search('agent workflow orchestration', 3);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/search/repositories?q=agent%20workflow%20orchestration&sort=stars&order=desc&per_page=3',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json', 'User-Agent': 'Cogentrex/1.0' }),
      }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        title: 'microsoft/autogen',
        url: 'https://github.com/microsoft/autogen',
        channel: 'github',
        description: 'A framework for AI agents',
      }),
    ]);
    expect(results[0]?.markdown).toContain('**Stars:** 42000');
    expect(results[0]?.markdown).toContain('**Language:** Python');
  });

  it('queries arXiv and normalizes Atom entries without HTML tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed>
          <entry>
            <title> Agentic Retrieval Systems </title>
            <id>http://arxiv.org/abs/2605.12345v1</id>
            <summary> We study &lt;b&gt;agentic&lt;/b&gt; retrieval. </summary>
            <published>2026-05-01T00:00:00Z</published>
            <author><name>Ada Lovelace</name></author>
            <author><name>Grace Hopper</name></author>
          </entry>
        </feed>`,
    });

    const client = new ArxivChannelClient(fetchMock);
    const results = await client.search('agentic retrieval', 5);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://export.arxiv.org/api/query?search_query=all%3Aagentic%20retrieval&start=0&max_results=5&sortBy=relevance&sortOrder=descending',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'Cogentrex/1.0' }) }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        title: 'Agentic Retrieval Systems',
        url: 'https://arxiv.org/abs/2605.12345v1',
        channel: 'arxiv',
        description: 'We study agentic retrieval.',
      }),
    ]);
    expect(results[0]?.markdown).toContain('**Authors:** Ada Lovelace, Grace Hopper');
    expect(results[0]?.markdown).toContain('We study agentic retrieval.');
  });

  it('queries Hacker News Algolia and skips results without usable URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            title: 'Show HN: Agent workflows',
            url: 'https://example.com/hn-agent-workflows',
            objectID: '123',
            points: 87,
            num_comments: 22,
            author: 'pg',
            created_at: '2026-05-21T08:00:00Z',
            _highlightResult: { title: { value: 'Show HN: <em>Agent</em> workflows' } },
          },
          { title: null, url: null, objectID: null },
        ],
      }),
    });

    const client = new HackerNewsChannelClient(fetchMock);
    const results = await client.search('agent workflows', 2);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hn.algolia.com/api/v1/search?query=agent%20workflows&tags=story&hitsPerPage=2',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'Cogentrex/1.0' }) }),
    );
    expect(results).toEqual([
      expect.objectContaining({
        title: 'Show HN: Agent workflows',
        url: 'https://example.com/hn-agent-workflows',
        channel: 'hackernews',
        description: 'Show HN: Agent workflows',
      }),
    ]);
    expect(results[0]?.markdown).toContain('**Points:** 87');
    expect(results[0]?.markdown).toContain('**Comments:** 22');
  });

  it('returns empty results instead of throwing when a channel provider fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(new GitHubChannelClient(fetchMock).search('rate limited', 1)).resolves.toEqual([]);
    await expect(new ArxivChannelClient(fetchMock).search('rate limited', 1)).resolves.toEqual([]);
    await expect(new HackerNewsChannelClient(fetchMock).search('rate limited', 1)).resolves.toEqual([]);
  });
});
