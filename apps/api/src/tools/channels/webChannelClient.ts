import type { ChannelClient, ChannelResult } from './channelClient.js';
import type { WebSearchClient } from '../searchClient.js';

export class WebChannelClient implements ChannelClient {
  readonly name = 'web';

  constructor(private readonly client: WebSearchClient) {}

  async search(query: string, limit: number): Promise<ChannelResult[]> {
    const results = await this.client.search(query, limit);
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      markdown: r.markdown,
      description: r.description,
      channel: this.name,
    }));
  }
}
