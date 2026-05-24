import type { ChannelClient, ChannelResult } from './channelClient.js';
import { decodeHtml, type FetchLike, normalizeLimit } from './channelUtils.js';

interface HackerNewsSearchResponse {
  hits?: Array<{
    title?: string | null;
    story_title?: string | null;
    url?: string | null;
    objectID?: string | null;
    points?: number | null;
    num_comments?: number | null;
    author?: string | null;
    created_at?: string | null;
    _highlightResult?: {
      title?: { value?: string };
      story_title?: { value?: string };
    };
  }>;
}

export class HackerNewsChannelClient implements ChannelClient {
  readonly name = 'hackernews';

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const hitsPerPage = normalizeLimit(limit, 10);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${hitsPerPage}`;
    try {
      const response = await this.fetchImpl(url, { headers: { 'User-Agent': 'Cogentrex/1.0' } });
      if (!response.ok) return [];
      const data = await response.json() as HackerNewsSearchResponse;
      return (data.hits ?? [])
        .filter((hit) => Boolean((hit.title ?? hit.story_title) && hit.url))
        .slice(0, hitsPerPage)
        .map((hit) => {
          const rawTitle = hit.title ?? hit.story_title ?? 'Untitled Hacker News story';
          const highlightedTitle = hit._highlightResult?.title?.value ?? hit._highlightResult?.story_title?.value ?? rawTitle;
          const title = decodeHtml(highlightedTitle);
          return {
            title,
            url: hit.url!,
            markdown: [
              `**Author:** ${hit.author ?? 'Unknown'}`,
              `**Points:** ${hit.points ?? 0}`,
              `**Comments:** ${hit.num_comments ?? 0}`,
              `**Created:** ${hit.created_at ?? 'Unknown'}`,
              '',
              title,
            ].join('\n'),
            description: title.slice(0, 240),
            channel: this.name,
          };
        });
    } catch {
      return [];
    }
  }
}
