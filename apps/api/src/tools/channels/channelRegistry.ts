import type { ChannelClient, ChannelResult } from './channelClient.js';

export class ChannelRegistry {
  private readonly channels = new Map<string, ChannelClient>();

  register(client: ChannelClient): void {
    this.channels.set(client.name, client);
  }

  get(name: string): ChannelClient | undefined {
    return this.channels.get(name);
  }

  names(): string[] {
    return Array.from(this.channels.keys());
  }

  async search(channelName: string, query: string, limit: number): Promise<ChannelResult[]> {
    const client = this.channels.get(channelName);
    if (!client) return [];
    return client.search(query, limit);
  }

  async searchAll(query: string, limit: number): Promise<ChannelResult[]> {
    const results: ChannelResult[] = [];
    for (const client of this.channels.values()) {
      try {
        const channelResults = await client.search(query, limit);
        results.push(...channelResults);
      } catch {
        // ignore channel failures
      }
    }
    return results;
  }
}
