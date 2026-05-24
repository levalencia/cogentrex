import type { ChannelClient, ChannelResult } from './channelClient.js';
import { decodeHtml, type FetchLike, normalizeLimit } from './channelUtils.js';

interface GitHubRepositorySearchResponse {
  items?: Array<{
    full_name?: string;
    html_url?: string;
    description?: string | null;
    stargazers_count?: number;
    language?: string | null;
    updated_at?: string | null;
  }>;
}

export class GitHubChannelClient implements ChannelClient {
  readonly name = 'github';

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const perPage = normalizeLimit(limit, 10);
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Cogentrex/1.0',
        },
      });
      if (!response.ok) return [];
      const data = await response.json() as GitHubRepositorySearchResponse;
      return (data.items ?? [])
        .filter((item) => Boolean(item.full_name && item.html_url))
        .slice(0, perPage)
        .map((item) => {
          const description = decodeHtml(item.description ?? '');
          return {
            title: item.full_name!,
            url: item.html_url!,
            markdown: [
              `**Repository:** ${item.full_name}`,
              `**Stars:** ${item.stargazers_count ?? 0}`,
              `**Language:** ${item.language ?? 'Unknown'}`,
              `**Updated:** ${item.updated_at ?? 'Unknown'}`,
              '',
              description,
            ].join('\n'),
            description: description.slice(0, 240),
            channel: this.name,
          };
        });
    } catch {
      return [];
    }
  }
}
