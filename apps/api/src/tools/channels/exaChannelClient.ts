import type { ChannelClient, ChannelResult } from './channelClient.js';
import { decodeHtml, type FetchLike, normalizeLimit } from './channelUtils.js';

interface ExaSearchResponse {
  results?: Array<{
    title?: string | null;
    url?: string | null;
    text?: string | null;
    publishedDate?: string | null;
    author?: string | null;
    score?: number | null;
  }>;
}

export class ExaChannelClient implements ChannelClient {
  readonly name = 'exa';

  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    if (!this.apiKey) return [];
    const numResults = normalizeLimit(limit, 10);
    try {
      const response = await this.fetchImpl('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'User-Agent': 'Cogentrex/1.0',
        },
        body: JSON.stringify({
          query,
          numResults,
          contents: { text: { maxCharacters: 1000 } },
        }),
      });
      if (!response.ok) return [];
      const data = await response.json() as ExaSearchResponse;
      return (data.results ?? [])
        .filter((item) => Boolean(item.title && item.url))
        .slice(0, numResults)
        .map((item) => {
          const text = decodeHtml(item.text ?? '');
          const metadata = [
            item.author ? `**Author:** ${item.author}` : null,
            item.publishedDate ? `**Published:** ${item.publishedDate}` : null,
            typeof item.score === 'number' ? `**Relevance:** ${Math.round(item.score * 1000) / 1000}` : null,
          ].filter(Boolean).join('\n');
          return {
            title: decodeHtml(item.title!),
            url: item.url!,
            markdown: [metadata, text].filter(Boolean).join('\n\n'),
            description: text.slice(0, 240),
            channel: this.name,
          };
        });
    } catch {
      return [];
    }
  }
}
